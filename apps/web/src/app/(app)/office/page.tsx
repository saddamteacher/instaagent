import { office } from "@jarvisgram/db";
import { OfficeView } from "@/components/OfficeView";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Asosiy ekran: virtual ofis. Holat office_state'dan, jonli yangilanish SSE orqali. */
export default async function OfficePage() {
  const { ctx } = await requireSession();
  const initial = await office.officeState(ctx, { logLimit: 15 });
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Ofis</h1>
          <p className="sub">Claude'dagi har bir harakat shu yerda jonli ko'rinadi. Agent ustiga bosing.</p>
        </div>
      </div>
      <OfficeView initial={JSON.parse(JSON.stringify(initial))} />
    </>
  );
}
