/**
 * Typed application errors. Services throw these; the error middleware turns
 * them into a consistent JSON shape:
 *
 *   { "error": { "code": "NOT_FOUND", "message": "Ticket not found", "details": ... } }
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const BadRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);

export const ValidationFailed = (details: unknown) =>
  new AppError(422, "VALIDATION_FAILED", "Request validation failed", details);

export const Unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHORIZED", message);

export const Forbidden = (message = "You do not have access to this resource") =>
  new AppError(403, "FORBIDDEN", message);

export const NotFound = (resource: string) => new AppError(404, "NOT_FOUND", `${resource} not found`);

export const Conflict = (message: string) => new AppError(409, "CONFLICT", message);
