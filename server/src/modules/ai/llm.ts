/**
 * The single gateway for every LLM call in the app.
 *
 * Responsibilities:
 * - Structured output: responses are validated against a Zod schema by the SDK
 *   (`messages.parse` + `zodOutputFormat`), so callers get typed data or an error,
 *   never half-parsed JSON.
 * - Failure taxonomy: every failure becomes an `AiUnavailableError` with a reason
 *   (rate_limited, timeout, refusal, ...) so callers can fall back uniformly.
 * - Circuit breaker: after repeated failures we stop calling the provider for a
 *   cool-down period, so an outage doesn't add a timeout to every request.
 * - Observability: every call (success or failure) is logged to AiCallLog with
 *   token usage, cache hits and latency.
 *
 * The API key is read from the environment on the server only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";

export type AiFailureReason =
  | "not_configured"
  | "circuit_open"
  | "rate_limited"
  | "timeout"
  | "network"
  | "auth"
  | "provider_error"
  | "bad_request"
  | "refusal"
  | "truncated"
  | "invalid_output"
  | "unknown";

export class AiUnavailableError extends Error {
  constructor(public readonly reason: AiFailureReason) {
    super(`AI unavailable: ${reason}`);
    this.name = "AiUnavailableError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

type LlmClient = Pick<Anthropic, "messages">;

let client: LlmClient | null = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 }) // SDK retries 429/5xx with backoff
  : null;

export const aiEnabled = () => client !== null;

/** Test hook: inject a fake client (or null to simulate "no API key"). */
export function setLlmClient(next: LlmClient | null) {
  client = next;
  breaker.reset();
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

const breaker = {
  consecutiveFailures: 0,
  openUntil: 0,
  FAILURE_THRESHOLD: 3,
  COOLDOWN_MS: 60_000,
  AUTH_COOLDOWN_MS: 5 * 60_000, // a bad key won't fix itself in a minute

  isOpen() {
    return Date.now() < this.openUntil;
  },
  success() {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  },
  failure(reason: AiFailureReason) {
    // Content-level failures (refusal, bad output) don't indicate an outage.
    if (reason === "refusal" || reason === "invalid_output" || reason === "truncated") return;
    this.consecutiveFailures += 1;
    if (reason === "auth") this.openUntil = Date.now() + this.AUTH_COOLDOWN_MS;
    else if (this.consecutiveFailures >= this.FAILURE_THRESHOLD) this.openUntil = Date.now() + this.COOLDOWN_MS;
    if (this.isOpen()) logger.warn({ reason, until: new Date(this.openUntil) }, "AI circuit breaker opened");
  },
  reset() {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  },
};

export function aiStatus() {
  return {
    configured: client !== null,
    model: env.ANTHROPIC_MODEL,
    available: client !== null && !breaker.isOpen(),
    circuitOpenUntil: breaker.isOpen() ? new Date(breaker.openUntil).toISOString() : null,
  };
}

/** Maps SDK exceptions to a reason. Most specific classes first (subclasses before parents). */
function failureReason(err: unknown): AiFailureReason {
  if (err instanceof AiUnavailableError) return err.reason;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (err instanceof Anthropic.APIConnectionError) return "network";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "auth";
  if (err instanceof Anthropic.BadRequestError) return "bad_request";
  if (err instanceof Anthropic.InternalServerError) return "provider_error";
  if (err instanceof Anthropic.APIError) return (err.status ?? 0) >= 500 ? "provider_error" : "bad_request";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Structured call
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

export async function callStructured<S extends z.ZodType>(call: StructuredCall<S>): Promise<z.infer<S>> {
  if (!client) throw new AiUnavailableError("not_configured");
  if (breaker.isOpen()) throw new AiUnavailableError("circuit_open");

  const started = Date.now();
  let usage: Anthropic.Usage | undefined;

  try {
    const response = await client.messages.parse(
      {
        model: env.ANTHROPIC_MODEL,
        max_tokens: call.maxTokens,
        // Cache breakpoint on the system prompt: the KB + instructions are
        // identical across tickets, so after the first call they're read from
        // cache at a fraction of the input price.
        system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: call.user }],
        output_config: { effort: call.effort, format: zodOutputFormat(call.schema) },
      },
      { timeout: call.timeoutMs },
    );
    usage = response.usage;

    if (response.stop_reason === "refusal") throw new AiUnavailableError("refusal");
    if (response.stop_reason === "max_tokens") throw new AiUnavailableError("truncated");
    if (response.parsed_output == null) throw new AiUnavailableError("invalid_output");

    breaker.success();
    await logCall(call, true, null, usage, started);
    return response.parsed_output as z.infer<S>;
  } catch (err) {
    const reason = failureReason(err);
    breaker.failure(reason);
    logger.warn(
      { reason, operation: call.operation, ticketId: call.ticketId, detail: err instanceof Error ? err.message : String(err) },
      "LLM call failed",
    );
    await logCall(call, false, reason, usage, started);
    throw err instanceof AiUnavailableError ? err : new AiUnavailableError(reason);
  }
}

async function logCall(
  call: StructuredCall<z.ZodType>,
  success: boolean,
  errorType: string | null,
  usage: Anthropic.Usage | undefined,
  started: number,
) {
  try {
    await prisma.aiCallLog.create({
      data: {
        ticketId: call.ticketId ?? null,
        operation: call.operation,
        model: env.ANTHROPIC_MODEL,
        success,
        errorType,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
        latencyMs: Date.now() - started,
      },
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write AI call log"); // observability must never break the request
  }
}
