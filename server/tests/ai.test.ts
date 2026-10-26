/**
 * AI layer tests with a fake LLM client — covers the success path, prompt
 * structure (cache stability, injection fencing), every degradation path, the
 * circuit breaker and draft caching. No network calls, no cost.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ApiError, type GoogleGenAI } from "@google/genai";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { aiStatus, setProviders } from "../src/modules/ai/llm.js";
import { createAnthropicProvider } from "../src/modules/ai/providers/anthropic.js";
import { createGeminiProvider } from "../src/modules/ai/providers/gemini.js";
import { classifyTicketWithAi } from "../src/modules/ai/classifier.js";
import { getOrCreateDraft } from "../src/modules/ai/drafts.service.js";
import { setAiClassifier, triageTicket } from "../src/modules/tickets/triage.js";
import { ADMIN, AUTHOR, app, tokenFor } from "./helpers.js";

type ParseParams = {
  system: { text: string; cache_control?: unknown }[];
  messages: { content: string }[];
  output_config: { effort: string };
};

/** A fake Anthropic `messages.parse` that records calls and returns/throws whatever the test scripts. */
function fakeAnthropic(respond: (params: ParseParams, call: number) => unknown) {
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
  return { calls, provider: createAnthropicProvider(client as unknown as Anthropic, "claude-haiku-5-5") };
}

/** Anthropic as the only provider — most tests exercise one provider. */
function fakeClient(respond: (params: ParseParams, call: number) => unknown) {
  const { calls, provider } = fakeAnthropic(respond);
  setProviders([provider]);
  return calls;
}

/** A fake Gemini `models.generateContent`. */
function fakeGemini(respond: () => unknown) {
  let calls = 0;
  const client = {
    models: {
      generateContent: async () => {
        calls++;
        const result = respond();
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
  return { calls: () => calls, provider: createGeminiProvider(client as unknown as GoogleGenAI, "gemini-3.6-flash") };
}

const geminiOk = (output: unknown) => ({
  text: JSON.stringify(output),
  candidates: [{ finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 600, candidatesTokenCount: 90, thoughtsTokenCount: 40 },
});
const outOfCredits = () => new Anthropic.BadRequestError(400, {}, "Your credit balance is too low", new Headers());

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

/**
 * Creates a ticket directly in the DB. (Going through POST /tickets would also
 * start a background triage, racing the triage each test runs explicitly.)
 */
async function newTicket(subject = "Royalty not received", description = "I haven't received any royalty for 6 months for my book.") {
  const author = await prisma.author.findUniqueOrThrow({ where: { code: "AUTH001" } });
  const ticket = await prisma.ticket.create({ data: { authorId: author.id, subject, description } });
  created.push(ticket.id);
  return ticket.id;
}

beforeAll(async () => {
  setAiClassifier(null);
  [authorToken, adminToken] = await Promise.all([tokenFor(AUTHOR), tokenFor(ADMIN)]);
});
afterEach(() => {
  setProviders([]);
  setAiClassifier(null);
});
afterAll(async () => {
  // Fake-provider calls must not pollute the usage/cost report: remove their
  // logs while they are still linked to the test tickets.
  await prisma.aiCallLog.deleteMany({ where: { ticketId: { in: created } } });
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
    expect(aiStatus()).toMatchObject({ available: false, providers: [{ name: "anthropic", circuitOpenUntil: expect.any(String) }] });
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
    setProviders([]);
    const res = await getOrCreateDraft(await newTicket());
    expect(res).toMatchObject({ source: "TEMPLATE", aiError: "not_configured" });
    // Known facts are filled in, not left as placeholders (Priya: ₹3,570 pending, last payout a year ago).
    expect(res.body).toContain("₹3,570 pending");
    expect(res.body).not.toContain("[Add the author's pending amount");
    expect(res.suggestedActions).toContain("Check the payout file for a missed payout and escalate to finance.");
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

describe("provider failover (Anthropic → Gemini)", () => {
  const classification = { category: "ROYALTY_PAYMENTS", priority: "CRITICAL", reasoning: "Never paid on a selling book." };

  it("answers from Gemini when Claude is out of credits, and logs both attempts", async () => {
    const claude = fakeAnthropic(() => outOfCredits());
    const gemini = fakeGemini(() => geminiOk(classification));
    setProviders([claude.provider, gemini.provider]);
    setAiClassifier(classifyTicketWithAi);

    const id = await newTicket();
    await triageTicket(id);

    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ category: "ROYALTY_PAYMENTS", priority: "CRITICAL", categorySource: "AI" });
    const logs = await prisma.aiCallLog.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => [l.model, l.success, l.errorType])).toEqual([
      ["claude-haiku-5-5", false, "bad_request"],
      ["gemini-3.6-flash", true, null],
    ]);
    // Gemini usage: prompt tokens split into uncached + cached; thinking counts as output.
    expect(logs[1]).toMatchObject({ inputTokens: 400, cacheReadTokens: 600, outputTokens: 130 });
  });

  it("records which model wrote a draft", async () => {
    const gemini = fakeGemini(() => geminiOk({ reply: "Hi Priya,\n\n…\n\nWarm regards,\nBookLeaf Author Support", suggestedActions: [] }));
    setProviders([fakeAnthropic(() => serverError()).provider, gemini.provider]);
    const draft = await getOrCreateDraft(await newTicket());
    expect(draft).toMatchObject({ source: "AI", model: "gemini-3.6-flash" });
  });

  it("skips a provider whose circuit is open and goes straight to the next", async () => {
    const claude = fakeAnthropic(() => serverError());
    const gemini = fakeGemini(() => geminiOk(classification));
    setProviders([claude.provider, gemini.provider]);
    setAiClassifier(classifyTicketWithAi);

    for (let i = 0; i < 5; i++) await triageTicket(await newTicket());
    expect(claude.calls).toHaveLength(3); // breaker opened after 3 failures
    expect(gemini.calls()).toBe(5);
    expect(aiStatus()).toMatchObject({
      available: true,
      model: "gemini-3.6-flash",
      providers: [
        { name: "anthropic", available: false },
        { name: "gemini", available: true },
      ],
    });
  });

  it("maps Gemini safety blocks and rate limits, then falls back to rules when every provider fails", async () => {
    const blocked = fakeGemini(() => ({ text: "", candidates: [{ finishReason: "SAFETY" }] }));
    setProviders([fakeAnthropic(() => rateLimited()).provider, blocked.provider]);
    setAiClassifier(classifyTicketWithAi);
    const id = await newTicket();
    await triageTicket(id);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).categorySource).toBe("FALLBACK");
    const logs = await prisma.aiCallLog.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.errorType)).toEqual(["rate_limited", "refusal"]);

    const quota = fakeGemini(() => new ApiError({ message: "quota exceeded", status: 429 }));
    setProviders([quota.provider]);
    const draft = await getOrCreateDraft(await newTicket());
    expect(draft).toMatchObject({ source: "TEMPLATE", aiError: "rate_limited" });
  });

  it("rejects provider output that doesn't match the schema", async () => {
    const gemini = fakeGemini(() => geminiOk({ category: "NOT_A_CATEGORY", priority: "HIGH", reasoning: "x" }));
    setProviders([gemini.provider]);
    setAiClassifier(classifyTicketWithAi);
    const id = await newTicket();
    await triageTicket(id);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).categorySource).toBe("FALLBACK");
  });
});
