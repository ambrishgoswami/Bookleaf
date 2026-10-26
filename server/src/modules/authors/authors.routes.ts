import { Router } from "express";
import { z } from "zod";
import { parse } from "../../lib/validation.js";
import { requireRole } from "../../middleware/auth.js";
import { PasswordSchema } from "../auth/auth.routes.js";
import * as authors from "./authors.service.js";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive", "all"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const CreateBody = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.email("Enter a valid email address").trim(),
  phone: optionalText(30),
  city: optionalText(80),
  /** Optional — if omitted, a one-time password is generated and returned once. */
  password: PasswordSchema.optional(),
});

const UpdateBody = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.email("Enter a valid email address").trim().optional(),
    phone: optionalText(30).optional(),
    city: optionalText(80).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: "Provide at least one field to update" });

const IdParams = z.object({ id: z.string().min(1) });

export const authorsRouter = Router();
authorsRouter.use(requireRole("ADMIN"));

authorsRouter.get("/", async (req, res) => {
  res.json(await authors.listAuthors(parse(ListQuery, req.query)));
});

authorsRouter.post("/", async (req, res) => {
  const result = await authors.createAuthor(parse(CreateBody, req.body));
  res.status(201).location(`/api/v1/authors/${result.author.id}`).json({ data: result.author, temporaryPassword: result.temporaryPassword });
});

authorsRouter.get("/:id", async (req, res) => {
  res.json({ data: await authors.getAuthor(parse(IdParams, req.params).id) });
});

authorsRouter.patch("/:id", async (req, res) => {
  const { id } = parse(IdParams, req.params);
  res.json({ data: await authors.updateAuthor(id, parse(UpdateBody, req.body)) });
});

authorsRouter.post("/:id/reset-password", async (req, res) => {
  res.json(await authors.resetAuthorPassword(parse(IdParams, req.params).id));
});
