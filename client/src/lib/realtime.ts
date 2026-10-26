/**
 * Real-time ticket updates over Server-Sent Events.
 *
 * Uses fetch() streaming rather than EventSource so the JWT goes in the
 * Authorization header (EventSource can't set headers, which would force the
 * token into the URL). Events are invalidation signals: on each one we mark
 * the affected queries stale and React Query refetches what's on screen.
 * Reconnects with exponential backoff; refetches everything after a reconnect
 * in case events were missed while offline.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, tokenStore } from "./api";

export type ConnectionState = "connecting" | "live" | "offline";

interface TicketEvent {
  type: string;
  ticketId: string;
}

export function useTicketEvents(enabled: boolean): ConnectionState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let attempt = 0;
    let hadConnection = false;

    const handle = (event: TicketEvent) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] }); // lists + stats
      queryClient.invalidateQueries({ queryKey: ["ticket", event.ticketId] });
    };

    async function connect() {
      while (!controller.signal.aborted) {
        try {
          setState("connecting");
          const res = await fetch(`${API_BASE}/events`, {
            headers: { Authorization: `Bearer ${tokenStore.get()}` },
            signal: controller.signal,
          });
          if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

          setState("live");
          if (hadConnection) queryClient.invalidateQueries(); // catch up on anything missed
          hadConnection = true;
          attempt = 0;

          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const data = frame.split("\n").find((l) => l.startsWith("data: "));
              const type = frame.split("\n").find((l) => l.startsWith("event: "))?.slice(7);
              if (data && type && type !== "ready") handle({ type, ...JSON.parse(data.slice(6)) });
            }
          }
        } catch {
          if (controller.signal.aborted) return;
        }
        setState("offline");
        const delay = Math.min(30_000, 1000 * 2 ** attempt++);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    void connect();
    return () => controller.abort();
  }, [enabled, queryClient]);

  return state;
}
