/**
 * In-process event bus for real-time ticket updates.
 *
 * Events are deliberately thin "something changed" signals ({ ticketId }),
 * not data payloads. Clients refetch through the normal REST endpoints, which
 * means authorization and field filtering (e.g. hiding internal notes) live in
 * exactly one place — the API — rather than being duplicated in the stream.
 *
 * Limitation: a single Node process. With multiple instances this would be
 * backed by Postgres LISTEN/NOTIFY or Redis pub/sub behind the same interface.
 */
import { EventEmitter } from "node:events";

export type TicketEventType = "ticket.created" | "ticket.updated" | "message.created";

export interface TicketEvent {
  type: TicketEventType;
  ticketId: string;
  /** Owner of the ticket — used to route the event to that author's streams. */
  authorId: string;
  /** Internal-only events (e.g. an internal note) are never sent to authors. */
  internal: boolean;
  at: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per open SSE connection

export function publish(event: Omit<TicketEvent, "at">) {
  bus.emit("ticket", { ...event, at: new Date().toISOString() } satisfies TicketEvent);
}

export function subscribe(listener: (event: TicketEvent) => void): () => void {
  bus.on("ticket", listener);
  return () => bus.off("ticket", listener);
}
