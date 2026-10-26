import type { z } from "zod";
import { ValidationFailed } from "./errors.js";

/**
 * Parses untrusted input against a schema, throwing a 422 with field-level
 * details on failure. Used at the top of every handler that reads input, so
 * the rest of the handler works with fully typed, trusted data.
 */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw ValidationFailed(
      result.error.issues.map((issue) => ({ field: issue.path.join(".") || null, message: issue.message })),
    );
  }
  return result.data;
}
