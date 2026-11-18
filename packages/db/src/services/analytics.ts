import type { Prisma } from "../generated/prisma/client";
import { notify } from "../events";
import { getAccount } from "./accounts";
import type { Ctx } from "./context";

export interface SnapshotInput {
  accountId: string;
  followers?: number;
  following?: number;
  posts?: number;
  reach?: number;
  impressions?: number;
  profileViews?: number;
  engagementRate?: number;
  source?: "chrome" | "graph_api" | "manual";
  capturedAt?: Date;
  raw?: Prisma.InputJsonValue;
}

export async function saveSnapshot(ctx: Ctx, input: SnapshotInput) {
  await getAccount(ctx, input.accountId);
  const { raw, ...rest } = input;
  const s = await ctx.db.analyticsSnapshot.create({
    data: { ...rest, raw: raw ?? undefined, source: input.source ?? "chrome", workspaceId: ctx.workspaceId },
  });
  await notify(ctx.db, { workspaceId: ctx.workspaceId, type: "analytics", refId: s.id });
  return s;
}

const METRICS = ["followers", "following", "posts", "reach", "impressions", "profileViews", "engagementRate"] as const;

export async function getAnalytics(ctx: Ctx, f: { accountId: string; days?: number }) {
  await getAccount(ctx, f.accountId);
  const since = new Date(Date.now() - (f.days ?? 30) * 86400_000);
  const snapshots = await ctx.db.analyticsSnapshot.findMany({
    where: { accountId: f.accountId, capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
  });
  const first = snapshots[0];
  const last = snapshots.at(-1);
  const delta: Partial<Record<(typeof METRICS)[number], number>> = {};
  if (first && last && first !== last)
    for (const m of METRICS) {
      const a = first[m];
      const b = last[m];
      if (typeof a === "number" && typeof b === "number") delta[m] = Math.round((b - a) * 1000) / 1000;
    }
  return { snapshots, latest: last ?? null, delta };
}

/** Analitika ekrani uchun: davrdagi suratlar, o'zgarish va bajarilgan nashrlar soni. */
export async function analyticsOverview(ctx: Ctx, f: { accountId: string; days: number }) {
  const base = await getAnalytics(ctx, f);
  const since = new Date(Date.now() - f.days * 86400_000);
  const [published, replies, byRole] = await Promise.all([
    ctx.db.task.count({ where: { accountId: f.accountId, kind: "publish", status: "done", completedAt: { gte: since } } }),
    ctx.db.task.count({ where: { accountId: f.accountId, kind: { in: ["comment_reply", "dm"] }, status: "done", completedAt: { gte: since } } }),
    ctx.db.task.groupBy({
      by: ["role"],
      where: { workspaceId: ctx.workspaceId, accountId: f.accountId, status: "done", completedAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);
  return { ...base, published, replies, doneByRole: byRole.map((r) => ({ role: r.role, count: r._count._all })) };
}
