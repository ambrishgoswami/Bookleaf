# Write-up: BookLeaf Author Support Portal

## What I prioritised

**1. A complete, trustworthy ticket loop before anything else.**
- An author raises a query.
- It is triaged, prioritised and answered.
- The author sees the answer live.

Each step has to work even when the AI does not. Tickets are saved and confirmed before classification starts, and every AI step has a deterministic fallback (keyword rules, KB templates). In development this was tested for real: the API key ran out of credits, the circuit breaker opened, and the demo data was still classified and answerable.

**2. AI that uses BookLeaf's facts, not generic text.**
The prompts include the Knowledge Base and tone guide. They also include the author's real account data — book status, copies sold, pending royalty — plus values computed in code: the next payout date, the ₹1,000 rollover rule, and the production stage. The model quotes facts rather than calculating them.

Each draft also comes with internal follow-ups for the admin, and every AI decision records whether it came from the model, the rules, or a human.

**3. Data isolation on the server.**
Authors get a separate API view: no internal notes, priority or AI reasoning, enforced in the API and the real-time stream, and covered by tests. Requests for other authors' records return 404.

**4. Ops ergonomics.**
- Urgency sort: priority first, then unanswered before answered, then oldest.
- First-response SLAs with overdue flags.
- Filters you can share as a link.
- "Send & resolve".
- An activity log.

## Trade-offs

- **Haiku 5.5 over a larger model.** The tasks are narrow and well-specified, so a small, cheap, fast model is enough. The model is a single env var.
- **Full KB cached rather than retrieved.** The policy text is only ~1.4k tokens. Sending it in a byte-stable system prompt (cache reads cost ~10% of normal input) is simpler and more robust than retrieval. Retrieval would only pay off with a much larger KB. What *does* vary per ticket is trimmed: one category's examples, capped history, compact account facts.
- **SSE + refetch rather than pushing data over WebSockets.** Slightly more requests, but one place to enforce access rules.
- **In-process event bus and background jobs.** Fine for one instance and a demo; noted as the first thing to change for scale.
- **Attachments UI-only, JWT in localStorage, no email.** Explicitly out of scope or acceptable for a demo; listed in the README.

## Evolving this into production

1. **Reliability:**
   - a job queue for triage and drafts, with retries and a sweep for stuck tickets;
   - Redis or Postgres pub/sub for real-time across instances;
   - cookie sessions with refresh tokens.
2. **Integrations:**
   - email/WhatsApp notifications and inbound email → ticket;
   - real attachments (S3, scanning) passed to the model for print-quality claims;
   - live data from the royalty/production systems instead of seed data.
3. **A feedback loop for the AI.** Track the override rate per category and how much admins edit drafts before sending; turn those into an eval set; tune prompts against it; only then consider auto-sending low-risk replies (e.g. "how do I update my bio") with human review of a sample.
4. **Ops analytics:** response and resolution times by category, recurring issues (e.g. sync failures on one platform), and spotting backlog spikes early.
