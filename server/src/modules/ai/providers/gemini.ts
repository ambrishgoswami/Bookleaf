import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";
import { AiUnavailableError, type AiFailureReason, type LlmProvider, type LlmRequest } from "./types.js";

type ModelsClient = Pick<GoogleGenAI, "models">;

function failureReason(err: unknown): AiFailureReason {
  if (err instanceof AiUnavailableError) return err.reason;
  if (err instanceof ApiError) {
    if (err.status === 429) return "rate_limited";
    if (err.status === 401 || err.status === 403) return "auth";
    if (err.status === 408 || err.status === 504) return "timeout";
    return err.status >= 500 ? "provider_error" : "bad_request";
  }
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) return "timeout";
  if (err instanceof TypeError) return "network"; // fetch failed
  return "unknown";
}

const BLOCKED: (FinishReason | undefined)[] = [
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
];

/**
 * Gemini 3 models take a thinking *level*; Gemini 2.5 models take a token
 * budget. Both map from the same effort setting.
 */
function thinkingConfig(model: string, effort: LlmRequest["effort"]): GenerateContentConfig["thinkingConfig"] {
  if (/^gemini-2\./.test(model)) return { thinkingBudget: { low: 0, medium: 1024, high: 4096 }[effort] };
  return { thinkingLevel: { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH }[effort] };
}

/**
 * Gemini via `generateContent` with a JSON response schema. Gemini caches
 * repeated prompt prefixes implicitly, so the stable system instruction gets
 * the same caching benefit without an explicit breakpoint.
 */
export function createGeminiProvider(client: ModelsClient, model: string): LlmProvider {
  return {
    name: "gemini",
    model,
    async generate(req: LlmRequest) {
      try {
        const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(req.schema) as Record<string, unknown>;
        const response = await client.models.generateContent({
          model,
          contents: req.user,
          config: {
            systemInstruction: req.system,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            maxOutputTokens: req.maxTokens,
            thinkingConfig: thinkingConfig(model, req.effort),
            abortSignal: AbortSignal.timeout(req.timeoutMs),
            httpOptions: { retryOptions: { attempts: 3 } }, // retries 429/5xx with backoff
          },
        });

        const finish = response.candidates?.[0]?.finishReason;
        if (response.promptFeedback?.blockReason || BLOCKED.includes(finish)) throw new AiUnavailableError("refusal");
        if (finish === FinishReason.MAX_TOKENS) throw new AiUnavailableError("truncated");

        let output: unknown;
        try {
          output = JSON.parse(response.text ?? "");
        } catch {
          throw new AiUnavailableError("invalid_output");
        }

        const u = response.usageMetadata ?? {};
        const cached = u.cachedContentTokenCount ?? 0;
        return {
          output,
          usage: {
            inputTokens: (u.promptTokenCount ?? 0) - cached,
            outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
            cacheReadTokens: cached,
            cacheWriteTokens: 0, // implicit caching has no write surcharge
          },
        };
      } catch (err) {
        if (err instanceof AiUnavailableError) throw err;
        const wrapped = new AiUnavailableError(failureReason(err));
        wrapped.cause = err;
        throw wrapped;
      }
    },
  };
}

export const createDefaultGeminiProvider = (apiKey: string, model: string) => createGeminiProvider(new GoogleGenAI({ apiKey }), model);
