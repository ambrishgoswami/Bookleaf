/**
 * AI-drafted responses for admins.
 *
 * Cost strategy: a draft is generated lazily (only when an admin opens the
 * ticket), stored, and reused on every later open. It is regenerated only when
 * (a) the conversation has moved on since it was written, (b) the last draft
 * was a template because AI was down, or (c) the admin explicitly asks.
 */
import type { AiDraft, TicketCategory } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { buildTicketContext } from "./context.js";
import { classifyWithRules } from "./fallbackClassifier.js";
import { AiUnavailableError, aiStatus, callStructured, type AiFailureReason } from "./llm.js";
import { DRAFT_SYSTEM, DraftSchema, draftUserPrompt } from "./prompts.js";
import { templateDraft } from "./templates.js";

export interface DraftOptions {
  regenerate?: boolean;
  /** Optional steer from the admin, e.g. "shorter" or "mention we've escalated already". */
  guidance?: string;
}

const toDto = (d: AiDraft, extra: { cached: boolean; aiError: AiFailureReason | null }) => ({
  source: d.source,
  body: d.body,
  suggestedActions: d.suggestedActions,
  model: d.model,
  generatedAt: d.updatedAt.toISOString(),
  ...extra,
});

export async function getOrCreateDraft(ticketId: string, opts: DraftOptions = {}) {
  const ctx = await buildTicketContext(ticketId); // also 404s for unknown tickets
  const existing = await prisma.aiDraft.findUnique({ where: { ticketId } });

  const isFresh = existing && existing.messageCount === ctx.messageCount;
  const canRetryAi = existing?.source === "TEMPLATE" && aiStatus().available;
  if (existing && isFresh && !opts.regenerate && !canRetryAi) {
    return toDto(existing, { cached: true, aiError: null });
  }

  // Triage may still be running for a brand-new ticket — use the rules as a hint.
  const category: TicketCategory = ctx.categoryHint ?? classifyWithRules(ctx.subject, ctx.description).category;

  let draft: { reply: string; suggestedActions: string[] };
  let source: "AI" | "TEMPLATE" = "AI";
  let aiError: AiFailureReason | null = null;
  try {
    draft = await callStructured({
      operation: "draft",
      ticketId,
      system: DRAFT_SYSTEM,
      user: draftUserPrompt(ctx, category, new Date(), opts.guidance),
      schema: DraftSchema,
      effort: "medium",
      maxTokens: 6000,
      timeoutMs: 45_000,
    });
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    draft = templateDraft(category, ctx.authorFirstName);
    source = "TEMPLATE";
    aiError = err.reason;
  }

  const data = {
    source,
    body: draft.reply.trim(),
    suggestedActions: draft.suggestedActions.slice(0, 4),
    model: source === "AI" ? env.ANTHROPIC_MODEL : null,
    messageCount: ctx.messageCount,
  };
  const saved = await prisma.aiDraft.upsert({ where: { ticketId }, update: data, create: { ticketId, ...data } });
  return toDto(saved, { cached: false, aiError });
}
