import { Router } from "express";
import { z } from "zod";
import { parse } from "../../lib/validation.js";
import { currentUser } from "../../middleware/auth.js";
import * as booksService from "./books.service.js";

const ListQuery = z.object({ authorId: z.string().min(1).optional() });
const IdParams = z.object({ id: z.string().min(1) });

export const booksRouter = Router();

booksRouter.get("/", async (req, res) => {
  res.json(await booksService.listBooks(currentUser(req), parse(ListQuery, req.query)));
});

booksRouter.get("/:id", async (req, res) => {
  const { id } = parse(IdParams, req.params);
  res.json({ data: await booksService.getBook(currentUser(req), id) });
});
