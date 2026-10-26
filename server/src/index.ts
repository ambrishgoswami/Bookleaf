import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { aiEnabled } from "./modules/ai/llm.js";
import { classifyTicketWithAi } from "./modules/ai/classifier.js";
import { setAiClassifier } from "./modules/tickets/triage.js";

// Wired here (not in createApp) so tests run deterministically on the rule-based path.
if (aiEnabled()) setAiClassifier(classifyTicketWithAi);

const server = createApp().listen(env.PORT, () => {
  logger.info(`BookLeaf API listening on :${env.PORT} (AI ${env.ANTHROPIC_API_KEY ? "enabled" : "disabled — using fallbacks"})`);
});

// Graceful shutdown: stop accepting connections, then release the DB pool.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
  });
}
