import { Router } from "express";
import { parse } from "../../lib/validation.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import * as tickets from "./tickets.service.js";
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

// Declared before "/:id" so "stats" isn't captured as an id.
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
