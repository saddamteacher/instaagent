import { getDb, logs } from "@jarvisgram/db";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Agent paneli uchun: agent, joriy vazifa va uning oxirgi loglari. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const ctx = { db, workspaceId: s.workspace.id, actor: "user" };
  const agent = await db.agent.findFirst({ where: { id, workspaceId: s.workspace.id } });
  if (!agent) return Response.json({ error: "not_found" }, { status: 404 });
  const [recent, openTasks] = await Promise.all([
    logs.listLogs(ctx, { agentId: id, limit: 15 }),
    db.task.findMany({
      where: { agentId: id, status: { in: ["queued", "in_progress", "awaiting_approval"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, status: true, progress: true, kind: true },
    }),
  ]);
  return Response.json(
    {
      agent: { id: agent.id, name: agent.name, role: agent.role, state: agent.state, deskNo: agent.deskNo, paused: agent.paused },
      tasks: openTasks,
      logs: recent.map((l) => ({ id: l.id, message: l.message, at: l.createdAt.toISOString() })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
