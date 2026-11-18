import pg from "pg";
import { EVENTS_CHANNEL, type OfficeEvent } from "@jarvisgram/shared";
import type { Db } from "./client";

/** Ofis hodisasini Postgres NOTIFY orqali tarqatadi (MCP → veb SSE). */
export async function notify(db: Db, ev: Omit<OfficeEvent, "at">): Promise<void> {
  const payload = JSON.stringify({ ...ev, message: ev.message?.slice(0, 300), bubble: ev.bubble?.slice(0, 80), at: new Date().toISOString() });
  await db.$executeRaw`SELECT pg_notify(${EVENTS_CHANNEL}, ${payload})`;
}

/**
 * Hodisalarni tinglash (bitta doimiy ulanish). Qaytgan funksiya ulanishni yopadi.
 * Ulanish uzilsa 2 soniyadan keyin qayta ulanadi.
 */
export function listen(
  onEvent: (ev: OfficeEvent) => void,
  connectionString = process.env.DATABASE_URL,
): { ready: Promise<void>; close: () => Promise<void> } {
  let client: pg.Client | null = null;
  let closed = false;

  const connect = async (): Promise<void> => {
    if (closed) return;
    const c = new pg.Client({ connectionString });
    client = c;
    c.on("notification", (msg) => {
      if (msg.channel !== EVENTS_CHANNEL || !msg.payload) return;
      try {
        onEvent(JSON.parse(msg.payload) as OfficeEvent);
      } catch {
        /* noto'g'ri payload — e'tiborsiz */
      }
    });
    c.on("error", () => {
      c.end().catch(() => {});
      if (!closed) setTimeout(() => void connect(), 2000);
    });
    try {
      await c.connect();
      await c.query(`LISTEN ${EVENTS_CHANNEL}`);
    } catch {
      if (!closed) setTimeout(() => void connect(), 2000);
    }
  };
  const ready = connect();

  return {
    ready,
    close: async () => {
      closed = true;
      await ready;
      await client?.end().catch(() => {});
    },
  };
}
