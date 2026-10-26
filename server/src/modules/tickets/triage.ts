/**
 * Ticket triage: assigns category + priority after a ticket is created.
 *
 * Runs *after* the ticket is persisted and the author has their 201 response,
 * so ticket creation never waits on — or fails because of — the AI provider.
 */
import type { DecisionSource } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { publish } from "../../lib/events.js";
import { classifyWithRules, type Classification } from "../ai/fallbackClassifier.js";
import { AiUnavailableError } from "../ai/llm.js";

/** Pluggable so the AI classifier can be swapped in (and stubbed in tests). */
export type Classifier = (ticketId: string) => Promise<Classification | null>;

let aiClassifier: Classifier | null = null;
export function setAiClassifier(classifier: Classifier | null) {
  aiClassifier = classifier;
}

export async function triageTicket(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { subject: true, description: true, authorId: true },
  });
  if (!ticket) return;

  let result: Classification | null = null;
  let source: DecisionSource = "AI";
  try {
    result = aiClassifier ? await aiClassifier(ticketId) : null;
  } catch (err) {
    // Provider failures are already logged in detail by the LLM gateway.
    if (err instanceof AiUnavailableError) logger.info({ ticketId, reason: err.reason }, "Using rule-based fallback");
    else logger.error({ err, ticketId }, "AI classification crashed — using rule-based fallback");
  }
  if (!result) {
    result = classifyWithRules(ticket.subject, ticket.description);
    source = "FALLBACK";
  }

  // Only fill fields an admin hasn't already set: a manual override always wins,
  // even if the admin acted while classification was still in flight.
  await prisma.$transaction([
    prisma.ticket.updateMany({
      where: { id: ticketId, categorySource: null },
      data: { category: result.category, categorySource: source },
    }),
    prisma.ticket.updateMany({
      where: { id: ticketId, prioritySource: null },
      data: { priority: result.priority, prioritySource: source },
    }),
    prisma.ticket.update({ where: { id: ticketId }, data: { aiReasoning: result.reasoning } }),
  ]);

  // Not internal: the author sees the category label on their ticket.
  publish({ type: "ticket.updated", ticketId, authorId: ticket.authorId, internal: false });
}

/** Fire-and-forget wrapper for request handlers. */
export function triageInBackground(ticketId: string) {
  triageTicket(ticketId).catch((err) => logger.error({ err, ticketId }, "Triage failed"));
}
