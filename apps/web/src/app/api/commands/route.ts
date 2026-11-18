import { DomainError, commands, getDb } from "@jarvisgram/db";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Bir xil saytdan kelgan so'rovmi (CSRF himoyasi: cookie sessiyasi bilan ishlaydi). */
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Buyruqlar qutisiga yozish (veb-ofis matn maydoni yoki ElevenLabs ovozli agentning client tool'i). */
export async function POST(req: Request) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!sameOrigin(req) || !req.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; source?: unknown };
  const ctx = { db: getDb(), workspaceId: s.workspace.id, actor: "user" };
  try {
    const c = await commands.createCommand(ctx, {
      text: typeof body.text === "string" ? body.text : "",
      source: body.source === "voice" ? "voice" : "web",
    });
    return Response.json({ id: c.id, text: c.text });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
