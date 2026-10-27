# Write-up: BookLeaf Author Support Portal

**Live demo:** https://bookleaf-web-owhj.onrender.com · **API docs:** https://bookleaf-api-54mb.onrender.com/api/docs · Setup, logins and full feature list are in the [README](../README.md).

## What I built

A support portal with two sides:

- **Authors** see their books and royalties, raise queries (with attachments), and follow the conversation live.
- **The BookLeaf team** works a prioritised queue. The AI classifies each ticket and pre-fills a reply draft grounded in the Knowledge Base and the author's own account data.

## What I prioritised

### 1. A ticket loop that works even when the AI doesn't
An author raises a query → it is triaged and prioritised → an admin answers → the author sees the reply without refreshing.

- The ticket is saved and the `201` returned **before** classification starts, so creating a ticket never waits on, or fails because of, an AI provider.
- All model traffic goes through one gateway with **provider failover (Claude Haiku 5.5 → Gemini 3.6 Flash)**, a circuit breaker per provider, timeouts and schema validation.
- If every provider is down, **keyword rules** classify and **KB templates** draft — filled with what the system knows (name, pending royalty, threshold position, next payout date, production stage).

This was tested by real failures during development: the Anthropic account ran out of credits (Gemini took over), then Gemini's free-tier quota ran out (its breaker opened and the rules took over). The app kept working throughout.

### 2. AI that uses BookLeaf's facts, not generic text
- The draft prompt carries the full **Knowledge Base policies and tone guide**, plus the author's **real account data**: book status, copies sold, pending royalty, last payout.
- Anything that needs arithmetic is **computed in code** (`domain/policy.ts`) and handed to the model: the next payout date, the ₹1,000 rollover rule, the production stage, and whether a past payout looks missed. The model quotes facts instead of calculating them.
- Each draft comes with **internal follow-ups** for the admin (e.g. "Escalate ISBN mismatch to production").
- Every category and priority records **who decided it** — `AI`, `Rules` or `Admin` — and an admin override is never overwritten by a late AI result.
- Author text is wrapped in tags and treated as data; the eval set includes a prompt-injection ticket.

### 3. Data isolation enforced on the server
- Authors get a separate projection of a ticket: no internal notes, priority, AI reasoning or audit trail. This is enforced in the REST API **and** the real-time stream, and covered by tests.
- Requests for another author's books or tickets return **404**, not 403, so IDs can't be probed.
- Attachments are type-checked by content, not file extension.

### 4. Ops ergonomics
- Default sort: **priority → unanswered before answered → oldest**, with first-response SLAs and overdue highlighting.
- Filters live in the URL, so a view can be shared as a link.
- *Send & resolve*, saved replies with placeholders, bulk assign/resolve, CSV export, and an activity log on every ticket.
- An analytics view: response and resolution times, SLA breach rate, CSAT, AI override rate and the share of replies sent from the AI draft.

### 5. Fewer tickets in the first place
- While an author types a new query, **matching Help Center articles are suggested live**.
- *My Books* states the next payout date, or explains that a balance below ₹1,000 rolls over — the most common royalty question, answered before it is asked.

## Trade-offs

| Choice | Why |
|---|---|
| **Haiku 5.5 as primary, Gemini as backup** | Both jobs are narrow (fixed taxonomy; ~150-word reply from supplied facts), so a small, fast, cheap model is enough. Gemini was picked by testing the real classify prompt; it costs more, so it is the fallback, not the default. Order and models are env vars. |
| **Whole KB in a cached prompt, no retrieval** | The policy text is ~1.4k tokens. A byte-stable system prompt (cache reads ≈10% of input price, enforced by a test) is simpler and more robust than retrieval at this size. What varies per ticket is trimmed: one category's examples, the last few messages, compact account facts. |
| **Draft generated once and stored** | Opening a ticket again costs nothing; it regenerates only when the conversation changes, after an outage, or on request. Estimated cost is well under $0.001 per ticket. |
| **SSE + refetch, not WebSockets pushing data** | Updates only flow server → client. Events just say "this ticket changed"; the client refetches over REST, so access rules live in one place. |
| **In-process event bus and background triage** | Fine for one instance and a demo; the first thing to change for scale. |
| **Attachments in Postgres, JWT in `localStorage`, no email** | Simple and acceptable at demo scale; each is listed in the README's limitations with its production replacement. |

## Evaluation

`npm run ai:eval -- --drafts` runs 12 cases against the real model: the KB samples plus harder ones (legal threat, below-threshold royalty, Hinglish, prompt injection). On the first live run (Gemini, as Claude had no credits) classification was **4/5 correct**, and the drafts quoted the author's real pending amount and exact payout date.

The miss led to a fix: for an author whose last payout was a year ago, the model called the complaint "routine" because the current payout window was still open. Working out *which past payout was missed* is date arithmetic, so it now happens in code (`payoutLooksOverdue`, unit-tested) and the facts given to the model flag it explicitly.

The backend has **98 tests** (Vitest + Supertest, real Postgres) covering auth, RBAC, privacy over REST and SSE, the ticket lifecycle, attachments, and the AI layer with fake providers (failover, breakers, caching, fallbacks).

## Evolving this into production

1. **Reliability**
   - A job queue (pg-boss / BullMQ) for triage and drafts, with retries and a sweep for stuck tickets.
   - Postgres `LISTEN/NOTIFY` or Redis pub/sub so real-time works across instances.
   - httpOnly cookie sessions with short-lived access tokens and refresh.
2. **Integrations**
   - Email/WhatsApp notifications, and inbound email → ticket.
   - Attachments in S3 with signed URLs and virus scanning; images passed to the model for print-quality claims.
   - Live data from the royalty and production systems instead of seed data.
3. **A feedback loop for the AI**
   - Turn admin overrides and edited drafts into an eval set, and tune prompts per category against it.
   - Only then consider auto-sending low-risk replies (e.g. "how do I update my bio"), with human review of a sample.
4. **Ops at scale**
   - Spot recurring issues (e.g. sync failures on one platform) and backlog spikes early.
   - Postgres full-text or trigram search instead of `ILIKE`.
