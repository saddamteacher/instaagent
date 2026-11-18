import { billing, commands, office } from "@jarvisgram/db";
import { CommandBar } from "@/components/CommandBar";
import { LiveRefresh } from "@/components/LiveRefresh";
import { OfficeView } from "@/components/OfficeView";
import { dismissCommandAction } from "@/lib/actions";
import { fmtTime } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const cmdStatus = { new: "Qutida", taken: "Majlisda", done: "Bajarildi", dismissed: "Bekor" } as const;

/** Asosiy ekran: virtual ofis. Holat office_state'dan, jonli yangilanish SSE orqali. */
export default async function OfficePage() {
  const { ctx } = await requireSession();
  const [initial, plan, recent] = await Promise.all([
    office.officeState(ctx, { logLimit: 15 }),
    billing.currentPlan(ctx.db, ctx.workspaceId),
    commands.recentCommands(ctx, 6),
  ]);
  const agentConfigured = !!process.env.ELEVENLABS_AGENT_ID;
  const voice = !agentConfigured
    ? { enabled: false, reason: "Ovozli agent sozlanmagan (ELEVENLABS_AGENT_ID) — matn bilan yozing." }
    : !plan.limits.voiceAgent
      ? { enabled: false, reason: "Ovozli buyruq Pro tarifidan boshlab (Tariflar)." }
      : { enabled: true };
  return (
    <>
      <LiveRefresh types={["log"]} />
      <div className="pagehead">
        <div>
          <h1>Ofis</h1>
          <p className="sub">Claude'dagi har bir harakat shu yerda jonli ko'rinadi. Agent ustiga bosing.</p>
        </div>
      </div>
      <CommandBar voice={voice} />
      {recent.length > 0 && (
        <section className="card" style={{ marginBottom: 14 }}>
          <h2>Buyruqlar qutisi</h2>
          {recent.map((c) => (
            <div className="row" key={c.id}>
              <span className="grow">
                {c.source === "voice" ? "🎙 " : ""}
                {c.text}
                <div className="muted">{fmtTime(c.createdAt)}</div>
              </span>
              <span className={`badge ${c.status === "new" ? "accent" : c.status === "done" ? "ok" : ""}`}>{cmdStatus[c.status]}</span>
              {c.status === "new" && (
                <form action={dismissCommandAction}>
                  <input type="hidden" name="commandId" value={c.id} />
                  <button className="btn ghost sm">Bekor qilish</button>
                </form>
              )}
            </div>
          ))}
          <p className="muted" style={{ margin: "8px 0 0" }}>Jarvis buyruqlarni Claude ilovasida oladi (due_list). Claude'ga: «Jarvis, qutidagi buyruqlarni bajar».</p>
        </section>
      )}
      <OfficeView initial={JSON.parse(JSON.stringify(initial))} />
    </>
  );
}
