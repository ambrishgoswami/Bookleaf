import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { NotFound, Unauthorized } from "../../lib/errors.js";
import { signToken, type AuthUser } from "./auth.tokens.js";

// Compared against when the email doesn't exist, so a wrong email and a wrong
// password take the same time (no user enumeration via response timing).
const DUMMY_HASH = bcrypt.hashSync("timing-safe-dummy-password", 10);

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  author: { select: { id: true, code: true, city: true, joinedDate: true } },
} as const;

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { ...userSelect, passwordHash: true },
  });

  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) throw Unauthorized("Incorrect email or password");

  const { passwordHash: _omit, ...profile } = user;
  const identity: AuthUser = { id: user.id, role: user.role, authorId: user.author?.id ?? null };
  return { token: signToken(identity), user: profile };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) throw NotFound("User");
  return user;
}
