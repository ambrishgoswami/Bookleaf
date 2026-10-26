/**
 * Provider abstraction: each LLM vendor implements `generate` and maps its own
 * SDK errors to an AiFailureReason. The gateway (llm.ts) owns everything else —
 * failover order, circuit breakers, validation and logging — so adding a vendor
 * is one small file.
 */
import type { z } from "zod";

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

export interface LlmRequest {
  /** Stable instructions + knowledge (cacheable). */
  system: string;
  /** Per-request content. */
  user: string;
  schema: z.ZodType;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  timeoutMs: number;
}

export interface LlmUsage {
  /** Uncached input tokens. */
  inputTokens: number;
  /** Output tokens, including any thinking tokens. */
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LlmResult {
  /** Parsed JSON — validated against the schema by the gateway. */
  output: unknown;
  usage: LlmUsage;
}

export interface LlmProvider {
  name: "anthropic" | "gemini";
  model: string;
  /** Throws AiUnavailableError (with a reason) on any failure. */
  generate(req: LlmRequest): Promise<LlmResult>;
}

/** USD per million tokens; cache reads/writes as multipliers of the input price. */
export interface Pricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
