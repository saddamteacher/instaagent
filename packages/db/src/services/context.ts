import type { Db } from "../client";

/** Har bir domen chaqiruvi kontekst bilan ishlaydi: qaysi workspace va kim harakat qilmoqda. */
export interface Ctx {
  db: Db;
  workspaceId: string;
  /** "jarvis" (MCP orqali Claude), "user" (veb-ilova), "system" */
  actor: string;
}

export const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
