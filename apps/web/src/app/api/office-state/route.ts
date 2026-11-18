import { getDb, office } from "@jarvisgram/db";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const s = await currentSession();
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  const state = await office.officeState({ db: getDb(), workspaceId: s.workspace.id, actor: "user" });
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}
