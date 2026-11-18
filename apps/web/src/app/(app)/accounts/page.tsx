import { accounts } from "@jarvisgram/db";
import { AddAccountForm } from "@/components/AddAccountForm";
import { switchAccountAction } from "@/lib/actions";
import { fmtDateTime, t } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const tone: Record<string, string> = { connected: "ok", needs_login: "warn", limited: "danger", disconnected: "danger", pending: "" };

export default async function AccountsPage() {
  const { ctx, workspace } = await requireSession();
  const list = await accounts.listAccounts(ctx);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Instagram akkauntlar</h1>
          <p className="sub">Holat Claude Chrome'da tekshirgach yangilanadi.</p>
        </div>
      </div>
      <section className="card">
        <h2>Akkaunt qo'shish</h2>
        <AddAccountForm />
      </section>
      <section className="card">
        <h2>Akkauntlar</h2>
        {list.length === 0 && <div className="empty">Hali akkaunt yo'q.</div>}
        {list.map((a) => {
          const lim = accounts.readLimits(a.dailyLimits);
          const active = a.id === workspace.activeAccountId;
          return (
            <div className="row" key={a.id}>
              <span className="grow">
                <b>@{a.username}</b> {active && <span className="badge accent">faol</span>}
                <div className="muted">
                  {a.publishMode === "graph_api" ? "Graph API" : "Claude in Chrome"}
                  {a.chromeProfile ? ` · profil: ${a.chromeProfile}` : ""} · kunlik limit: {lim.publish} nashr, {lim.comment_reply} javob,{" "}
                  {lim.dm} DM · pauza {lim.minPauseSec}–{lim.maxPauseSec} s
                  {a.lastCheckedAt ? ` · tekshirildi ${fmtDateTime(a.lastCheckedAt)}` : ""}
                </div>
              </span>
              <span className={`badge ${tone[a.status] ?? ""}`}>{t.accountStatus[a.status]}</span>
              {!active && (
                <form action={switchAccountAction}>
                  <input type="hidden" name="accountId" value={a.id} />
                  <button className="btn ghost sm">Faol qilish</button>
                </form>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
