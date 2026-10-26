/**
 * Express app factory — kept separate from `index.ts` (which listens) so tests
 * can exercise the full HTTP stack with supertest without opening a port.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { booksRouter } from "./modules/books/books.routes.js";
import { adminsRouter, ticketsRouter } from "./modules/tickets/tickets.routes.js";
import { eventsRouter } from "./modules/events/events.routes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // behind Render's proxy — needed for correct client IPs in rate limiting
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: "100kb" }));
  if (!env.isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/v1/health" } }));

  app.get("/api/v1/health", (_req, res) => res.json({ status: "ok" }));

  // Public
  app.use("/api/v1/auth", authRouter);

  // Everything below requires a valid token.
  const api = express.Router();
  api.use(authenticate);
  api.use("/books", booksRouter);
  api.use("/tickets", ticketsRouter);
  api.use("/admins", adminsRouter);
  api.use("/events", eventsRouter);
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
