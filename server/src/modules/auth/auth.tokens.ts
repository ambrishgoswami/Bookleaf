import jwt, { type SignOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../../config/env.js";
import { Unauthorized } from "../../lib/errors.js";

/** Identity carried in the JWT and attached to `req.user`. */
export interface AuthUser {
  id: string;
  role: Role;
  /** Set only for authors — scopes every author query to their own data. */
  authorId: string | null;
}

interface TokenClaims {
  sub: string;
  role: Role;
  authorId: string | null;
}

export function signToken(user: AuthUser): string {
  const claims: TokenClaims = { sub: user.id, role: user.role, authorId: user.authorId };
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] });
}

export function verifyToken(token: string): AuthUser {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET) as TokenClaims;
    return { id: claims.sub, role: claims.role, authorId: claims.authorId };
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    throw Unauthorized(expired ? "Session expired — please log in again" : "Invalid authentication token");
  }
}
