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
  // AI providers, tried in this order. Each is optional: without any key, AI
  // features degrade to rule-based classification and template drafts.
  AI_PROVIDERS: z.string().default("anthropic,gemini"),
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => v || undefined),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-5-5"),
  GEMINI_API_KEY: z.string().optional().transform((v) => v || undefined),
  GOOGLE_API_KEY: z.string().optional().transform((v) => v || undefined), // accepted alias
  GEMINI_MODEL: z.string().default("gemini-3.6-flash"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  GEMINI_API_KEY: parsed.data.GEMINI_API_KEY ?? parsed.data.GOOGLE_API_KEY,
  aiProviders: parsed.data.AI_PROVIDERS.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean),
  // A bare host (as Render's blueprint provides) is treated as https.
  corsOrigins: parsed.data.CORS_ORIGIN.split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .map((o) => (/^https?:\/\//.test(o) ? o : `https://${o}`)),
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
};
