import { billing, getDb } from "@jarvisgram/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Payme Merchant API endpoint (kassa sozlamalarida "Endpoint URL": WEB_PUBLIC_URL/api/pay/payme).
 * Payme talabi: javob har doim HTTP 200, xatolar JSON-RPC error obyektida.
 */
export async function POST(req: Request) {
  const cfg = billing.paymeConfigFromEnv();
  const body = await req.json().catch(() => null);
  if (!cfg)
    return Response.json({ id: (body as { id?: unknown } | null)?.id ?? null, error: { code: -32400, message: { ru: "Не настроено", uz: "Sozlanmagan", en: "Not configured" } } });
  if (body === null)
    return Response.json({ id: null, error: { code: -32700, message: { ru: "Ошибка парсинга JSON", uz: "JSON xato", en: "Parse error" } } });
  return Response.json(await billing.handlePayme(getDb(), cfg, body, req.headers.get("authorization")));
}
