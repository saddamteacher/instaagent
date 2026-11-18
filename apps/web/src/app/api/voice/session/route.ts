import { billing, getDb } from "@jarvisgram/db";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * ElevenLabs ovozli agent sessiyasi.
 * - ELEVENLABS_API_KEY bo'lsa (yopiq agent): server signed URL oladi, kalit brauzerga hech qachon chiqmaydi.
 * - Bo'lmasa (ochiq agent): faqat agentId qaytariladi.
 */
export async function GET() {
  const s = await currentSession();
  if (!s) return Response.json({ error: "unauthorized" }, { status: 401 });
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) return Response.json({ error: "Ovozli agent sozlanmagan" }, { status: 404 });
  const plan = await billing.currentPlan(getDb(), s.workspace.id);
  if (!plan.limits.voiceAgent) return Response.json({ error: "Ovozli agent Pro tarifidan boshlab" }, { status: 402 });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ agentId }, { headers: { "cache-control": "no-store" } });
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": key },
  });
  if (!r.ok) return Response.json({ error: "ElevenLabs sessiyasini ochib bo'lmadi" }, { status: 502 });
  const { signed_url } = (await r.json()) as { signed_url?: string };
  if (!signed_url) return Response.json({ error: "ElevenLabs javobi noto'g'ri" }, { status: 502 });
  return Response.json({ signedUrl: signed_url }, { headers: { "cache-control": "no-store" } });
}
