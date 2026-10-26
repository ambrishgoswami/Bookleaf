/**
 * Author account management (admin only). Accounts are deactivated, never
 * deleted, so their tickets and royalty history remain intact.
 */
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Conflict, NotFound } from "../../lib/errors.js";
import { nextCode, temporaryPassword } from "../../lib/codes.js";
import { PUBLISHED_STATUS, toISODate } from "../../domain/policy.js";
import { BCRYPT_ROUNDS } from "../auth/auth.service.js";
import { summarize, toBookDto } from "../books/books.service.js";
import { reference } from "../tickets/tickets.dto.js";

const ACTIVE_TICKET = { status: { in: ["OPEN", "IN_PROGRESS"] as ("OPEN" | "IN_PROGRESS")[] } };

export interface ListAuthorsInput {
  q?: string;
  status: "active" | "inactive" | "all";
  page: number;
  pageSize: number;
}

export async function listAuthors(input: ListAuthorsInput) {
  const where: Prisma.AuthorWhereInput = {
    ...(input.status !== "all" && { user: { isActive: input.status === "active" } }),
    ...(input.q && {
      OR: [
        { code: { contains: input.q, mode: "insensitive" } },
        { city: { contains: input.q, mode: "insensitive" } },
        { user: { name: { contains: input.q, mode: "insensitive" } } },
        { user: { email: { contains: input.q, mode: "insensitive" } } },
        { books: { some: { title: { contains: input.q, mode: "insensitive" } } } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.author.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true } },
        books: { select: { status: true, royaltyPending: true } },
        _count: { select: { tickets: { where: ACTIVE_TICKET } } },
      },
    }),
    prisma.author.count({ where }),
  ]);

  return {
    data: rows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.user.name,
      email: a.user.email,
      phone: a.phone,
      city: a.city,
      joinedDate: toISODate(a.joinedDate),
      isActive: a.user.isActive,
      bookCount: a.books.length,
      publishedCount: a.books.filter((b) => b.status === PUBLISHED_STATUS).length,
      totalRoyaltyPending: a.books.reduce((s, b) => s + b.royaltyPending, 0),
      activeTickets: a._count.tickets,
    })),
    meta: { page: input.page, pageSize: input.pageSize, total },
  };
}

export async function getAuthor(authorId: string) {
  const a = await prisma.author.findUnique({
    where: { id: authorId },
    include: {
      user: { select: { id: true, name: true, email: true, isActive: true, createdAt: true } },
      books: { orderBy: [{ publicationDate: { sort: "desc", nulls: "first" } }, { title: "asc" }] },
      tickets: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true },
      },
    },
  });
  if (!a) throw NotFound("Author");

  const books = a.books.map(toBookDto);
  return {
    id: a.id,
    code: a.code,
    userId: a.user.id,
    name: a.user.name,
    email: a.user.email,
    phone: a.phone,
    city: a.city,
    joinedDate: toISODate(a.joinedDate),
    isActive: a.user.isActive,
    books,
    summary: summarize(books),
    tickets: a.tickets.map((t) => ({ ...t, reference: reference(t.number), createdAt: t.createdAt.toISOString() })),
  };
}

export interface CreateAuthorInput {
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  password?: string;
}

/** Creates the login + author profile. Returns a one-time password if none was given. */
export async function createAuthor(input: CreateAuthorInput) {
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw Conflict("An account with this email already exists");
  }

  const generated = input.password ? null : temporaryPassword();
  const codes = await prisma.author.findMany({ select: { code: true } });
  const author = await prisma.author.create({
    data: {
      code: nextCode("AUTH", codes.map((c) => c.code)),
      phone: input.phone ?? null,
      city: input.city ?? null,
      joinedDate: new Date(new Date().toISOString().slice(0, 10)),
      user: {
        create: {
          email,
          name: input.name,
          role: "AUTHOR",
          passwordHash: await bcrypt.hash(input.password ?? generated!, BCRYPT_ROUNDS),
        },
      },
    },
  });
  return { author: await getAuthor(author.id), temporaryPassword: generated };
}

export interface UpdateAuthorInput {
  name?: string;
  email?: string;
  phone?: string | null;
  city?: string | null;
  isActive?: boolean;
}

export async function updateAuthor(authorId: string, input: UpdateAuthorInput) {
  const existing = await prisma.author.findUnique({ where: { id: authorId }, select: { userId: true } });
  if (!existing) throw NotFound("Author");

  if (input.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() }, select: { id: true } });
    if (clash && clash.id !== existing.userId) throw Conflict("An account with this email already exists");
  }

  await prisma.author.update({
    where: { id: authorId },
    data: {
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.city !== undefined && { city: input.city }),
      user: {
        update: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.email !== undefined && { email: input.email.toLowerCase() }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      },
    },
  });
  return getAuthor(authorId);
}

/** Admin-initiated password reset: returns a new one-time password. */
export async function resetAuthorPassword(authorId: string) {
  const author = await prisma.author.findUnique({ where: { id: authorId }, select: { userId: true } });
  if (!author) throw NotFound("Author");
  const password = temporaryPassword();
  await prisma.user.update({ where: { id: author.userId }, data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) } });
  return { temporaryPassword: password };
}
