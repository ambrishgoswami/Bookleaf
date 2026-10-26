/**
 * Validated runtime configuration. The process fails fast on boot if anything
 * required is missing, instead of failing later on the first request.
 */
import { z } from "zod";

try {
  process.loadEnvFile(); // local dev: reads .env; in production vars come from the host
} catch {
  // no .env file — fine
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("12h"),
  // Comma-separated list of allowed browser origins.
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Optional: without a key, AI features degrade to rule-based fallbacks.
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => v || undefined),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-5-5"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGIN.split(",").map((o) => o.trim()),
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
};
