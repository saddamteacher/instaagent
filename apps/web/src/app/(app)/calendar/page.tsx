import Link from "next/link";
import { accounts as accountsSvc, content, schedules } from "@jarvisgram/db";
import { ROLE_GUIDES, WEEKDAYS_UZ, nextOccurrence, toLocalInput, zonedParts, zonedToUtc } from "@jarvisgram/shared";
import { RescheduleForm, ScheduleForm } from "@/components/CalendarForms";
import { LiveRefresh } from "@/components/LiveRefresh";
import { deleteScheduleAction, toggleScheduleAction } from "@/lib/actions";
import { MONTHS_UZ, TZ, contentTypeLabel, fmtDateTime, fmtTime, t } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  draft: "Qoralama",
  awaiting_approval: "Tasdiq kutmoqda",
  approved: "Tasdiqlangan",
  published: "Nashr qilindi",
  rejected: "Rad etilgan",
};
const statusTone: Record<string, string> = { draft: "", awaiting_approval: "accent", approved: "info", published: "ok", rejected: "danger" };

const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; a?: string }> }) {
  const { ctx } = await requireSession();
  const sp = await searchParams;
  const now = zonedParts(new Date(), TZ);
  const mm = /^(\d{4})-(\d{2})$/.exec(sp.m ?? "");
  const year = mm ? +mm[1]! : now.year;
  const month = mm ? Math.min(12, Math.max(1, +mm[2]!)) : now.month;

  // Oylik to'r: dushanbadan boshlanadi
  const firstNoon = new Date(Date.UTC(year, month - 1, 1, 12));
  const lead = (firstNoon.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - lead, 12));
  const from = zonedToUtc(gridStart.getUTCFullYear(), gridStart.getUTCMonth() + 1, gridStart.getUTCDate(), 0, 0, TZ);
  const to = new Date(from.getTime() + cells * 86400_000);

  const [accs, items, sch] = await Promise.all([
    accountsSvc.listAccounts(ctx),
    content.contentCalendar(ctx, { from, to, accountId: sp.a || undefined }),
    schedules.listSchedules(ctx),
  ]);

  const byDay = new Map<string, { kind: "content" | "schedule"; at: Date; label: string; tone: string; title: string }[]>();
  const push = (at: Date, e: { kind: "content" | "schedule"; label: string; tone: string; title: string }) => {
    const p = zonedParts(at, TZ);
    const k = key(p.year, p.month, p.day);
    byDay.set(k, [...(byDay.get(k) ?? []), { ...e, at }]);
  };
  const scheduled = items.filter((i) => i.scheduledAt);
  const drafts = items.filter((i) => !i.scheduledAt);
  for (const i of scheduled)
    push(i.scheduledAt!, {
      kind: "content",
      label: `${fmtTime(i.scheduledAt!)} ${contentTypeLabel[i.type] ?? i.type}`,
      tone: statusTone[i.status] ?? "",
      title: `${statusLabel[i.status]} · @${i.account.username} · ${i.caption.slice(0, 80)}`,
    });
  for (const s of sch.filter((x) => x.enabled && (!sp.a || !x.accountId || x.accountId === sp.a))) {
    // O'tmishdagi (jadval yaratilishidan oldingi) paytlar ko'rsatilmaydi
    let at = new Date(Math.max(from.getTime(), s.createdAt.getTime()) - 1);
    for (let n = 0; n < 62; n++) {
      at = nextOccurrence(s.weekdays, s.timeOfDay, s.timezone, at);
      if (at >= to) break;
      push(at, { kind: "schedule", label: `↻ ${s.timeOfDay} ${s.title}`, tone: "", title: `${ROLE_GUIDES[s.role].title}: ${s.title}` });
    }
  }

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const q = (m: string, a = sp.a) => `/calendar?m=${m}${a ? `&a=${a}` : ""}`;
  const todayKey = key(now.year, now.month, now.day);
  const days = Array.from({ length: cells }, (_, i) => {
    const d = new Date(gridStart.getTime() + i * 86400_000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  });

  return (
    <>
      <LiveRefresh types={["content", "task"]} />
      <div className="pagehead">
        <div>
          <h1>Kontent kalendar</h1>
          <p className="sub">Rejalashtirilgan nashrlar va takroriy vazifalar. Vaqtlar Toshkent bo'yicha.</p>
        </div>
      </div>

      <div className="office-bar">
        <Link className="chip" href={q(prev)} aria-label="Oldingi oy">
          ‹
        </Link>
        <b style={{ minWidth: 130, textAlign: "center" }}>
          {MONTHS_UZ[month - 1]} {year}
        </b>
        <Link className="chip" href={q(next)} aria-label="Keyingi oy">
          ›
        </Link>
        <Link className="chip" href={q(`${now.year}-${String(now.month).padStart(2, "0")}`)}>
          Bugun
        </Link>
        <span className="grow" />
        <Link className={`chip ${!sp.a ? "on" : ""}`} href={q(`${year}-${String(month).padStart(2, "0")}`, "")}>
          Hammasi
        </Link>
        {accs.map((a) => (
          <Link key={a.id} className={`chip ${sp.a === a.id ? "on" : ""}`} href={q(`${year}-${String(month).padStart(2, "0")}`, a.id)}>
            @{a.username}
          </Link>
        ))}
      </div>

      <section className="card cal-wrap">
        <div className="cal" role="grid" aria-label={`${MONTHS_UZ[month - 1]} ${year}`}>
          {WEEKDAYS_UZ.map((w) => (
            <div key={w} className="cal-h" role="columnheader">
              {w}
            </div>
          ))}
          {days.map((c) => {
            const k = key(c.y, c.m, c.d);
            const list = (byDay.get(k) ?? []).sort((a, b) => a.at.getTime() - b.at.getTime());
            return (
              <div key={k} role="gridcell" className={`cal-d ${c.m !== month ? "out" : ""} ${k === todayKey ? "today" : ""}`}>
                <span className="cal-n">{c.d}</span>
                {list.slice(0, 4).map((e, i) => (
                  <span key={i} className={`cal-e ${e.kind} ${e.tone}`} title={e.title}>
                    {e.label}
                  </span>
                ))}
                {list.length > 4 && <span className="muted">+{list.length - 4}</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Shu oy nashrlari ({scheduled.length})</h2>
        {scheduled.length === 0 && <div className="empty">Bu oyda rejalashtirilgan nashr yo'q. Claude'ga kontent rejasini tuzishni ayting.</div>}
        {scheduled.map((i) => (
          <div className="row" key={i.id}>
            <span className="grow">
              <b>{fmtDateTime(i.scheduledAt!)}</b> · {contentTypeLabel[i.type]} · @{i.account.username}
              <div className="muted">{i.caption.slice(0, 140) || "(matn yo'q)"}</div>
            </span>
            <span className={`badge ${statusTone[i.status]}`}>{statusLabel[i.status]}</span>
            {i.status === "published" && i.permalink ? (
              <a className="muted" href={i.permalink} target="_blank" rel="noreferrer noopener">
                Ochish ↗
              </a>
            ) : (
              <RescheduleForm contentId={i.id} value={toLocalInput(i.scheduledAt!, TZ)} />
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Vaqti belgilanmagan qoralamalar ({drafts.length})</h2>
        {drafts.length === 0 && <div className="empty">Qoralama yo'q.</div>}
        {drafts.map((i) => (
          <div className="row" key={i.id}>
            <span className="grow">
              {contentTypeLabel[i.type]} · @{i.account.username}
              <div className="muted">{i.caption.slice(0, 140) || "(matn yo'q)"}</div>
            </span>
            <span className={`badge ${statusTone[i.status]}`}>{statusLabel[i.status]}</span>
            <RescheduleForm contentId={i.id} value="" />
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Takroriy vazifalar</h2>
        {sch.length === 0 && <div className="empty">Hali jadval yo'q. Pastdan qo'shing yoki Claude'ga ayting: "har dushanba 9:00 da haftalik hisobot tayyorla".</div>}
        {sch.map((s) => (
          <div className="row" key={s.id}>
            <span className="grow">
              <b>{s.title}</b>
              <div className="muted">
                {ROLE_GUIDES[s.role].title} · {t.kind[s.kind]} · {schedules.describeCadence(s)}
                {s.account ? ` · @${s.account.username}` : ""}
                {s.enabled && s.nextRunAt ? ` · keyingisi ${fmtDateTime(s.nextRunAt)}` : ""}
                {s.lastRunAt ? ` · oxirgisi ${fmtDateTime(s.lastRunAt)}` : ""}
              </div>
            </span>
            <span className={`badge ${s.enabled ? "ok" : ""}`}>{s.enabled ? "Yoqilgan" : "O'chirilgan"}</span>
            <form action={toggleScheduleAction}>
              <input type="hidden" name="scheduleId" value={s.id} />
              <input type="hidden" name="enabled" value={String(!s.enabled)} />
              <button className="btn ghost sm">{s.enabled ? "O'chirish" : "Yoqish"}</button>
            </form>
            <form action={deleteScheduleAction}>
              <input type="hidden" name="scheduleId" value={s.id} />
              <button className="btn danger sm" aria-label={`${s.title} jadvalini o'chirib tashlash`}>
                ✕
              </button>
            </form>
          </div>
        ))}
        <div style={{ marginTop: 14 }}>
          <ScheduleForm accounts={accs.map((a) => ({ id: a.id, username: a.username }))} />
        </div>
      </section>
    </>
  );
}
