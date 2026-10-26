import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

/**
 * Maps every thrown error to a meaningful status + JSON body. Unknown errors
 * are logged in full but return a generic message, so internals never leak.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const send = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, ...(details !== undefined && { details }) } });

  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);

  // Malformed JSON body (thrown by express.json()).
  if (err instanceof SyntaxError && "body" in err) return send(400, "INVALID_JSON", "Request body is not valid JSON");

  // Upload problems (thrown by multer).
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return send(413, "FILE_TOO_LARGE", "Files must be 5 MB or smaller");
    return send(422, "VALIDATION_FAILED", "Upload one file in the 'file' field", [{ field: "file", message: err.message }]);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return send(404, "NOT_FOUND", "Resource not found");
    if (err.code === "P2002") return send(409, "CONFLICT", "A record with these details already exists");
    if (err.code === "P2003") return send(422, "INVALID_REFERENCE", "A referenced record does not exist");
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  return send(500, "INTERNAL_ERROR", "Something went wrong on our side. Please try again.");
}
