// Domen enumlari. Prisma sxemasidagi enumlar bilan bir xil bo'lishi shart
// (packages/db/test/enums.test.ts buni tekshiradi).

export const AGENT_ROLES = [
  "copywriter",
  "editor",
  "smm",
  "analyst",
  "commenter",
  "designer",
  "scriptwriter",
  "hashtagger",
  "trendHunter",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_STATES = ["chill", "meeting", "toDesk", "working"] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const TASK_STATUSES = [
  "queued",
  "in_progress",
  "awaiting_approval",
  "approved",
  "rejected",
  "done",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Vazifa turi. publish / comment_reply / dm — tashqi dunyoga chiqadigan
 * harakatlar, ular HAR DOIM foydalanuvchi tasdig'idan o'tadi.
 * Begona postlarga izoh, layk, follow, ommaviy DM turlari ataylab yo'q.
 */
export const TASK_KINDS = [
  "content",
  "research",
  "analysis",
  "publish",
  "comment_reply",
  "dm",
  "other",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const APPROVAL_REQUIRED_KINDS: readonly TaskKind[] = ["publish", "comment_reply", "dm"];
export const requiresApproval = (kind: TaskKind) => APPROVAL_REQUIRED_KINDS.includes(kind);

export const ACCOUNT_STATUSES = ["pending", "connected", "needs_login", "limited", "disconnected"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** chrome — Claude in Chrome (foydalanuvchi brauzeri); graph_api — rasmiy Instagram Graph API. */
export const PUBLISH_MODES = ["chrome", "graph_api"] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

export const CONTENT_TYPES = ["post", "reel", "carousel", "story"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STATUSES = ["draft", "awaiting_approval", "approved", "published", "rejected"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Akkaunt uchun standart kunlik limitlar va harakatlar orasidagi pauza. */
export const DEFAULT_DAILY_LIMITS = {
  publish: 3,
  comment_reply: 40,
  dm: 20,
  minPauseSec: 45,
  maxPauseSec: 240,
} as const;
export type DailyLimits = {
  publish: number;
  comment_reply: number;
  dm: number;
  minPauseSec: number;
  maxPauseSec: number;
};

export const TOTAL_DESKS = 20;
