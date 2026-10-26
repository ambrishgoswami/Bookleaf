import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { parse } from "../../lib/validation.js";
import { requireRole } from "../../middleware/auth.js";
import { aiStatus } from "./llm.js";
import { getOrCreateDraft } from "./drafts.service.js";
import type { Pricing } from "./providers/types.js";

/**
 * USD per million tokens, for the usage report's cost estimate. Cache reads and
 * writes are multipliers of the input price. Unknown models report null cost.
 * Gemini uses the post-promotional list price so estimates err high.
 */
const PRICING: Record<string, Pricing> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.1, cacheWrite: 1.25 },
  "gemini-3.6-flash": { input: 1.5, output: 7.5, cacheRead: 0.1, cacheWrite: 0 },
};

const DraftBody = z.object({
  regenerate: z.boolean().default(false),
  guidance: z.string().trim().max(500).optional(),
});
const UsageQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });
const IdParams = z.object({ id: z.string().min(1) });

/** Mounted at /tickets — POST /tickets/:id/draft */
export const draftRouter = Router();
draftRouter.post("/:id/draft", requireRole("ADMIN"), async (req, res) => {
  const { id } = parse(IdParams, req.params);
  const { regenerate, guidance } = parse(DraftBody, req.body ?? {});
  res.json({ data: await getOrCreateDraft(id, { regenerate: regenerate || Boolean(guidance), guidance }) });
});

/** Mounted at /ai */
export const aiRouter = Router();
aiRouter.use(requireRole("ADMIN"));

aiRouter.get("/status", (_req, res) => {
  res.json({ data: aiStatus() });
});

aiRouter.get("/usage", async (req, res) => {
  const { days } = parse(UsageQuery, req.query);
  const since = new Date(Date.now() - days * 86_400_000);

  const [byOperation, failures, ticketsByDecision] = await Promise.all([
    prisma.aiCallLog.groupBy({
      by: ["operation", "model"],
      where: { createdAt: { gte: since } },
      _count: true,
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true },
      _avg: { latencyMs: true },
    }),
    prisma.aiCallLog.groupBy({ by: ["errorType"], where: { createdAt: { gte: since }, success: false }, _count: true }),
    prisma.ticket.groupBy({ by: ["categorySource"], where: { createdAt: { gte: since } }, _count: true }),
  ]);

  const operations = byOperation.map((row) => {
    const t = row._sum;
    const price = PRICING[row.model];
    const costUsd = price
      ? ((t.inputTokens ?? 0) * price.input +
          (t.cacheReadTokens ?? 0) * price.input * price.cacheRead +
          (t.cacheWriteTokens ?? 0) * price.input * price.cacheWrite +
          (t.outputTokens ?? 0) * price.output) /
        1_000_000
      : null;
    const totalInput = (t.inputTokens ?? 0) + (t.cacheReadTokens ?? 0) + (t.cacheWriteTokens ?? 0);
    return {
      operation: row.operation,
      model: row.model,
      calls: row._count,
      tokens: t,
      cacheHitRatio: totalInput ? Number(((t.cacheReadTokens ?? 0) / totalInput).toFixed(3)) : 0,
      avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
      estimatedCostUsd: costUsd === null ? null : Number(costUsd.toFixed(5)),
    };
  });

  res.json({
    data: {
      periodDays: days,
      operations,
      failures: Object.fromEntries(failures.map((f) => [f.errorType ?? "unknown", f._count])),
      // How tickets got their category: AI vs rules fallback vs admin override.
      classificationSources: Object.fromEntries(ticketsByDecision.map((r) => [r.categorySource ?? "PENDING", r._count])),
    },
  });
});
