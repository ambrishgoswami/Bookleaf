/**
 * Authentication + role-based access control.
 *
 * - `authenticate` verifies the Bearer JWT and attaches `req.user`.
 * - `requireRole` gates a route to specific roles.
 * Ownership checks ("this author owns this ticket") live in the services,
 * because they need the resource from the database.
 */
import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { Forbidden, Unauthorized } from "../lib/errors.js";
import { verifyToken, type AuthUser } from "../modules/auth/auth.tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw Unauthorized();
  req.user = verifyToken(header.slice("Bearer ".length));
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw Unauthorized();
    if (!roles.includes(req.user.role)) throw Forbidden();
    next();
  };

/** For handlers behind `authenticate` — narrows `req.user` to non-null. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw Unauthorized();
  return req.user;
}
