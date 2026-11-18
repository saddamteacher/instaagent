import { billing, getDb } from "@jarvisgram/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Click SHOP API — Complete (action=1). Click kabinetida "Complete URL": WEB_PUBLIC_URL/api/pay/click/complete */
export async function POST(req: Request) {
  const cfg = billing.clickConfigFromEnv();
  if (!cfg) return Response.json({ error: -8, error_note: "Not configured" });
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  return Response.json(await billing.handleClick(getDb(), cfg, params, 1));
}
