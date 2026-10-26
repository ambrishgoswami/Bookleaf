/**
 * GET /api/v1/events — Server-Sent Events stream of ticket changes.
 *
 * Chose SSE over WebSockets: updates only flow server → client, SSE works over
 * plain HTTP (no extra infra, proxy-friendly) and reconnects are trivial.
 * The client reads it with fetch() so the JWT travels in the Authorization
 * header rather than a URL query string (which would end up in access logs).
 */
import { Router } from "express";
import { currentUser } from "../../middleware/auth.js";
import { subscribe, type TicketEvent } from "../../lib/events.js";

const HEARTBEAT_MS = 25_000; // under typical proxy idle timeouts (Render: ~100s)

export const eventsRouter = Router();

eventsRouter.get("/", (req, res) => {
  const user = currentUser(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable proxy buffering
  });
  res.write(`event: ready\ndata: {}\n\n`);

  // Admins get every event; authors only non-internal events on their own tickets.
  const visible = (e: TicketEvent) => user.role === "ADMIN" || (!e.internal && e.authorId === user.authorId);

  const unsubscribe = subscribe((event) => {
    if (!visible(event)) return;
    const { authorId: _a, internal: _i, ...payload } = event;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
