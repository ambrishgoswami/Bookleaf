import request from "supertest";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { setAiClassifier, triageTicket } from "../src/modules/tickets/triage.js";
import { ADMIN, AUTHOR, app, tokenFor } from "./helpers.js";

const OTHER_AUTHOR = { email: "rohit.kapoor@email.com", password: "Author@123" }; // AUTH002

let authorToken: string;
let otherAuthorToken: string;
let adminToken: string;
let adminId: string;
const createdTicketIds: string[] = [];

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createTicket(body: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/tickets")
    .set(as(authorToken))
    .send({
      subject: "Royalty not received",
      description: "I haven't received any royalty for 6 months now. Please check my account.",
      ...body,
    });
  if (res.status === 201) createdTicketIds.push(res.body.data.id);
  return res;
}

beforeAll(async () => {
  setAiClassifier(null); // deterministic: use the rule-based classifier in tests
  [authorToken, otherAuthorToken, adminToken] = await Promise.all([tokenFor(AUTHOR), tokenFor(OTHER_AUTHOR), tokenFor(ADMIN)]);
  adminId = (await request(app).get("/api/v1/auth/me").set(as(adminToken))).body.user.id;
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
});

describe("creating tickets", () => {
  it("creates a general (account-level) ticket and triages it in the background", async () => {
    const res = await createTicket();
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/tickets/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({ status: "OPEN", book: null, reference: expect.stringMatching(/^BL-\d+$/) });

    await triageTicket(res.body.data.id); // make the async step deterministic
    const admin = await request(app).get(`/api/v1/tickets/${res.body.data.id}`).set(as(adminToken));
    expect(admin.body.data).toMatchObject({
      category: "ROYALTY_PAYMENTS",
      priority: "CRITICAL",
      categorySource: "FALLBACK",
    });
  });

  it("links a ticket to one of the author's own books", async () => {
    const books = await request(app).get("/api/v1/books").set(as(authorToken));
    const res = await createTicket({ bookId: books.body.data[0].id });
    expect(res.status).toBe(201);
    expect(res.body.data.book.id).toBe(books.body.data[0].id);
  });

  it("rejects a book that belongs to another author", async () => {
    const books = await request(app).get("/api/v1/books").set(as(otherAuthorToken));
    const res = await createTicket({ bookId: books.body.data[0].id });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe("bookId");
  });

  it("validates subject and description length", async () => {
    const res = await createTicket({ subject: "Hi", description: "short" });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(["subject", "description"]);
  });

  it("does not let admins create tickets", async () => {
    const res = await request(app).post("/api/v1/tickets").set(as(adminToken)).send({});
    expect(res.status).toBe(403);
  });
});

describe("ticket visibility", () => {
  let ticketId: string;
  beforeAll(async () => {
    ticketId = (await createTicket()).body.data.id;
    await triageTicket(ticketId);
  });

  it("hides another author's ticket (404)", async () => {
    const res = await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(otherAuthorToken));
    expect(res.status).toBe(404);
  });

  it("never lists another author's tickets", async () => {
    const res = await request(app).get("/api/v1/tickets").set(as(otherAuthorToken));
    expect(res.body.data.some((t: { id: string }) => t.id === ticketId)).toBe(false);
  });

  it("does not expose admin-only fields to authors", async () => {
    const res = await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(authorToken));
    expect(res.body.data.priority).toBeUndefined();
    expect(res.body.data.aiReasoning).toBeUndefined();
    expect(res.body.data.activities).toBeUndefined();
    expect(res.body.data.categoryLabel).toBe("Royalty & Payments");
  });

  it("keeps internal notes out of the author's view", async () => {
    await request(app)
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .set(as(adminToken))
      .send({ kind: "INTERNAL_NOTE", body: "Checked finance sheet — payout bounced, bank IFSC wrong." });

    const author = await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(authorToken));
    const admin = await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(adminToken));
    expect(author.body.data.messages).toHaveLength(0);
    expect(admin.body.data.messages[0].kind).toBe("INTERNAL_NOTE");
  });

  it("forbids authors from posting internal notes", async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .set(as(authorToken))
      .send({ kind: "INTERNAL_NOTE", body: "sneaky" });
    expect(res.status).toBe(403);
  });
});

describe("ticket lifecycle", () => {
  let ticketId: string;
  beforeAll(async () => {
    ticketId = (await createTicket()).body.data.id;
  });

  it("an admin reply moves the ticket to In Progress, assigns it and records first response", async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/messages`)
      .set(as(adminToken))
      .send({ body: "Hi Priya, I'm sorry about the delay — looking into this now.", aiAssisted: true });
    expect(res.status).toBe(201);

    const admin = (await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(adminToken))).body.data;
    expect(admin).toMatchObject({ status: "IN_PROGRESS", assignee: { id: adminId }, firstResponseAt: expect.any(String) });
    expect(admin.messages[0].aiAssisted).toBe(true);

    const author = (await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(authorToken))).body.data;
    expect(author.messages).toHaveLength(1);
    expect(author.handledBy).toBe("Aisha");
  });

  it("admin overrides survive a late AI classification", async () => {
    const res = await request(app)
      .patch(`/api/v1/tickets/${ticketId}`)
      .set(as(adminToken))
      .send({ category: "GENERAL_INQUIRY", priority: "LOW" });
    expect(res.body.data).toMatchObject({ category: "GENERAL_INQUIRY", categorySource: "ADMIN", prioritySource: "ADMIN" });
    expect(res.body.data.activities.map((a: { action: string }) => a.action)).toContain("category_overridden");

    await triageTicket(ticketId); // classification finishing after the override
    const after = (await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(adminToken))).body.data;
    expect(after).toMatchObject({ category: "GENERAL_INQUIRY", priority: "LOW" });
  });

  it("only admins can be assignees", async () => {
    const author = await request(app).get("/api/v1/auth/me").set(as(authorToken));
    const res = await request(app).patch(`/api/v1/tickets/${ticketId}`).set(as(adminToken)).send({ assigneeId: author.body.user.id });
    expect(res.status).toBe(422);
  });

  it("an author follow-up reopens a resolved ticket", async () => {
    await request(app).patch(`/api/v1/tickets/${ticketId}`).set(as(adminToken)).send({ status: "RESOLVED" });
    await request(app).post(`/api/v1/tickets/${ticketId}/messages`).set(as(authorToken)).send({ body: "Still not received." });
    const t = (await request(app).get(`/api/v1/tickets/${ticketId}`).set(as(authorToken))).body.data;
    expect(t.status).toBe("OPEN");
    expect(t.resolvedAt).toBeNull();
  });

  it("authors cannot reply to a closed ticket", async () => {
    await request(app).patch(`/api/v1/tickets/${ticketId}`).set(as(adminToken)).send({ status: "CLOSED" });
    const res = await request(app).post(`/api/v1/tickets/${ticketId}/messages`).set(as(authorToken)).send({ body: "Hello?" });
    expect(res.status).toBe(409);
  });

  it("authors cannot update ticket fields", async () => {
    const res = await request(app).patch(`/api/v1/tickets/${ticketId}`).set(as(authorToken)).send({ status: "RESOLVED" });
    expect(res.status).toBe(403);
  });

  it("rejects an empty update", async () => {
    const res = await request(app).patch(`/api/v1/tickets/${ticketId}`).set(as(adminToken)).send({});
    expect(res.status).toBe(422);
  });
});

describe("admin queue", () => {
  it("filters by status and priority and validates enum values", async () => {
    const ok = await request(app).get("/api/v1/tickets?status=OPEN,IN_PROGRESS&priority=CRITICAL").set(as(adminToken));
    expect(ok.status).toBe(200);
    expect(ok.body.data.every((t: { priority: string }) => t.priority === "CRITICAL")).toBe(true);
    expect(ok.body.meta).toMatchObject({ page: 1, pageSize: 25 });

    const bad = await request(app).get("/api/v1/tickets?status=DONE").set(as(adminToken));
    expect(bad.status).toBe(422);
  });

  it("overdue filter returns exactly the tickets the SLA marks overdue", async () => {
    const [overdue, stats] = await Promise.all([
      request(app).get("/api/v1/tickets?overdue=true&pageSize=100").set(as(adminToken)),
      request(app).get("/api/v1/tickets/stats").set(as(adminToken)),
    ]);
    expect(overdue.status).toBe(200);
    expect(overdue.body.data.every((t: { sla: { overdue: boolean } }) => t.sla.overdue)).toBe(true);
    expect(overdue.body.meta.total).toBe(stats.body.data.active.overdue);
  });

  it("returns dashboard stats to admins only", async () => {
    const res = await request(app).get("/api/v1/tickets/stats").set(as(adminToken));
    expect(res.body.data.active).toHaveProperty("overdue");
    const denied = await request(app).get("/api/v1/tickets/stats").set(as(authorToken));
    expect(denied.status).toBe(403);
  });
});

describe("GET /api/v1/events (SSE)", () => {
  /** Opens an SSE stream and collects event names until `count` arrive or timeout. */
  async function collectEvents(baseUrl: string, token: string, act: () => Promise<unknown>, waitMs = 800) {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/v1/events`, { headers: as(token), signal: controller.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const events: string[] = [];
    let buffer = "";

    const pump = (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (const m of buffer.matchAll(/^event: (.+)$/gm)) events.push(m[1]!);
          buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
        }
      } catch {
        // aborted
      }
    })();

    await new Promise((r) => setTimeout(r, 100)); // let the subscription register
    await act();
    await new Promise((r) => setTimeout(r, waitMs));
    controller.abort();
    await pump;
    return events.filter((e) => e !== "ready");
  }

  it("pushes reply events to the owning author but not internal notes or other authors", async () => {
    const server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ticketId = (await createTicket()).body.data.id;

    try {
      const authorEvents = await collectEvents(baseUrl, authorToken, async () => {
        await request(app).post(`/api/v1/tickets/${ticketId}/messages`).set(as(adminToken)).send({ kind: "INTERNAL_NOTE", body: "note" });
        await request(app).post(`/api/v1/tickets/${ticketId}/messages`).set(as(adminToken)).send({ body: "Reply to author" });
      });
      // Exactly one message event — the reply. The internal note must not leak;
      // a ticket.updated from background triage of the new ticket may also arrive.
      expect(authorEvents.filter((e) => e === "message.created")).toHaveLength(1);

      const otherEvents = await collectEvents(baseUrl, otherAuthorToken, () =>
        request(app).post(`/api/v1/tickets/${ticketId}/messages`).set(as(adminToken)).send({ body: "Another reply" }),
      );
      expect(otherEvents).toEqual([]);
    } finally {
      server.close();
    }
  });
});
