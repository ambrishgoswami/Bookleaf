/**
 * Saved replies ("macros") for the support team: CRUD plus a usage counter so
 * the most useful replies float to the top.
 */
import { Router } from "express";
import { z } from "zod";
import { TicketCategory } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFound } from "../../lib/errors.js";
import { parse } from "../../lib/validation.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { CATEGORY_LABELS } from "../../domain/taxonomy.js";

const MacroBody = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(80),
  body: z.string().trim().min(10, "Reply must be at least 10 characters").max(5000),
  category: z.enum(TicketCategory).nullish().transform((v) => v ?? null),
});
const UpdateBody = MacroBody.partial().refine((b) => Object.values(b).some((v) => v !== undefined), { message: "Provide at least one field to update" });
const IdParams = z.object({ id: z.string().min(1) });

const select = {
  id: true,
  title: true,
  body: true,
  category: true,
  usageCount: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

type MacroRow = { category: TicketCategory | null; updatedAt: Date } & Record<string, unknown>;
const toDto = (m: MacroRow) => ({ ...m, categoryLabel: m.category ? CATEGORY_LABELS[m.category] : null, updatedAt: m.updatedAt.toISOString() });

async function exists(id: string) {
  if (!(await prisma.macro.count({ where: { id } }))) throw NotFound("Saved reply");
}

export const macrosRouter = Router();
macrosRouter.use(requireRole("ADMIN"));

macrosRouter.get("/", async (_req, res) => {
  const rows = await prisma.macro.findMany({ select, orderBy: [{ usageCount: "desc" }, { title: "asc" }] });
  res.json({ data: rows.map(toDto) });
});

macrosRouter.post("/", async (req, res) => {
  const created = await prisma.macro.create({ data: { ...parse(MacroBody, req.body), createdById: currentUser(req).id }, select });
  res.status(201).json({ data: toDto(created) });
});

macrosRouter.patch("/:id", async (req, res) => {
  const { id } = parse(IdParams, req.params);
  await exists(id);
  const updated = await prisma.macro.update({ where: { id }, data: parse(UpdateBody, req.body), select });
  res.json({ data: toDto(updated) });
});

macrosRouter.delete("/:id", async (req, res) => {
  const { id } = parse(IdParams, req.params);
  await exists(id);
  await prisma.macro.delete({ where: { id } });
  res.status(204).end();
});

/** Called when an admin inserts the macro into a reply. */
macrosRouter.post("/:id/use", async (req, res) => {
  const { id } = parse(IdParams, req.params);
  await exists(id);
  await prisma.macro.update({ where: { id }, data: { usageCount: { increment: 1 } } });
  res.status(204).end();
});
