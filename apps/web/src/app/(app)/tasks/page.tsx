import { ROLE_GUIDES, type ActionPayload } from "@jarvisgram/shared";
import { approvals, tasks } from "@jarvisgram/db";
import { ApprovalCard } from "@/components/ApprovalCard";
import { LiveRefresh } from "@/components/LiveRefresh";
import { fmtDateTime, t } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const scheduled = (p: unknown) => {
  const v = (p as { scheduledAt?: string | null } | null)?.scheduledAt;
  return v ? fmtDateTime(v) : null;
};


const tone: Record<string, string> = {
  queued: "",
  in_progress: "info",
  awaiting_approval: "accent",
  approved: "ok",
  rejected: "danger",
  done: "ok",
};

export default async function TasksPage() {
  const { ctx } = await requireSession();
  const since = new Date(Date.now() - 2 * 60_000);
  const [queue, list, recent] = await Promise.all([
    approvals.listApprovals(ctx),
    tasks.listTasks(ctx, { limit: 100 }),
    ctx.db.task.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [{ status: "approved", approvedAt: { gte: since } }, { status: "rejected", updatedAt: { gte: since } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);
  return (
    <>
      <LiveRefresh types={["task", "meeting"]} />
      <div className="pagehead">
        <div>
          <h1>Vazifalar</h1>
          <p className="sub">Har bir nashr, izoh javobi va DM avval shu yerga tushadi va faqat siz tasdiqlaganingizdan keyin bajariladi.</p>
        </div>
      </div>

      <section className="card">
        <h2>
          {t.status.awaiting_approval} {queue.length > 0 && <span className="badge accent">{queue.length}</span>}
        </h2>
        {recent.map((r) => (
          <div key={r.id} className={`alert ${r.status === "approved" ? "ok" : "warn"}`} role="status">
            {r.status === "approved" ? "✓ Tasdiqlandi" : "Rad etildi"}: <b>{r.title}</b>
            {r.status === "approved" ? " — Claude bajaradi (yoki Claude'ga «bajar» deb ayting)." : r.reviewNote ? ` — izoh: ${r.reviewNote}` : ""}
          </div>
        ))}
        {queue.length === 0 ? (
          <div className="empty">Tasdiq kutayotgan narsa yo'q.</div>
        ) : (
          <>
            <p className="muted">
              Instagram'da aynan shu ko'rinishda chiqadi. Matnni tahrirlab tasdiqlashingiz yoki Claude'ga kodni aytishingiz mumkin
              (masalan: <i>"tasdiqlayman, kod K7M2QX"</i>). Kodsiz Claude o'zi tasdiqlay olmaydi.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {queue.map((q) => (
                <ApprovalCard
                  key={q.id}
                  a={{
                    id: q.id,
                    title: q.title,
                    kindLabel: t.kind[q.kind],
                    roleTitle: ROLE_GUIDES[q.role].title,
                    agentName: q.agent?.name ?? null,
                    username: q.account?.username ?? null,
                    publishMode: q.account?.publishMode ?? null,
                    code: q.approvalCode,
                    payload: (q.payload as ActionPayload | null) ?? null,
                    result: JSON.stringify(q.result, null, 2),
                    submittedAt: q.submittedAt ? fmtDateTime(q.submittedAt) : null,
                    scheduledLabel: scheduled(q.payload),
                  }}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Barcha vazifalar</h2>
        {list.length === 0 && <div className="empty">Hali vazifa yo'q. Claude'ga buyruq bering.</div>}
        {list.map((x) => (
          <div className="row" key={x.id}>
            <span className="grow">
              <b>{x.title}</b>
              <div className="muted">
                {ROLE_GUIDES[x.role].title}
                {x.agent ? ` · ${x.agent.name} (stol ${x.agent.deskNo})` : ""} · {t.kind[x.kind]}
                {x.account ? ` · @${x.account.username}` : ""}
                {x.reviewNote ? ` · izoh: ${x.reviewNote}` : ""}
              </div>
            </span>
            {x.status === "in_progress" && (
              <span className="bar" aria-label={`${x.progress}%`}>
                <i style={{ width: `${x.progress}%` }} />
              </span>
            )}
            {x.status === "approved" && x.actionError && (
              <span className="badge danger" title={x.actionError}>
                Bajarilmadi
              </span>
            )}
            {x.status === "approved" && !x.actionError && x.actionStartedAt && Date.now() - x.actionStartedAt.getTime() < 15 * 60_000 && (
              <span className="badge info">Instagram'da bajarilmoqda</span>
            )}
            {x.status === "done" && typeof (x.result as { permalink?: unknown } | null)?.permalink === "string" && (
              <a href={(x.result as { permalink: string }).permalink} target="_blank" rel="noreferrer noopener" className="muted">
                Instagram'da ochish ↗
              </a>
            )}
            <span className={`badge ${tone[x.status]}`}>{t.status[x.status]}</span>
          </div>
        ))}
      </section>
    </>
  );
}
