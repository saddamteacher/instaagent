import { accounts, actions, graph } from "@jarvisgram/db";
import { AddAccountForm } from "@/components/AddAccountForm";
import { LimitsForm } from "@/components/LimitsForm";
import { disconnectGraphAction, switchAccountAction } from "@/lib/actions";
import { fmtDateTime, fmtTime, t } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const tone: Record<string, string> = { connected: "ok", needs_login: "warn", limited: "danger", disconnected: "danger", pending: "" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ ig?: string; ig_error?: string }> }) {
  const { ctx, workspace } = await requireSession();
  const sp = await searchParams;
  const list = await accounts.listAccounts(ctx);
  const graphReady = !!graph.graphConfigFromEnv();
  const usage = await Promise.all(
    list.map(async (a) => ({
      publish: await actions.usedToday(ctx, a.id, "publish"),
      comment_reply: await actions.usedToday(ctx, a.id, "comment_reply"),
      dm: await actions.usedToday(ctx, a.id, "dm"),
    })),
  );
  const now = new Date();
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Instagram akkauntlar</h1>
          <p className="sub">Holat Claude Chrome'da tekshirgach yangilanadi. Limit va pauzalar har bir harakatdan oldin serverda tekshiriladi.</p>
        </div>
      </div>
      {sp.ig === "ok" && <div className="alert ok">Rasmiy Graph API ulandi. Endi nashrlar Instagram API orqali bajariladi.</div>}
      {sp.ig_error && <div className="alert error">{sp.ig_error}</div>}

      <section className="card">
        <h2>Akkaunt qo'shish</h2>
        <AddAccountForm />
      </section>

      {list.length === 0 && (
        <section className="card">
          <div className="empty">Hali akkaunt yo'q.</div>
        </section>
      )}
      {list.map((a, i) => {
        const lim = accounts.readLimits(a.dailyLimits);
        const u = usage[i]!;
        const active = a.id === workspace.activeAccountId;
        const waitUntil = a.nextActionAfter && a.nextActionAfter > now ? a.nextActionAfter : null;
        return (
          <section className="card" key={a.id}>
            <div className="row" style={{ paddingTop: 0 }}>
              <span className="grow">
                <b>@{a.username}</b> {active && <span className="badge accent">faol</span>}
                <div className="muted">
                  {a.publishMode === "graph_api" ? "Rasmiy Graph API" : "Claude in Chrome"}
                  {a.chromeProfile ? ` · Chrome profili: ${a.chromeProfile}` : ""}
                  {a.lastCheckedAt ? ` · tekshirildi ${fmtDateTime(a.lastCheckedAt)}` : " · hali tekshirilmagan"}
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

            <div className="usage">
              <span>
                Bugun: nashr <b>{u.publish}/{lim.publish}</b> · izoh javobi <b>{u.comment_reply}/{lim.comment_reply}</b> · DM{" "}
                <b>{u.dm}/{lim.dm}</b>
              </span>
              <span className="muted">{waitUntil ? `Keyingi harakat ${fmtTime(waitUntil, true)} dan keyin` : "Keyingi harakatga tayyor"}</span>
            </div>
            {a.status === "limited" && (
              <div className="alert error" style={{ marginTop: 10 }}>
                Instagram cheklov ko'rsatgan. Barcha harakatlar to'xtatildi. Cheklov tugagach Claude'ga akkauntni qayta tekshirishni ayting.
              </div>
            )}

            <details style={{ marginTop: 10 }}>
              <summary className="muted" style={{ cursor: "pointer" }}>
                Limitlar va pauza
              </summary>
              <div style={{ marginTop: 10 }}>
                <LimitsForm accountId={a.id} limits={lim} />
              </div>
            </details>

            <div className="row" style={{ marginTop: 6 }}>
              <span className="grow muted">
                {a.graphTokenEnc
                  ? `Graph API ulangan${a.graphTokenExpiresAt ? ` · token ${fmtDateTime(a.graphTokenExpiresAt)} gacha (avtomatik yangilanadi)` : ""}`
                  : "Rasmiy API: biznes/creator akkauntlar uchun xavfsizroq yo'l (Instagram qoidalariga mos)."}
              </span>
              {a.graphTokenEnc ? (
                <form action={disconnectGraphAction}>
                  <input type="hidden" name="accountId" value={a.id} />
                  <button className="btn danger sm">Graph API'ni uzish</button>
                </form>
              ) : graphReady ? (
                <a className="btn sm" href={`/api/instagram/connect?accountId=${a.id}`}>
                  Instagram API orqali ulash
                </a>
              ) : (
                <span className="badge" title="INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET sozlanmagan">
                  Graph API sozlanmagan
                </span>
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}
