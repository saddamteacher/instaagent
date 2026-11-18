import { cookies } from "next/headers";
import { DomainError, getDb, graph, logs } from "@jarvisgram/db";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IG_STATE_COOKIE = "jg_ig_state";

/** Instagram Login qaytish manzili (INSTAGRAM_REDIRECT_URI = WEB_PUBLIC_URL/api/instagram/callback). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(new URL(`/accounts?${q}`, url), 302);
  const s = await currentSession();
  if (!s) return Response.redirect(new URL("/login?next=/accounts", url), 302);

  const jar = await cookies();
  const saved = jar.get(IG_STATE_COOKIE)?.value ?? "";
  jar.delete({ name: IG_STATE_COOKIE, path: "/api/instagram" });
  const [state, accountId] = saved.split(".");
  if (!state || state !== url.searchParams.get("state"))
    return back("ig_error=" + encodeURIComponent("Ulanish so'rovi yaroqsiz yoki muddati o'tgan. Qayta urinib ko'ring."));
  if (url.searchParams.get("error"))
    return back("ig_error=" + encodeURIComponent(url.searchParams.get("error_description") ?? "Instagram ruxsat bermadi"));

  const cfg = graph.graphConfigFromEnv();
  const code = url.searchParams.get("code");
  if (!cfg || !code || !accountId) return back("ig_error=" + encodeURIComponent("Graph API sozlanmagan"));

  const ctx = { db: getDb(), workspaceId: s.workspace.id, actor: "user" };
  try {
    // Instagram ba'zan kod oxiriga "#_" qo'shadi
    const acc = await graph.connectGraphAccount(ctx, new graph.GraphClient(cfg), accountId, code.replace(/#_$/, ""));
    await logs.addLog(ctx, { message: `@${acc.username}: rasmiy Graph API ulandi`, tool: "web" });
    return back("ig=ok");
  } catch (e) {
    return back("ig_error=" + encodeURIComponent(e instanceof DomainError ? e.message : "Instagram bilan ulanishda xato"));
  }
}
