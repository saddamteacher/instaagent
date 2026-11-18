import Link from "next/link";
import { accounts as accountsSvc, analytics, graph } from "@jarvisgram/db";
import { ROLE_GUIDES } from "@jarvisgram/shared";
import { LineChart, type Point } from "@/components/LineChart";
import { LiveRefresh } from "@/components/LiveRefresh";
import { graphSyncAction } from "@/lib/actions";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

function Delta({ v, unit = "" }: { v: number | undefined; unit?: string }) {
  if (v === undefined || v === 0) return <span className="muted">o'zgarishsiz</span>;
  return (
    <span className={v > 0 ? "delta up" : "delta down"}>
      {v > 0 ? "▲" : "▼"} {fmtNum(Math.abs(v), 2)}
      {unit}
    </span>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ a?: string; d?: string }> }) {
  const { ctx, workspace } = await requireSession();
  const sp = await searchParams;
  const accs = await accountsSvc.listAccounts(ctx);
  const days = RANGES.includes(Number(sp.d) as never) ? Number(sp.d) : 30;
  const acc = accs.find((a) => a.id === sp.a) ?? accs.find((a) => a.id === workspace.activeAccountId) ?? accs[0];
  const q = (a: string | undefined, d: number) => `/analytics?${a ? `a=${a}&` : ""}d=${d}`;

  if (!acc)
    return (
      <>
        <div className="pagehead">
          <h1>Analitika</h1>
        </div>
        <section className="card">
          <div className="empty">Avval Instagram akkaunt qo'shing.</div>
        </section>
      </>
    );

  const o = await analytics.analyticsOverview(ctx, { accountId: acc.id, days });
  const series = (k: "followers" | "reach" | "engagementRate" | "impressions"): Point[] =>
    o.snapshots
      .filter((s) => typeof s[k] === "number")
      .map((s) => ({ t: s.capturedAt.toISOString(), v: s[k] as number, label: fmtDate(s.capturedAt) }));
  const followers = series("followers");
  const reach = series("reach");
  const er = series("engagementRate");
  const graphReady = !!acc.graphTokenEnc && !!graph.graphConfigFromEnv();

  return (
    <>
      <LiveRefresh types={["analytics"]} />
      <div className="pagehead">
        <div>
          <h1>Analitika</h1>
          <p className="sub">Faqat haqiqatan o'qilgan raqamlar: Chrome'da Analitik o'qigan yoki rasmiy Graph API'dan olingan.</p>
        </div>
        {graphReady && (
          <form action={graphSyncAction}>
            <input type="hidden" name="accountId" value={acc.id} />
            <button className="btn ghost">Graph API'dan yangilash</button>
          </form>
        )}
      </div>

      <div className="office-bar" role="group" aria-label="Filtrlar">
        {RANGES.map((d) => (
          <Link key={d} className={`chip ${d === days ? "on" : ""}`} href={q(acc.id, d)} aria-pressed={d === days}>
            {d} kun
          </Link>
        ))}
        <span className="grow" />
        {accs.map((a) => (
          <Link key={a.id} className={`chip ${a.id === acc.id ? "on" : ""}`} href={q(a.id, days)} aria-pressed={a.id === acc.id}>
            @{a.username}
          </Link>
        ))}
      </div>

      <div className="grid kpis">
        <section className="card">
          <div className="muted">Obunachilar</div>
          <div className="stat">{o.latest?.followers != null ? fmtNum(o.latest.followers) : "—"}</div>
          <Delta v={o.delta.followers} />
        </section>
        <section className="card">
          <div className="muted">Qamrov (reach)</div>
          <div className="stat">{o.latest?.reach != null ? fmtNum(o.latest.reach) : "—"}</div>
          <Delta v={o.delta.reach} />
        </section>
        <section className="card">
          <div className="muted">Jalb qilish (ER)</div>
          <div className="stat">{o.latest?.engagementRate != null ? `${fmtNum(o.latest.engagementRate, 2)}%` : "—"}</div>
          <Delta v={o.delta.engagementRate} unit=" p.p." />
        </section>
        <section className="card">
          <div className="muted">Nashrlar / javoblar ({days} kun)</div>
          <div className="stat">
            {o.published} / {o.replies}
          </div>
          <span className="muted">Jarvisgram orqali bajarilgan</span>
        </section>
      </div>

      {o.snapshots.length < 2 ? (
        <section className="card" style={{ marginTop: 14 }}>
          <h2>Statistika yetarli emas</h2>
          <p className="sub">
            Grafik uchun kamida 2 ta o'lchov kerak. Claude'ga ayting: <i>"@{acc.username} statistikasini o'qi"</i> — Analitik Chrome'da profilni
            o'qib saqlaydi. Yoki takroriy vazifa qo'shing (Kalendar → "har kuni 21:00 statistika").
          </p>
          {o.latest && <p className="muted">Oxirgi o'lchov: {fmtDateTime(o.latest.capturedAt)}</p>}
        </section>
      ) : (
        <div className="grid charts" style={{ marginTop: 14 }}>
          <section className="card">
            <LineChart title="Obunachilar" points={followers} />
          </section>
          <section className="card">
            <LineChart title="Qamrov" points={reach} />
          </section>
          <section className="card">
            <LineChart title="Jalb qilish darajasi" points={er} unit="%" />
          </section>
        </div>
      )}

      <section className="card" style={{ marginTop: 14 }}>
        <h2>Bajarilgan ishlar ({days} kun)</h2>
        {o.doneByRole.length === 0 && <div className="empty">Bu davrda bajarilgan vazifa yo'q.</div>}
        <table className="simple">
          <tbody>
            {o.doneByRole
              .sort((a, b) => b.count - a.count)
              .map((r) => (
                <tr key={r.role}>
                  <td>{ROLE_GUIDES[r.role].title}</td>
                  <td className="num">{r.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
