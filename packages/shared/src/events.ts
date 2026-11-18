/** Postgres LISTEN/NOTIFY kanali: MCP va veb jarayonlari o'rtasida jonli holat. */
export const EVENTS_CHANNEL = "jarvisgram_events";

export type OfficeEventType =
  | "log"
  | "task"
  | "meeting"
  | "account"
  | "agents"
  | "content"
  | "analytics";

/** NOTIFY payload (8000 baytdan kichik bo'lishi shart — faqat identifikatorlar). */
export interface OfficeEvent {
  workspaceId: string;
  type: OfficeEventType;
  /** Tegishli yozuv id'si (task, meeting, ...) */
  refId?: string;
  /** Qisqa matn (log yozuvi). */
  message?: string;
  /** Log muallifi: "jarvis" | "user" | "system" | rol kaliti. */
  actor?: string;
  /** Gapirayotgan agent (ofisda bulutcha shu agent ustida chiqadi). */
  agentId?: string;
  /** Komiks gap bulutchasi matni (o'zbekcha, qisqa). */
  bubble?: string;
  at: string;
}
