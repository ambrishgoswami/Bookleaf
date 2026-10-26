/**
 * The single gateway for every LLM call in the app.
 *
 * Responsibilities:
 * - Failover across providers in a configured order (AI_PROVIDERS, e.g.
 *   "anthropic,gemini"): if the first is down, rate-limited or out of credits,
 *   the next one answers. Only when all fail do callers fall back to rules/templates.
 * - A circuit breaker per provider, so an outage doesn't add a timeout to
 *   every request.
 * - Schema validation of every response (Zod), whatever the provider.
 * - Observability: every call (success or failure) is logged to AiCallLog with
 *   model, token usage, cache hits and latency.
 *
 * API keys are read from the environment on the server only.
 */
import type { z } from "zod";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { createDefaultAnthropicProvider } from "./providers/anthropic.js";
import { createDefaultGeminiProvider } from "./providers/gemini.js";
import { AiUnavailableError, type AiFailureReason, type LlmProvider, type LlmUsage } from "./providers/types.js";

export { AiUnavailableError, type AiFailureReason } from "./providers/types.js";

// ---------------------------------------------------------------------------
// Circuit breaker (one per provider)
// ---------------------------------------------------------------------------

class CircuitBreaker {
  private consecutiveFailures = 0;
  private openUntil = 0;
  static readonly FAILURE_THRESHOLD = 3;
  static readonly COOLDOWN_MS = 60_000;
  static readonly AUTH_COOLDOWN_MS = 5 * 60_000; // a bad key won't fix itself in a minute

  isOpen() {
    return Date.now() < this.openUntil;
  }
  openUntilIso() {
    return this.isOpen() ? new Date(this.openUntil).toISOString() : null;
  }
  success() {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }
  /** Returns true if this failure opened the circuit. */
  failure(reason: AiFailureReason) {
    // Content-level failures (refusal, bad output) don't indicate an outage.
    if (reason === "refusal" || reason === "invalid_output" || reason === "truncated") return false;
    const wasOpen = this.isOpen();
    this.consecutiveFailures += 1;
    if (reason === "auth") this.openUntil = Date.now() + CircuitBreaker.AUTH_COOLDOWN_MS;
    else if (this.consecutiveFailures >= CircuitBreaker.FAILURE_THRESHOLD) this.openUntil = Date.now() + CircuitBreaker.COOLDOWN_MS;
    return !wasOpen && this.isOpen();
  }
}

// ---------------------------------------------------------------------------
// Provider chain
// ---------------------------------------------------------------------------

interface ChainEntry {
  provider: LlmProvider;
  breaker: CircuitBreaker;
}

function providersFromEnv(): LlmProvider[] {
  const factories: Record<string, () => LlmProvider | null> = {
    anthropic: () => (env.ANTHROPIC_API_KEY ? createDefaultAnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : null),
    gemini: () => (env.GEMINI_API_KEY ? createDefaultGeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL) : null),
  };
  return env.aiProviders.map((name) => factories[name]?.() ?? null).filter((p): p is LlmProvider => p !== null);
}

let chain: ChainEntry[] = [];
export function setProviders(providers: LlmProvider[]) {
  chain = providers.map((provider) => ({ provider, breaker: new CircuitBreaker() }));
}
setProviders(providersFromEnv());

export const aiEnabled = () => chain.length > 0;

export function aiStatus() {
  const providers = chain.map(({ provider, breaker }) => ({
    name: provider.name,
    model: provider.model,
    available: !breaker.isOpen(),
    circuitOpenUntil: breaker.openUntilIso(),
  }));
  const active = providers.find((p) => p.available);
  return {
    configured: chain.length > 0,
    available: Boolean(active),
    /** The model that will answer the next call. */
    model: active?.model ?? providers[0]?.model ?? null,
    providers,
  };
}

// ---------------------------------------------------------------------------
// Structured call with failover
// ---------------------------------------------------------------------------

export interface StructuredCall<S extends z.ZodType> {
  operation: "classify" | "draft";
  ticketId?: string;
  /** Stable instructions + knowledge — cached across calls. Must not contain per-request data. */
  system: string;
  /** Per-request content (ticket, account facts, today's date). */
  user: string;
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  timeoutMs: number;
}

export interface StructuredResult<T> {
  data: T;
  provider: LlmProvider["name"];
  model: string;
}

export async function callStructured<S extends z.ZodType>(call: StructuredCall<S>): Promise<StructuredResult<z.infer<S>>> {
  if (chain.length === 0) throw new AiUnavailableError("not_configured");

  let lastReason: AiFailureReason = "circuit_open";
  for (const { provider, breaker } of chain) {
    if (breaker.isOpen()) continue;

    const started = Date.now();
    let usage: LlmUsage | undefined;
    try {
      const result = await provider.generate(call);
      usage = result.usage;
      const parsed = call.schema.safeParse(result.output);
      if (!parsed.success) throw new AiUnavailableError("invalid_output");

      breaker.success();
      await logCall(call, provider, true, null, usage, started);
      return { data: parsed.data, provider: provider.name, model: provider.model };
    } catch (err) {
      const reason: AiFailureReason = err instanceof AiUnavailableError ? err.reason : "unknown";
      lastReason = reason;
      if (breaker.failure(reason)) logger.warn({ provider: provider.name }, "AI circuit breaker opened");
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : err instanceof Error ? err.message : String(err);
      logger.warn({ provider: provider.name, model: provider.model, reason, operation: call.operation, ticketId: call.ticketId, detail: cause }, "LLM call failed");
      await logCall(call, provider, false, reason, usage, started);
    }
  }
  throw new AiUnavailableError(lastReason);
}

async function logCall(
  call: StructuredCall<z.ZodType>,
  provider: LlmProvider,
  success: boolean,
  errorType: string | null,
  usage: LlmUsage | undefined,
  started: number,
) {
  try {
    await prisma.aiCallLog.create({
      data: {
        ticketId: call.ticketId ?? null,
        operation: call.operation,
        model: provider.model,
        success,
        errorType,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cacheReadTokens: usage?.cacheReadTokens ?? 0,
        cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
        latencyMs: Date.now() - started,
      },
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write AI call log"); // observability must never break the request
  }
}
