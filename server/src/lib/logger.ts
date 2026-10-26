import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.isTest ? "silent" : "info",
  // Never log credentials or tokens.
  redact: ["req.headers.authorization", "*.password", "*.passwordHash"],
  transport: env.isProduction ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
