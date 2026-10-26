/**
 * AI layer tests with a fake LLM client — covers the success path, prompt
 * structure (cache stability, injection fencing), every degradation path, the
 * circuit breaker and draft caching. No network calls, no cost.
 */
import Anthropic from "@anthropic-ai/sdk";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { aiStatus, setLlmClient } from "../src/modules/ai/llm.js";
import { classifyTicketWithAi } from "../src/modules/ai/classifier.js";
import { getOrCreateDraft } from "../src/modules/ai/drafts.service.js";
import { setAiClassifier, triageTicket } from "../src/modules/tickets/triage.js";
import { ADMIN, AUTHOR, app, tokenFor } from "./helpers.js";

type ParseParams = {
  system: { text: string; cache_control?: unknown }[];
  messages: { content: string }[];
  output_config: { effort: string };
};

/** A fake `messages.parse` that records calls and returns/throws whatever the test scripts. */
function fakeClient(respond: (params: ParseParams, call: number) => unknown) {
  const calls: ParseParams[] = [];
  const client = {
    messages: {
      parse: async (params: ParseParams) => {
        calls.push(params);
        const result = respond(params, calls.length);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
  setLlmClient(client as unknown as Anthropic);
  return calls;
}

const ok = (parsed_output: unknown) => ({
  stop_reason: "end_turn",
  parsed_output,
  usage: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 1400, cache_creation_input_tokens: 0 },
});
const rateLimited = () => new Anthropic.RateLimitError(429, {}, "rate limited", new Headers());
const serverError = () => new Anthropic.InternalServerError(529, {}, "overloaded", new Headers());

let authorToken: string;
let adminToken: string;
const created: string[] = [];

async function newTicket(subject = "Royalty not received", description = "I haven't received any royalty for 6 months for my book.") {
  const res = await request(app).post("/api/v1/tickets").set("Authorization", `Bearer ${authorToken}`).send({ subject, description });
  created.push(res.body.data.id);
  return res.body.data.id as string;
}

beforeAll(async () => {
  setAiClassifier(null);
  [authorToken, adminToken] = await Promise.all([tokenFor(AUTHOR), tokenFor(ADMIN)]);
});
afterEach(() => {
  setLlmClient(null);
  setAiClassifier(null);
});
afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: created } } });
});

describe("AI classification", () => {
  it("uses the model's answer and records source=AI with its reasoning", async () => {
    fakeClient(() => ok({ category: "ROYALTY_PAYMENTS", priority: "HIGH", reasoning: "Royalty overdue past the payout window." }));
    setAiClassifier(classifyTicketWithAi);
    const id = await newTicket();
    await triageTicket(id);

    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ category: "ROYALTY_PAYMENTS", priority: "HIGH", categorySource: "AI", prioritySource: "AI" });
    expect(t.aiReasoning).toContain("overdue");
  });

  it("keeps the system prompt byte-stable (cacheable) and puts ticket data in the user turn", async () => {
    const calls = fakeClient(() => ok({ category: "GENERAL_INQUIRY", priority: "LOW", reasoning: "x" }));
    await classifyTicketWithAi(await newTicket("Author bio", "Can I update my author bio on the site please?"));
    await classifyTicketWithAi(await newTicket("ISBN wrong", "My ISBN is wrong on Amazon, please fix it."));

    const [a, b] = calls;
    expect(a!.system[0]!.text).toBe(b!.system[0]!.text);
    expect(a!.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(a!.system[0]!.text).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no dates → no cache busting
    expect(a!.output_config.effort).toBe("low");

    const user = a!.messages[0]!.content;
    expect(user).toContain("<ticket>");
    expect(user).toContain("Priya Sharma (AUTH001)"); // account facts included
    expect(user).toContain("Next payout:");
  });

  it("falls back to rules when rate-limited — the ticket is still classified", async () => {
    fakeClient(() => rateLimited());
    setAiClassifier(classifyTicketWithAi);
    const id = await newTicket();
    await triageTicket(id);

    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ category: "ROYALTY_PAYMENTS", categorySource: "FALLBACK" });
    const log = await prisma.aiCallLog.findFirst({ where: { ticketId: id }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ success: false, errorType: "rate_limited" });
  });

  it("treats a refusal as a fallback without tripping the circuit breaker", async () => {
    fakeClient(() => ({ stop_reason: "refusal", parsed_output: null, usage: { input_tokens: 10, output_tokens: 0 } }));
    setAiClassifier(classifyTicketWithAi);
    for (let i = 0; i < 4; i++) await triageTicket(await newTicket());
    expect(aiStatus().available).toBe(true);
  });

  it("opens the circuit after repeated provider failures and stops calling the API", async () => {
    const calls = fakeClient(() => serverError());
    setAiClassifier(classifyTicketWithAi);
    for (let i = 0; i < 5; i++) await triageTicket(await newTicket());

    expect(calls).toHaveLength(3); // 4th and 5th short-circuited
    expect(aiStatus()).toMatchObject({ available: false, circuitOpenUntil: expect.any(String) });
    const last = await prisma.ticket.findUniqueOrThrow({ where: { id: created.at(-1)! } });
    expect(last.categorySource).toBe("FALLBACK");
  });
});

describe("AI drafts", () => {
  const draft = { reply: "Hi Priya,\n\nWe're sorry…\n\nWarm regards,\nBookLeaf Author Support", suggestedActions: ["Check payout file"] };

  it("generates once, then serves the cached draft without another API call", async () => {
    const calls = fakeClient(() => ok(draft));
    const id = await newTicket();

    const first = await getOrCreateDraft(id);
    const second = await getOrCreateDraft(id);
    expect(first).toMatchObject({ source: "AI", cached: false, suggestedActions: ["Check payout file"] });
    expect(second.cached).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages[0]!.content).toContain("<calibration_examples>");
  });

  it("regenerates when the conversation has moved on", async () => {
    const calls = fakeClient(() => ok(draft));
    const id = await newTicket();
    await getOrCreateDraft(id);
    await request(app)
      .post(`/api/v1/tickets/${id}/messages`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ body: "Any update? It's been a week." });

    const again = await getOrCreateDraft(id);
    expect(again.cached).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.messages[0]!.content).toContain("Any update?");
  });

  it("only sends the matching category's examples (not the whole table)", async () => {
    const calls = fakeClient(() => ok(draft));
    await getOrCreateDraft(await newTicket("Blurry print", "The images in my author copies are blurry and the binding is loose."));
    const user = calls[0]!.messages[0]!.content;
    expect(user).toContain("free reprint");
    expect(user).not.toContain("Currently Unavailable");
  });

  it("falls back to a KB template when AI fails, and says why", async () => {
    fakeClient(() => rateLimited());
    const res = await getOrCreateDraft(await newTicket());
    expect(res).toMatchObject({ source: "TEMPLATE", aiError: "rate_limited" });
    expect(res.body).toContain("Hi Priya");
    expect(res.body).toContain("45 days");
  });

  it("works with no API key configured", async () => {
    setLlmClient(null);
    const res = await getOrCreateDraft(await newTicket());
    expect(res).toMatchObject({ source: "TEMPLATE", aiError: "not_configured" });
  });

  it("is admin-only over HTTP and supports regenerate with guidance", async () => {
    const calls = fakeClient(() => ok(draft));
    const id = await newTicket();
    const denied = await request(app).post(`/api/v1/tickets/${id}/draft`).set("Authorization", `Bearer ${authorToken}`);
    expect(denied.status).toBe(403);

    const res = await request(app)
      .post(`/api/v1/tickets/${id}/draft`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ guidance: "Keep it under 80 words" });
    expect(res.status).toBe(200);
    expect(calls[0]!.messages[0]!.content).toContain("<admin_instructions>\nKeep it under 80 words");
  });
});
