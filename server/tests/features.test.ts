/**
 * Unread tracking, CSAT, analytics, CSV exports, bulk actions, saved replies
 * and the Help Center.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { toCsv } from "../src/lib/csv.js";
import { searchArticles } from "../src/domain/helpArticles.js";
import { setAiClassifier } from "../src/modules/tickets/triage.js";
import { ADMIN, AUTHOR, app, tokenFor } from "./helpers.js";

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
let adminToken: string;
let authorToken: string;
const ticketIds: string[] = [];
const macroIds: string[] = [];

async function newTicket(subject = "Royalty question for testing", description = "When will my next royalty payment arrive for my book?") {
  const res = await request(app).post("/api/v1/tickets").set(as(authorToken)).send({ subject, description });
  ticketIds.push(res.body.data.id);
  return res.body.data.id as string;
}

beforeAll(async () => {
  setAiClassifier(null);
  [adminToken, authorToken] = await Promise.all([tokenFor(ADMIN), tokenFor(AUTHOR)]);
});
afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.macro.deleteMany({ where: { id: { in: macroIds } } });
});

describe("unread replies", () => {
  it("counts admin replies until the author opens the ticket", async () => {
    const id = await newTicket();
    const before = (await request(app).get("/api/v1/tickets/unread-count").set(as(authorToken))).body.data;

    await request(app).post(`/api/v1/tickets/${id}/messages`).set(as(adminToken)).send({ body: "First reply" });
    await request(app).post(`/api/v1/tickets/${id}/messages`).set(as(adminToken)).send({ kind: "INTERNAL_NOTE", body: "Not counted" });

    const after = (await request(app).get("/api/v1/tickets/unread-count").set(as(authorToken))).body.data;
    expect(after.messages).toBe(before.messages + 1);
    const t = (await request(app).get(`/api/v1/tickets/${id}`).set(as(authorToken))).body.data;
    expect(t.unreadCount).toBe(1);

    expect((await request(app).post(`/api/v1/tickets/${id}/read`).set(as(authorToken))).status).toBe(204);
    const read = (await request(app).get(`/api/v1/tickets/${id}`).set(as(authorToken))).body.data;
    expect(read.unreadCount).toBe(0);
  });

  it("is author-only", async () => {
    expect((await request(app).get("/api/v1/tickets/unread-count").set(as(adminToken))).status).toBe(403);
  });
});

describe("CSAT rating", () => {
  it("can only rate a resolved ticket, and shows the rating to admins", async () => {
    const id = await newTicket();
    const early = await request(app).post(`/api/v1/tickets/${id}/rating`).set(as(authorToken)).send({ rating: 5 });
    expect(early.status).toBe(409);

    await request(app).patch(`/api/v1/tickets/${id}`).set(as(adminToken)).send({ status: "RESOLVED" });
    const bad = await request(app).post(`/api/v1/tickets/${id}/rating`).set(as(authorToken)).send({ rating: 9 });
    expect(bad.status).toBe(422);

    const ok = await request(app).post(`/api/v1/tickets/${id}/rating`).set(as(authorToken)).send({ rating: 4, comment: "Quick and clear" });
    expect(ok.status).toBe(200);
    const admin = (await request(app).get(`/api/v1/tickets/${id}`).set(as(adminToken))).body.data;
    expect(admin).toMatchObject({ rating: 4, ratingComment: "Quick and clear" });
  });
});

describe("analytics", () => {
  it("returns volume, response times, SLA, CSAT and AI metrics to admins only", async () => {
    const res = await request(app).get("/api/v1/tickets/analytics?days=30").set(as(adminToken));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.volume).toHaveLength(30);
    expect(d.byCategory).toHaveLength(6);
    expect(d).toHaveProperty("firstResponseHours.median");
    expect(d).toHaveProperty("sla.breachRate");
    expect(d.csat.distribution).toHaveLength(5);
    expect(d).toHaveProperty("ai.overrideRate");
    expect((await request(app).get("/api/v1/tickets/analytics").set(as(authorToken))).status).toBe(403);
  });
});

describe("CSV exports", () => {
  it("escapes quotes, commas and spreadsheet formulas", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", 'He said "hi", ok']]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"He said ""hi"", ok"`);
  });

  it("exports the filtered ticket queue for admins", async () => {
    const res = await request(app).get("/api/v1/tickets/export.csv?status=OPEN,IN_PROGRESS,RESOLVED,CLOSED").set(as(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("bookleaf-tickets-");
    expect(res.text.split("\r\n")[0]).toContain("Reference,Created,Status");
    expect((await request(app).get("/api/v1/tickets/export.csv").set(as(authorToken))).status).toBe(403);
  });

  it("gives authors their own royalty statement", async () => {
    const res = await request(app).get("/api/v1/books/statement.csv").set(as(authorToken));
    expect(res.status).toBe(200);
    expect(res.text).toContain("Whispers of the Ganges");
    expect(res.text).not.toContain("Code & Karma"); // another author's book
    expect(res.text).toMatch(/Total,.*3570/);
  });
});

describe("bulk actions", () => {
  it("assigns several tickets at once and reports failures", async () => {
    const [a, b] = [await newTicket(), await newTicket()];
    const res = await request(app).post("/api/v1/tickets/bulk").set(as(adminToken)).send({ ids: [a, b, "missing-id"], action: "assign_to_me" });
    expect(res.body.data).toEqual({ updated: 2, failed: ["missing-id"] });
    const t = (await request(app).get(`/api/v1/tickets/${a}`).set(as(adminToken))).body.data;
    expect(t.assignee.name).toBe("Aisha Verma");

    const status = await request(app).post("/api/v1/tickets/bulk").set(as(adminToken)).send({ ids: [a, b], action: "set_status", status: "RESOLVED" });
    expect(status.body.data.updated).toBe(2);
  });
});

describe("saved replies (macros)", () => {
  it("supports CRUD and usage counting, admin-only", async () => {
    const created = await request(app)
      .post("/api/v1/macros")
      .set(as(adminToken))
      .send({ title: "Test macro", body: "Hi {{authorFirstName}}, testing.", category: "GENERAL_INQUIRY" });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    macroIds.push(id);

    const patched = await request(app).patch(`/api/v1/macros/${id}`).set(as(adminToken)).send({ title: "Renamed macro" });
    expect(patched.body.data.title).toBe("Renamed macro");
    await request(app).post(`/api/v1/macros/${id}/use`).set(as(adminToken));
    const list = await request(app).get("/api/v1/macros").set(as(adminToken));
    expect(list.body.data.find((m: { id: string }) => m.id === id).usageCount).toBe(1);

    expect((await request(app).get("/api/v1/macros").set(as(authorToken))).status).toBe(403);
    expect((await request(app).delete(`/api/v1/macros/${id}`).set(as(adminToken))).status).toBe(204);
  });
});

describe("help center", () => {
  it("ranks relevant articles for a typed query", () => {
    const royalty = searchArticles("I haven't received my royalty payment");
    expect(royalty[0]?.category).toBe("ROYALTY_PAYMENTS");
    expect(searchArticles("book showing currently unavailable on amazon")[0]?.slug).toBe("book-unavailable");
    expect(searchArticles("blurry pages in my printed copies")[0]?.category).toBe("PRINTING_QUALITY");
    expect(searchArticles("xyzzy")).toEqual([]);
  });

  it("serves articles over the API", async () => {
    const res = await request(app).get("/api/v1/help/articles?q=isbn wrong").set(as(authorToken));
    expect(res.body.data[0].slug).toBe("isbn-error");
    expect((await request(app).get("/api/v1/help/articles/production-stages").set(as(authorToken))).status).toBe(200);
    expect((await request(app).get("/api/v1/help/articles/nope").set(as(authorToken))).status).toBe(404);
  });
});
