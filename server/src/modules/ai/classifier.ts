import { buildTicketContext } from "./context.js";
import { callStructured } from "./llm.js";
import { CLASSIFY_SYSTEM, ClassificationSchema, classifyUserPrompt } from "./prompts.js";
import type { Classification } from "./fallbackClassifier.js";

/**
 * LLM ticket classification. Classification is a narrow decision, so it runs
 * with low effort, a small output budget and without the full Knowledge Base —
 * just the taxonomy, a priority rubric and the account facts.
 * Throws AiUnavailableError on failure; the caller (triage) falls back to rules.
 */
export async function classifyTicketWithAi(ticketId: string): Promise<Classification> {
  const ctx = await buildTicketContext(ticketId);
  const { data } = await callStructured({
    operation: "classify",
    ticketId,
    system: CLASSIFY_SYSTEM,
    user: classifyUserPrompt(ctx),
    schema: ClassificationSchema,
    effort: "low",
    maxTokens: 2000,
    timeoutMs: 20_000,
  });
  return data;
}
