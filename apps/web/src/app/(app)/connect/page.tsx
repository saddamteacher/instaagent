import { oauth } from "@jarvisgram/db";
import { CopyButton } from "@/components/CopyButton";
import { revokeConnectionAction } from "@/lib/actions";
import { fmtDateTime } from "@/lib/i18n";
import { mcpUrl, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const { ctx, user } = await requireSession();
  const url = mcpUrl();
  const conns = await oauth.listConnections(ctx.db, user.id);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Claude'ga ulash</h1>
          <p className="sub">
            Jarvis — sizning Claude ilovangiz. Jarvisgram unga konnektor sifatida ulanadi; Claude obunangiz tokeni bu yerda ishlatilmaydi.
          </p>
        </div>
      </div>

      <section className="card">
        <h2>Konnektor manzili</h2>
        <div className="code-box">
          <code>{url}</code>
          <CopyButton text={url} label="Manzilni nusxalash" />
        </div>
        <ol className="steps" style={{ marginTop: 16 }}>
          <li>
            Claude Desktop (yoki claude.ai) → <b>Settings → Connectors → Add custom connector</b>.
          </li>
          <li>
            Nom: <code>Jarvisgram</code>, URL: yuqoridagi manzil. <b>Add</b> ni bosing.
          </li>
          <li>
            <b>Connect</b> bosilganda Jarvisgram oynasi ochiladi — hisobingizga kirib, <b>Ruxsat berish</b> ni bosing.
          </li>
          <li>
            Claude'da yozing: <i>"Jarvis, ofis holatini ko'rsat"</i>. Ofisda jonli ko'rinadi.
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>Qo'shimcha konnektorlar</h2>
        <div className="row">
          <span className="grow">
            <b>Claude in Chrome</b> — Instagram harakatlari sizning brauzeringizda, sizning Chrome profilingizda bajariladi.
            Jarvisgram o'zi Instagramga kirmaydi va parolingizni saqlamaydi.
          </span>
        </div>
        <div className="row">
          <span className="grow">
            <b>ElevenLabs MCP</b> (ixtiyoriy) — Reels uchun ovoz yaratish. Claude Desktop'ga alohida ulanadi (5-bosqich).
          </span>
        </div>
        <div className="alert warn" style={{ marginTop: 12, marginBottom: 0 }}>
          Diqqat: brauzer avtomatizatsiyasi Instagram qoidalariga zid, akkaunt cheklanishi mumkin. Biznes/creator akkauntlar uchun
          rasmiy Graph API rejimi tavsiya etiladi.
        </div>
      </section>

      <section className="card">
        <h2>Ulangan ilovalar</h2>
        {conns.length === 0 ? (
          <div className="empty">Hali ulanish yo'q.</div>
        ) : (
          conns.map((c) => {
            const meta = c.client.metadata as { client_name?: string };
            return (
              <div className="row" key={c.id}>
                <span className="grow">
                  <b>{meta.client_name ?? c.clientId}</b>
                  <div className="muted">Ulangan: {fmtDateTime(c.createdAt)}</div>
                </span>
                <form action={revokeConnectionAction}>
                  <input type="hidden" name="tokenId" value={c.id} />
                  <button className="btn danger sm">Uzish</button>
                </form>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
