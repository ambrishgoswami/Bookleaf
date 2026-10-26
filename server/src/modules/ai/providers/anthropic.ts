import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiUnavailableError, type AiFailureReason, type LlmProvider, type LlmRequest } from "./types.js";

type MessagesClient = Pick<Anthropic, "messages">;

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

/**
 * Claude via `messages.parse`: the SDK enforces the Zod schema as structured
 * output. The system prompt carries an explicit cache breakpoint, so the
 * Knowledge Base is read from cache (~10% of input price) after the first call.
 */
export function createAnthropicProvider(client: MessagesClient, model: string): LlmProvider {
  return {
    name: "anthropic",
    model,
    async generate(req: LlmRequest) {
      try {
        const response = await client.messages.parse(
          {
            model,
            max_tokens: req.maxTokens,
            system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: req.user }],
            output_config: { effort: req.effort, format: zodOutputFormat(req.schema) },
          },
          { timeout: req.timeoutMs },
        );
        if (response.stop_reason === "refusal") throw new AiUnavailableError("refusal");
        if (response.stop_reason === "max_tokens") throw new AiUnavailableError("truncated");
        if (response.parsed_output == null) throw new AiUnavailableError("invalid_output");

        const u = response.usage;
        return {
          output: response.parsed_output,
          usage: {
            inputTokens: u.input_tokens,
            outputTokens: u.output_tokens,
            cacheReadTokens: u.cache_read_input_tokens ?? 0,
            cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
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

export const createDefaultAnthropicProvider = (apiKey: string, model: string) =>
  createAnthropicProvider(new Anthropic({ apiKey, maxRetries: 2 }), model); // SDK retries 429/5xx with backoff
