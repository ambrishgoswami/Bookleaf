import { Router } from "express";
import { z } from "zod";
import { parse } from "../../lib/validation.js";
import { NotFound } from "../../lib/errors.js";
import { CATEGORY_LABELS } from "../../domain/taxonomy.js";
import { HELP_ARTICLES, searchArticles, type HelpArticle } from "../../domain/helpArticles.js";

const SearchQuery = z.object({
  q: z.string().trim().max(500).default(""),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

const toDto = (a: HelpArticle) => ({ ...a, categoryLabel: CATEGORY_LABELS[a.category] });

/** Help Center: self-service answers from the Knowledge Base. Any signed-in user. */
export const helpRouter = Router();

helpRouter.get("/articles", (req, res) => {
  const { q, limit } = parse(SearchQuery, req.query);
  res.json({ data: searchArticles(q, limit).map(toDto) });
});

helpRouter.get("/articles/:slug", (req, res) => {
  const article = HELP_ARTICLES.find((a) => a.slug === req.params.slug);
  if (!article) throw NotFound("Article");
  res.json({ data: toDto(article) });
});
