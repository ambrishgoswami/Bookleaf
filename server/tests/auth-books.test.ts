import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, AUTHOR, AUTHOR_IN_PRODUCTION, app, tokenFor } from "./helpers.js";

describe("POST /api/v1/auth/login", () => {
  it("returns a token and profile for valid credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send(AUTHOR);
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: AUTHOR.email, role: "AUTHOR", author: { code: "AUTH001" } });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("is case-insensitive on email", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ ...AUTHOR, email: AUTHOR.email.toUpperCase() });
    expect(res.status).toBe(200);
  });

  it("rejects a wrong password with the same message as an unknown email", async () => {
    const wrongPw = await request(app).post("/api/v1/auth/login").send({ ...AUTHOR, password: "nope" });
    const noUser = await request(app).post("/api/v1/auth/login").send({ email: "ghost@x.com", password: "nope" });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(noUser.body.error.message);
  });

  it("returns field-level validation errors", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(["email", "password"]);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});

describe("authentication middleware", () => {
  it("rejects requests without a token", async () => {
    const res = await request(app).get("/api/v1/books");
    expect(res.status).toBe(401);
  });

  it("rejects a tampered token", async () => {
    const res = await request(app).get("/api/v1/books").set("Authorization", "Bearer abc.def.ghi");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/books (role-based scoping)", () => {
  let authorToken: string;
  let adminToken: string;

  beforeAll(async () => {
    [authorToken, adminToken] = await Promise.all([tokenFor(AUTHOR), tokenFor(ADMIN)]);
  });

  it("scopes an author to their own books, with a royalty summary", async () => {
    const res = await request(app).get("/api/v1/books").set("Authorization", `Bearer ${authorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((b: { code: string }) => b.code).sort()).toEqual(["BK001", "BK002"]);
    expect(res.body.summary).toMatchObject({ totalRoyaltyPending: 3570, payout: { meetsThreshold: true } });
  });

  it("ignores an authorId filter from an author (cannot widen scope)", async () => {
    const all = await request(app).get("/api/v1/books").set("Authorization", `Bearer ${adminToken}`);
    const otherAuthorId = all.body.data.find((b: { code: string }) => b.code === "BK003").id;
    const res = await request(app)
      .get(`/api/v1/books?authorId=${otherAuthorId}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(res.body.data.every((b: { code: string }) => ["BK001", "BK002"].includes(b.code))).toBe(true);
  });

  it("returns 404 when an author requests another author's book", async () => {
    const all = await request(app).get("/api/v1/books").set("Authorization", `Bearer ${adminToken}`);
    const otherBook = all.body.data.find((b: { code: string }) => b.code === "BK003");
    const res = await request(app).get(`/api/v1/books/${otherBook.id}`).set("Authorization", `Bearer ${authorToken}`);
    expect(res.status).toBe(404);
  });

  it("lets admins see all 18 books", async () => {
    const res = await request(app).get("/api/v1/books").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.data).toHaveLength(18);
  });

  it("represents in-production books without pricing or a publication date", async () => {
    const token = await tokenFor(AUTHOR_IN_PRODUCTION);
    const res = await request(app).get("/api/v1/books").set("Authorization", `Bearer ${token}`);
    const book = res.body.data.find((b: { code: string }) => b.code === "BK015");
    expect(book).toMatchObject({
      isPublished: false,
      mrp: null,
      publicationDate: null,
      production: { stage: "Typesetting" },
      availableOn: [],
    });
  });
});

describe("unknown routes", () => {
  it("return a JSON 404 (after auth, so route names are not revealed to anonymous callers)", async () => {
    const anon = await request(app).get("/api/v1/nope");
    expect(anon.status).toBe(401);
    const res = await request(app).get("/api/v1/nope").set("Authorization", `Bearer ${await tokenFor(ADMIN)}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
