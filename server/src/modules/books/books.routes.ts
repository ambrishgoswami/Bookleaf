import { Router } from "express";
import { z } from "zod";
import { parse } from "../../lib/validation.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { toCsv } from "../../lib/csv.js";
import * as booksService from "./books.service.js";

const ListQuery = z.object({ authorId: z.string().min(1).optional() });
const IdParams = z.object({ id: z.string().min(1) });

const money = z.number().int("Use whole rupees").min(0);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const BookFields = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  isbn: z.string().trim().min(10, "Enter a valid ISBN").max(20),
  genre: z.string().trim().min(1, "Genre is required").max(100),
  status: z.enum(booksService.BOOK_STATUSES as [string, ...string[]], "Choose a valid status"),
  publicationDate: z.iso.date("Use YYYY-MM-DD").nullable().default(null),
  mrp: money.nullable().default(null),
  royaltyPerCopy: money.nullable().default(null),
  copiesSold: money.default(0),
  royaltyEarned: money.default(0),
  royaltyPaid: money.default(0),
  printPartner: nullableText(100).default(null),
  availableOn: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});

const CreateBookBody = BookFields.extend({ authorId: z.string().min(1, "Author is required") });

// PATCH: every field optional and without defaults, so omitted fields are left unchanged.
const UpdateBookBody = z
  .object(Object.fromEntries(Object.entries(BookFields.shape).map(([k, v]) => [k, (v as z.ZodType).optional()])) as {
    [K in keyof typeof BookFields.shape]: z.ZodOptional<(typeof BookFields.shape)[K]>;
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: "Provide at least one field to update" });

const PayoutBody = z.object({
  amount: z.number().int("Use whole rupees").positive("Amount must be positive"),
  date: z.iso.date("Use YYYY-MM-DD").optional(),
});

export const booksRouter = Router();

booksRouter.get("/", async (req, res) => {
  res.json(await booksService.listBooks(currentUser(req), parse(ListQuery, req.query)));
});

/** Royalty statement as CSV: authors get their own; admins pass ?authorId. */
booksRouter.get("/statement.csv", async (req, res) => {
  const { data, summary } = await booksService.listBooks(currentUser(req), parse(ListQuery, req.query));
  const csv = toCsv(
    ["Code", "Title", "ISBN", "Status", "Published", "MRP (INR)", "Royalty per copy (INR)", "Copies sold", "Royalty earned (INR)", "Royalty paid (INR)", "Royalty pending (INR)", "Last payout"],
    [
      ...data.map((b) => [b.code, b.title, b.isbn, b.status, b.publicationDate, b.mrp, b.royaltyPerCopy, b.copiesSold, b.royaltyEarned, b.royaltyPaid, b.royaltyPending, b.lastRoyaltyPayoutDate]),
      ["", "Total", "", "", "", "", "", summary.totalCopiesSold, summary.totalRoyaltyEarned, summary.totalRoyaltyPaid, summary.totalRoyaltyPending, ""],
    ],
  );
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="royalty-statement-${new Date().toISOString().slice(0, 10)}.csv"` }).send(csv);
});

/** Valid statuses for the admin book form. */
booksRouter.get("/statuses", (_req, res) => {
  res.json({ data: booksService.BOOK_STATUSES });
});

booksRouter.get("/:id", async (req, res) => {
  const { id } = parse(IdParams, req.params);
  res.json({ data: await booksService.getBook(currentUser(req), id) });
});

// --- Admin management -------------------------------------------------------

booksRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const { authorId, ...book } = parse(CreateBookBody, req.body);
  const created = await booksService.createBook(authorId, book);
  res.status(201).location(`/api/v1/books/${created.id}`).json({ data: created });
});

booksRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const { id } = parse(IdParams, req.params);
  res.json({ data: await booksService.updateBook(id, parse(UpdateBookBody, req.body)) });
});

booksRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  await booksService.deleteBook(parse(IdParams, req.params).id);
  res.status(204).end();
});

booksRouter.post("/:id/payouts", requireRole("ADMIN"), async (req, res) => {
  const { id } = parse(IdParams, req.params);
  const { amount, date } = parse(PayoutBody, req.body);
  res.json({ data: await booksService.recordPayout(id, amount, date) });
});
