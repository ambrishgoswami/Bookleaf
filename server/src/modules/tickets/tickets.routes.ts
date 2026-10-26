import { Router } from "express";
import { parse } from "../../lib/validation.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { z } from "zod";
import { TicketStatus } from "@prisma/client";
import * as tickets from "./tickets.service.js";
import * as insights from "./tickets.insights.js";
import {
  AuthorUpdateTicketBody,
  CreateMessageBody,
  CreateTicketBody,
  IdParams,
  ListTicketsQuery,
  UpdateTicketBody,
} from "./tickets.schemas.js";

export const ticketsRouter = Router();

ticketsRouter.post("/", requireRole("AUTHOR"), async (req, res) => {
  const ticket = await tickets.createTicket(currentUser(req), parse(CreateTicketBody, req.body));
  res.status(201).location(`/api/v1/tickets/${ticket.id}`).json({ data: ticket });
});

ticketsRouter.get("/", async (req, res) => {
  res.json(await tickets.listTickets(currentUser(req), parse(ListTicketsQuery, req.query)));
});

// Static paths are declared before "/:id" so they aren't captured as an id.

ticketsRouter.get("/unread-count", requireRole("AUTHOR"), async (req, res) => {
  res.json({ data: await insights.unreadCount(currentUser(req)) });
});

const AnalyticsQuery = z.object({ days: z.coerce.number().int().min(7).max(180).default(30) });
ticketsRouter.get("/analytics", requireRole("ADMIN"), async (req, res) => {
  res.json({ data: await insights.analytics(parse(AnalyticsQuery, req.query).days) });
});

ticketsRouter.get("/export.csv", requireRole("ADMIN"), async (req, res) => {
  const csv = await insights.exportCsv(currentUser(req), parse(ListTicketsQuery, req.query));
  const stamp = new Date().toISOString().slice(0, 10);
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bookleaf-tickets-${stamp}.csv"` }).send(csv);
});

const BulkBody = z.discriminatedUnion("action", [
  z.object({ ids: z.array(z.string().min(1)).min(1).max(100), action: z.literal("assign_to_me") }),
  z.object({ ids: z.array(z.string().min(1)).min(1).max(100), action: z.literal("set_status"), status: z.enum(TicketStatus) }),
]);
ticketsRouter.post("/bulk", requireRole("ADMIN"), async (req, res) => {
  const { ids, ...op } = parse(BulkBody, req.body);
  res.json({ data: await insights.bulkUpdate(currentUser(req), ids, op) });
});

ticketsRouter.get("/stats", requireRole("ADMIN"), async (req, res) => {
  res.json({ data: await tickets.getQueueStats(currentUser(req).id) });
});

ticketsRouter.get("/:id", async (req, res) => {
  const { id } = parse(IdParams, req.params);
  res.json({ data: await tickets.getTicket(currentUser(req), id) });
});

// Admins can change any field; authors can only mark their own ticket resolved.
ticketsRouter.patch("/:id", async (req, res) => {
  const { id } = parse(IdParams, req.params);
  const user = currentUser(req);
  if (user.role === "AUTHOR") {
    parse(AuthorUpdateTicketBody, req.body);
    res.json({ data: await tickets.resolveByAuthor(user, id) });
    return;
  }
  res.json({ data: await tickets.updateTicket(user, id, parse(UpdateTicketBody, req.body)) });
});

ticketsRouter.post("/:id/messages", async (req, res) => {
  const { id } = parse(IdParams, req.params);
  const message = await tickets.addMessage(currentUser(req), id, parse(CreateMessageBody, req.body));
  res.status(201).json({ data: message });
});

export const adminsRouter = Router();
adminsRouter.get("/", requireRole("ADMIN"), async (_req, res) => {
  res.json({ data: await tickets.listAdmins() });
});

ticketsRouter.post("/:id/read", requireRole("AUTHOR"), async (req, res) => {
  await insights.markRead(currentUser(req), parse(IdParams, req.params).id);
  res.status(204).end();
});

const RatingBody = z.object({
  rating: z.number().int().min(1, "Rate from 1 to 5").max(5, "Rate from 1 to 5"),
  comment: z.string().trim().max(1000).nullish().transform((v) => v || null),
});
ticketsRouter.post("/:id/rating", requireRole("AUTHOR"), async (req, res) => {
  const { id } = parse(IdParams, req.params);
  const { rating, comment } = parse(RatingBody, req.body);
  res.json({ data: await insights.rateTicket(currentUser(req), id, rating, comment) });
});
