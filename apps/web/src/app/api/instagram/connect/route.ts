import { cookies } from "next/headers";
import { accounts, getDb, graph, randomToken } from "@jarvisgram/db";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IG_STATE_COOKIE = "jg_ig_state";

/** Rasmiy Instagram Login (Graph API) — foydalanuvchini Instagram ruxsat sahifasiga yuboradi. */
export async function GET(req: Request) {
  const s = await currentSession();
  const base = new URL(req.url);
  if (!s) return Response.redirect(new URL("/login?next=/accounts", base), 302);
  const cfg = graph.graphConfigFromEnv();
  if (!cfg) return Response.redirect(new URL("/accounts?ig_error=" + encodeURIComponent("Graph API sozlanmagan"), base), 302);

  const accountId = base.searchParams.get("accountId") ?? "";
  const ctx = { db: getDb(), workspaceId: s.workspace.id, actor: "user" };
  try {
    await accounts.getAccount(ctx, accountId);
  } catch {
    return Response.redirect(new URL("/accounts?ig_error=" + encodeURIComponent("Akkaunt topilmadi"), base), 302);
  }
  const state = randomToken("", 24);
  (await cookies()).set(IG_STATE_COOKIE, `${state}.${accountId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/instagram",
    maxAge: 600,
  });
  return Response.redirect(new graph.GraphClient(cfg).authorizeUrl(state), 302);
}
