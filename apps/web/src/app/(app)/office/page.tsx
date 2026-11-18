import { office } from "@jarvisgram/db";
import { LiveRefresh } from "@/components/LiveRefresh";
import { toggleAgentPauseAction } from "@/lib/actions";
import { actorLabel, fmtTime, t } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const tone = { chill: "", meeting: "accent", toDesk: "info", working: "ok" } as const;

/**
 * 1-bosqich: office_state'ning jonli jadval ko'rinishi.
 * 2-bosqichda shu ma'lumot ustiga canvas simulyatsiyasi (render qatlami) quriladi.
 */
export default async function OfficePage() {
  const { ctx } = await requireSession();
  const st = await office.officeState(ctx, { logLimit: 30 });
  return (
    <>
      <LiveRefresh />
      <div className="pagehead">
        <div>
          <h1>Ofis</h1>
          <p className="sub">
            Jonli holat (Claude'dagi har bir harakat shu zahoti ko'rinadi). Vizual simulyatsiya 2-bosqichda.
          </p>
        </div>
        {st.activeAccount && <span className="badge accent">@{st.activeAccount.username}</span>}
      </div>

      {st.meeting && (
        <div className="alert warn">
          <b>Majlis zalida:</b> Jarvis buyruqni tushuntirmoqda — "{st.meeting.command}"
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <section className="card">
          <h2>Agentlar ({st.agents.length})</h2>
          {st.agents.map((a) => (
            <div className="row nowrap" key={a.id}>
              <span className="muted" style={{ width: 28 }}>#{a.deskNo}</span>
              <span className="grow">
                <b>{a.name}</b> <span className="muted">· {a.roleTitle}</span>
                {a.task && <div className="muted">{a.task.title}</div>}
              </span>
              {a.task?.status === "in_progress" && (
                <span className="bar" aria-label={`${a.task.progress}%`}>
                  <i style={{ width: `${a.task.progress}%` }} />
                </span>
              )}
              <span className={`badge ${tone[a.state]}`}>{a.paused ? "To'xtatilgan" : t.agentState[a.state]}</span>
              <form action={toggleAgentPauseAction}>
                <input type="hidden" name="agentId" value={a.id} />
                <input type="hidden" name="paused" value={String(!a.paused)} />
                <button className="btn ghost sm" title={a.paused ? "Yangi vazifa olishga ruxsat" : "Yangi vazifa bermaslik"}>
                  {a.paused ? "Davom" : "To'xtatish"}
                </button>
              </form>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>Jonli log</h2>
          {st.recentLogs.length === 0 ? (
            <div className="empty">Hali harakat yo'q.</div>
          ) : (
            <div className="log">
              {st.recentLogs.map((l) => (
                <div key={l.id}>
                  <span className="muted">
                    {fmtTime(l.at, true)}
                  </span>{" "}
                  <b>{actorLabel(l.actor)}</b> {l.message}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
