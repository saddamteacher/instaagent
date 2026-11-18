import Link from "next/link";
import { office, oauth } from "@jarvisgram/db";
import { actorLabel, fmtTime, t } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { ctx, user } = await requireSession();
  const [st, conns] = await Promise.all([office.officeState(ctx, { logLimit: 8 }), oauth.listConnections(ctx.db, user.id)]);
  const working = st.agents.filter((a) => a.state === "working").length;
  const steps = [
    { done: conns.length > 0, label: "Claude Desktop'ga Jarvisgram konnektorini ulang", href: "/connect" },
    { done: st.accounts.length > 0, label: "Instagram akkauntini qo'shing", href: "/accounts" },
    { done: st.taskCounts.done > 0, label: "Claude'ga birinchi buyruqni bering", href: "/connect" },
  ];
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{st.workspace.name}</h1>
          <p className="sub">Jarvis buyruqlarni Claude ilovasida qabul qiladi, bu yerda esa natijani ko'rasiz va tasdiqlaysiz.</p>
        </div>
        <Link className="btn" href="/office">
          Ofisni ochish
        </Link>
      </div>

      {steps.some((s) => !s.done) && (
        <section className="card">
          <h2>Boshlash</h2>
          {steps.map((s, i) => (
            <div className="row" key={i}>
              <span className={`badge ${s.done ? "ok" : ""}`}>{s.done ? "✓" : i + 1}</span>
              <span className="grow">{s.label}</span>
              {!s.done && (
                <Link className="btn ghost sm" href={s.href}>
                  O'tish
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="grid" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="muted">{t.status.awaiting_approval}</div>
          <div className="stat" style={{ color: st.pendingApprovals ? "var(--accent)" : undefined }}>{st.pendingApprovals}</div>
          <Link href="/tasks">Ko'rib chiqish →</Link>
        </section>
        <section className="card">
          <div className="muted">Ishlayotgan agentlar</div>
          <div className="stat">
            {working} / {st.agents.length}
          </div>
          <span className="muted">{st.meeting ? `Majlis: "${st.meeting.command}"` : "Majlis yo'q"}</span>
        </section>
        <section className="card">
          <div className="muted">{t.status.in_progress} / {t.status.queued}</div>
          <div className="stat">
            {st.taskCounts.in_progress} / {st.taskCounts.queued}
          </div>
          <span className="muted">Bajarilgan: {st.taskCounts.done}</span>
        </section>
        <section className="card">
          <div className="muted">Akkauntlar</div>
          <div className="stat">{st.accounts.length}</div>
          <span className="muted">{st.activeAccount ? `Faol: @${st.activeAccount.username}` : "Faol akkaunt yo'q"}</span>
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <h2>Oxirgi harakatlar</h2>
        {st.recentLogs.length === 0 ? (
          <div className="empty">Hali harakat yo'q.</div>
        ) : (
          <div className="log">
            {st.recentLogs.map((l) => (
              <div key={l.id}>
                <span className="muted">{fmtTime(l.at)}</span>{" "}
                <b>{actorLabel(l.actor)}</b> {l.message}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
