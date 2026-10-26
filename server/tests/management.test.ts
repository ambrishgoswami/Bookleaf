/**
 * Admin CRUD (authors, books, payouts), self-service profile/password,
 * account deactivation and ticket attachments.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { setAiClassifier } from "../src/modules/tickets/triage.js";
import { ADMIN, AUTHOR, app, tokenFor } from "./helpers.js";

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const uniqueEmail = () => `test.author.${Date.now()}.${Math.round(Math.random() * 1e6)}@example.com`;

let adminToken: string;
let authorToken: string;
const createdUserEmails: string[] = [];
const createdTicketIds: string[] = [];

beforeAll(async () => {
  setAiClassifier(null);
  [adminToken, authorToken] = await Promise.all([tokenFor(ADMIN), tokenFor(AUTHOR)]);
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  // Test authors only: cascades to their author profile and books.
  await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
});

async function createAuthor(body: Record<string, unknown> = {}) {
  const email = uniqueEmail();
  createdUserEmails.push(email);
  return request(app).post("/api/v1/authors").set(as(adminToken)).send({ name: "Test Author", email, city: "Pune", ...body });
}

const publishedBook = (authorId: string) => ({
  authorId,
  title: "Test Book",
  isbn: "978-93-00000-00-0",
  genre: "Fiction",
  status: "Published & Live",
  publicationDate: "2025-01-15",
  mrp: 300,
  royaltyPerCopy: 30,
  copiesSold: 100,
  royaltyEarned: 3000,
  royaltyPaid: 1000,
  availableOn: ["Amazon India"],
});

describe("authors (admin CRUD)", () => {
  it("is admin-only", async () => {
    expect((await request(app).get("/api/v1/authors").set(as(authorToken))).status).toBe(403);
  });

  it("lists authors with stats and supports search", async () => {
    const res = await request(app).get("/api/v1/authors?q=priya").set(as(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ code: "AUTH001", name: "Priya Sharma", bookCount: 2, totalRoyaltyPending: 3570, isActive: true });
  });

  it("creates an author with the next code and a one-time password that works", async () => {
    const res = await createAuthor();
    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^AUTH\d{3}$/);
    expect(res.body.temporaryPassword).toEqual(expect.any(String));

    const login = await request(app).post("/api/v1/auth/login").send({ email: res.body.data.email, password: res.body.temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("AUTHOR");
  });

  it("rejects a duplicate email with 409", async () => {
    const res = await request(app).post("/api/v1/authors").set(as(adminToken)).send({ name: "Dup", email: "priya.sharma@email.com" });
    expect(res.status).toBe(409);
  });

  it("deactivation blocks login and revokes existing tokens immediately", async () => {
    const created = await createAuthor({ password: "Initial123" });
    const token = (await request(app).post("/api/v1/auth/login").send({ email: created.body.data.email, password: "Initial123" })).body.token;
    expect((await request(app).get("/api/v1/books").set(as(token))).status).toBe(200);

    const off = await request(app).patch(`/api/v1/authors/${created.body.data.id}`).set(as(adminToken)).send({ isActive: false });
    expect(off.body.data.isActive).toBe(false);

    expect((await request(app).get("/api/v1/books").set(as(token))).status).toBe(401);
    const relogin = await request(app).post("/api/v1/auth/login").send({ email: created.body.data.email, password: "Initial123" });
    expect(relogin.status).toBe(401);
    expect(relogin.body.error.message).toMatch(/deactivated/);
  });

  it("resets a password", async () => {
    const created = await createAuthor();
    const reset = await request(app).post(`/api/v1/authors/${created.body.data.id}/reset-password`).set(as(adminToken));
    const login = await request(app).post("/api/v1/auth/login").send({ email: created.body.data.email, password: reset.body.temporaryPassword });
    expect(login.status).toBe(200);
  });
});

describe("books (admin CRUD + payouts)", () => {
  let authorId: string;
  beforeAll(async () => {
    authorId = (await createAuthor()).body.data.id;
  });

  it("creates a book with derived pending royalty", async () => {
    const res = await request(app).post("/api/v1/books").set(as(adminToken)).send(publishedBook(authorId));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ code: expect.stringMatching(/^BK\d{3}$/), royaltyPending: 2000, isPublished: true });
  });

  it("enforces business rules with field-level errors", async () => {
    const res = await request(app)
      .post("/api/v1/books")
      .set(as(adminToken))
      .send({ ...publishedBook(authorId), mrp: null, royaltyPaid: 5000 });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(["mrp", "royaltyPaid"]);

    const badStatus = await request(app).post("/api/v1/books").set(as(adminToken)).send({ ...publishedBook(authorId), status: "Somewhere" });
    expect(badStatus.status).toBe(422);
  });

  it("updates only the fields sent (moving a book through production)", async () => {
    const created = await request(app)
      .post("/api/v1/books")
      .set(as(adminToken))
      .send({ authorId, title: "Draft", isbn: "978-93-00000-01-7", genre: "Poetry", status: "In Production - Cover Design" });
    const res = await request(app).patch(`/api/v1/books/${created.body.data.id}`).set(as(adminToken)).send({ status: "In Production - Typesetting" });
    expect(res.body.data).toMatchObject({ title: "Draft", production: { stage: "Typesetting" } });
  });

  it("records a payout atomically and refuses to overpay", async () => {
    const book = (await request(app).post("/api/v1/books").set(as(adminToken)).send(publishedBook(authorId))).body.data;
    const ok = await request(app).post(`/api/v1/books/${book.id}/payouts`).set(as(adminToken)).send({ amount: 1500, date: "2026-10-01" });
    expect(ok.body.data).toMatchObject({ royaltyPaid: 2500, royaltyPending: 500, lastRoyaltyPayoutDate: "2026-10-01" });

    const over = await request(app).post(`/api/v1/books/${book.id}/payouts`).set(as(adminToken)).send({ amount: 501 });
    expect(over.status).toBe(422);
  });

  it("deletes a book without sales, but not one with royalty history", async () => {
    const fresh = await request(app)
      .post("/api/v1/books")
      .set(as(adminToken))
      .send({ authorId, title: "Tmp", isbn: "978-93-00000-02-4", genre: "Misc", status: "In Production - Manuscript Received" });
    expect((await request(app).delete(`/api/v1/books/${fresh.body.data.id}`).set(as(adminToken))).status).toBe(204);

    const sold = (await request(app).post("/api/v1/books").set(as(adminToken)).send(publishedBook(authorId))).body.data;
    expect((await request(app).delete(`/api/v1/books/${sold.id}`).set(as(adminToken))).status).toBe(409);
  });

  it("is admin-only for writes", async () => {
    expect((await request(app).post("/api/v1/books").set(as(authorToken)).send(publishedBook(authorId))).status).toBe(403);
  });
});

describe("profile & password (self-service)", () => {
  it("updates own profile", async () => {
    const created = await createAuthor({ password: "Initial123" });
    const token = (await request(app).post("/api/v1/auth/login").send({ email: created.body.data.email, password: "Initial123" })).body.token;
    const res = await request(app).patch("/api/v1/auth/me").set(as(token)).send({ name: "Renamed Author", city: "Nagpur", phone: "" });
    expect(res.body.user).toMatchObject({ name: "Renamed Author", author: { city: "Nagpur", phone: null } });
  });

  it("changes password only with the correct current password and a strong new one", async () => {
    const created = await createAuthor({ password: "Initial123" });
    const email = created.body.data.email;
    const token = (await request(app).post("/api/v1/auth/login").send({ email, password: "Initial123" })).body.token;

    const wrong = await request(app).post("/api/v1/auth/change-password").set(as(token)).send({ currentPassword: "nope", newPassword: "Another123" });
    expect(wrong.status).toBe(422);
    const weak = await request(app).post("/api/v1/auth/change-password").set(as(token)).send({ currentPassword: "Initial123", newPassword: "short" });
    expect(weak.status).toBe(422);

    const ok = await request(app).post("/api/v1/auth/change-password").set(as(token)).send({ currentPassword: "Initial123", newPassword: "Another123" });
    expect(ok.status).toBe(204);
    expect((await request(app).post("/api/v1/auth/login").send({ email, password: "Another123" })).status).toBe(200);
  });
});

describe("attachments", () => {
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  let ticketId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/v1/tickets")
      .set(as(authorToken))
      .send({ subject: "Blurry print photos", description: "Attaching photos of the blurry pages in my author copies." });
    ticketId = res.body.data.id;
    createdTicketIds.push(ticketId);
  });

  it("uploads a valid file and lists it on the ticket for author and admin", async () => {
    const res = await request(app).post(`/api/v1/tickets/${ticketId}/attachments`).set(as(authorToken)).attach("file", PNG, { filename: "page 40.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ filename: "page 40.png", mimeType: "image/png", sizeBytes: PNG.length });

    const admin = await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(adminToken));
    expect(admin.body.data.attachments).toHaveLength(1);
  });

  it("downloads only for the owner or an admin", async () => {
    const ticket = await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(authorToken));
    const url = `/api/v1/tickets/${ticketId}/attachments/${ticket.body.data.attachments[0].id}`;

    const own = await request(app).get(url).set(as(authorToken)).buffer(true);
    expect(own.status).toBe(200);
    expect(own.headers["content-disposition"]).toContain("attachment;");
    expect(Buffer.compare(own.body, PNG)).toBe(0);

    const other = await tokenFor({ email: "rohit.kapoor@email.com", password: "Author@123" });
    expect((await request(app).get(url).set(as(other))).status).toBe(404);
  });

  it("rejects a file whose content doesn't match its type", async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set(as(authorToken))
      .attach("file", Buffer.from("MZ fake executable"), { filename: "photo.png", contentType: "image/png" });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].message).toMatch(/valid PNG/);
  });

  it("rejects unsupported types and oversize files", async () => {
    const exe = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set(as(authorToken))
      .attach("file", Buffer.from("hello"), { filename: "notes.txt", contentType: "text/plain" });
    expect(exe.status).toBe(422);

    const big = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(5 * 1024 * 1024)]);
    const tooBig = await request(app).post(`/api/v1/tickets/${ticketId}/attachments`).set(as(authorToken)).attach("file", big, { filename: "big.pdf", contentType: "application/pdf" });
    expect(tooBig.status).toBe(413);
  });
});
