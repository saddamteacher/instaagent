import { billing } from "@jarvisgram/db";
const { PLAN_RANK } = billing;
import { PLANS, PLAN_IDS } from "@jarvisgram/shared";
import { checkoutAction } from "@/lib/actions";
import { fmtDateTime, fmtNum } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const payStatus = { created: "Yaratildi", pending: "To'lov kutilmoqda", paid: "To'langan", cancelled: "Bekor qilingan", failed: "Xato" } as const;
const payTone = { created: "", pending: "warn", paid: "ok", cancelled: "danger", failed: "danger" } as const;

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ order?: string; err?: string }> }) {
  const { ctx } = await requireSession();
  const sp = await searchParams;
  const [plan, payments] = await Promise.all([billing.currentPlan(ctx.db, ctx.workspaceId), billing.listPayments(ctx)]);
  const order = sp.order ? payments.find((p) => p.id === sp.order) : undefined;
  const payme = !!billing.paymeConfigFromEnv();
  const click = !!billing.clickConfigFromEnv();
  const [accounts, schedulesCount] = await Promise.all([
    ctx.db.instagramAccount.count({ where: { workspaceId: ctx.workspaceId } }),
    ctx.db.schedule.count({ where: { workspaceId: ctx.workspaceId } }),
  ]);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Tariflar</h1>
          <p className="sub">
            Joriy tarif: <b>{plan.title}</b>
            {plan.periodEnd ? ` · ${fmtDateTime(plan.periodEnd)} gacha` : ""} · akkauntlar {accounts}/{plan.limits.accounts} · takroriy vazifalar{" "}
            {schedulesCount}/{plan.limits.schedules}
          </p>
        </div>
      </div>

      {order && (
        <div className={`alert ${order.status === "paid" ? "ok" : "warn"}`} role="status">
          {order.status === "paid"
            ? `To'lov qabul qilindi: ${PLANS[order.plan].title}. Rahmat!`
            : `To'lov holati: ${payStatus[order.status]}. Tasdiq to'lov tizimidan kelishi bilan tarif yoqiladi — sahifani biroz keyin yangilang.`}
        </div>
      )}
      {sp.err && <div className="alert error">{sp.err === "click" ? "Click" : "Payme"} hali sozlanmagan.</div>}

      <div className="grid plans">
        {PLAN_IDS.map((id) => {
          const p = PLANS[id];
          const current = plan.id === id;
          const lower = PLAN_RANK[id] < PLAN_RANK[plan.id];
          return (
            <section key={id} className={`card plan ${id === "pro" ? "featured" : ""}`}>
              <h2>{p.title}</h2>
              <div className="stat">{p.priceUzs ? `${fmtNum(p.priceUzs)} so'm` : "Bepul"}</div>
              <div className="muted">{p.priceUzs ? "oyiga" : "doimiy"}</div>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {current && <span className="badge ok">Joriy tarif</span>}
              {p.priceUzs > 0 && lower && <span className="muted">Joriy tarif tugagach sotib olish mumkin</span>}
              {p.priceUzs > 0 && !lower && (
                <form action={checkoutAction} className="pay">
                  <input type="hidden" name="plan" value={id} />
                  <label className="sr-only" htmlFor={`m-${id}`}>
                    Muddat
                  </label>
                  <select id={`m-${id}`} name="months" defaultValue="1">
                    <option value="1">1 oy</option>
                    <option value="3">3 oy</option>
                    <option value="12">12 oy</option>
                  </select>
                  <button className="btn" name="provider" value="payme" disabled={!payme} title={payme ? "" : "Payme sozlanmagan"}>
                    Payme
                  </button>
                  <button className="btn ghost" name="provider" value="click" disabled={!click} title={click ? "" : "Click sozlanmagan"}>
                    Click
                  </button>
                </form>
              )}
            </section>
          );
        })}
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <h2>To'lovlar tarixi</h2>
        {payments.length === 0 && <div className="empty">Hali to'lov yo'q.</div>}
        {payments.map((p) => (
          <div className="row" key={p.id}>
            <span className="grow">
              <b>{PLANS[p.plan].title}</b> · {p.months} oy · {fmtNum(p.amount / 100)} so'm · {p.provider === "payme" ? "Payme" : "Click"}
              <div className="muted">
                {fmtDateTime(p.createdAt)} · buyurtma {p.id}
              </div>
            </span>
            <span className={`badge ${payTone[p.status]}`}>{payStatus[p.status]}</span>
          </div>
        ))}
      </section>
    </>
  );
}
