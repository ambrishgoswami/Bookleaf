/**
 * Interactive API docs: Swagger UI at /api/docs, raw spec at /api/docs/openapi.json.
 * The spec lives in openapi.yaml at the server root.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { parse } from "yaml";

const specPath = join(dirname(fileURLToPath(import.meta.url)), "..", "openapi.yaml");
const spec = parse(readFileSync(specPath, "utf8")) as Record<string, unknown>;

export const docsRouter = Router();
docsRouter.get("/openapi.json", (_req, res) => res.json(spec));
docsRouter.use("/", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "BookLeaf API docs" }));
