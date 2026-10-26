import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { NotFound, Unauthorized, ValidationFailed } from "../../lib/errors.js";
import { signToken, type AuthUser } from "./auth.tokens.js";

// Compared against when the email doesn't exist, so a wrong email and a wrong
// password take the same time (no user enumeration via response timing).
const DUMMY_HASH = bcrypt.hashSync("timing-safe-dummy-password", 10);
export const BCRYPT_ROUNDS = 10;

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  author: { select: { id: true, code: true, city: true, phone: true, joinedDate: true } },
} as const;

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { ...userSelect, passwordHash: true, isActive: true },
  });

  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) throw Unauthorized("Incorrect email or password");
  // Only revealed after a correct password, so it doesn't leak which emails exist.
  if (!user.isActive) throw Unauthorized("This account has been deactivated. Please contact BookLeaf support.");

  const { passwordHash: _hash, isActive: _active, ...profile } = user;
  const identity: AuthUser = { id: user.id, role: user.role, authorId: user.author?.id ?? null };
  return { token: signToken(identity), user: profile };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) throw NotFound("User");
  return user;
}

/** Self-service profile edits. Email and role are changed by admins only. */
export async function updateProfile(user: AuthUser, input: { name?: string; phone?: string | null; city?: string | null }) {
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(user.authorId &&
        (input.phone !== undefined || input.city !== undefined) && {
          author: { update: { ...(input.phone !== undefined && { phone: input.phone }), ...(input.city !== undefined && { city: input.city }) } },
        }),
    },
  });
  return getProfile(user.id);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw NotFound("User");
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ValidationFailed([{ field: "currentPassword", message: "Current password is incorrect" }]);
  }
  if (currentPassword === newPassword) {
    throw ValidationFailed([{ field: "newPassword", message: "Choose a password different from the current one" }]);
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) } });
}
