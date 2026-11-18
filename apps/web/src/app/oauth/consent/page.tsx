import { redirect } from "next/navigation";
import { getDb, oauth } from "@jarvisgram/db";
import { consentAction } from "@/lib/actions";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** OAuth rozilik: Claude (yoki boshqa MCP klienti) Jarvisgram hisobingizga ulanishni so'ramoqda. */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ req?: string }> }) {
  const { req } = await searchParams;
  const self = `/oauth/consent?req=${encodeURIComponent(req ?? "")}`;
  const s = await currentSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(self)}`);

  const a = req ? await oauth.getPendingAuthorization(getDb(), req) : null;
  if (!a)
    return (
      <main className="auth">
        <div className="card">
          <h1>So'rov topilmadi</h1>
          <p className="sub">Ulanish so'rovining muddati o'tgan yoki u allaqachon ishlatilgan. Claude'da qayta "Connect" ni bosing.</p>
        </div>
      </main>
    );

  return (
    <main className="auth">
      <form action={consentAction} className="card">
        <input type="hidden" name="req" value={a.id} />
        <div className="logo" style={{ padding: "0 0 8px" }}>
          Jarvis<span>gram</span>
        </div>
        <h1>Ulanishga ruxsat berasizmi?</h1>
        <p className="sub" style={{ margin: "8px 0 14px" }}>
          <b>{a.clientName}</b> sizning <b>{s.workspace.name}</b> ofisingizga ulanmoqchi ({s.user.email}).
        </p>
        <ul className="muted" style={{ paddingLeft: 18, margin: "0 0 14px" }}>
          <li>Akkauntlar, vazifalar, kontent va statistikani ko'rish va o'zgartirish</li>
          <li>Ofisdagi agentlarni boshqarish va logga yozish</li>
          <li>Tasdiqlash — faqat siz bergan kod bilan</li>
        </ul>
        <p className="muted">Qaytish manzili: {new URL(a.redirectUri).host}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" name="decision" value="approve" style={{ flex: 1 }}>
            Ruxsat berish
          </button>
          <button className="btn ghost" name="decision" value="deny" style={{ flex: 1 }}>
            Rad etish
          </button>
        </div>
      </form>
    </main>
  );
}
