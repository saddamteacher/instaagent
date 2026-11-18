"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OfficeEvent } from "@jarvisgram/shared";
import type { OfficeState } from "@jarvisgram/db";
import { buildLayout } from "@/office/graph";
import { Canvas2DRenderer } from "@/office/render2d";
import type { OfficeRenderer } from "@/office/renderer";
import { JARVIS_ID, OfficeSim } from "@/office/sim";
import { switchAccountAction, toggleAgentPauseAction } from "@/lib/actions";
import { actorLabel, fmtTime, t } from "@/lib/i18n";

const SPEEDS = [1, 2, 4] as const;

interface AgentDetail {
  agent: { id: string; name: string; role: string; state: string; deskNo: number; paused: boolean };
  tasks: { id: string; title: string; status: keyof typeof t.status; progress: number }[];
  logs: { id: string; message: string; at: string }[];
}

declare global {
  interface Window {
    __office?: { sim: OfficeSim; state: () => OfficeState };
  }
}

export function OfficeView({ initial }: { initial: OfficeState }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<OfficeSim | null>(null);
  const rendererRef = useRef<OfficeRenderer | null>(null);
  const [state, setState] = useState(initial);
  const stateRef = useRef(initial);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const speedRef = useRef(speed);
  const [labels, setLabels] = useState(true);
  const optsRef = useRef({ labels: true, selectedId: null as string | null });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [live, setLive] = useState(false);

  speedRef.current = speed;
  optsRef.current = { labels, selectedId: selected };

  const apply = useCallback((s: OfficeState) => {
    stateRef.current = s;
    setState(s);
    simRef.current?.reconcile({ agents: s.agents, meeting: s.meeting, activeAccount: s.activeAccount });
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/office-state", { cache: "no-store" });
    if (r.ok) apply((await r.json()) as OfficeState);
  }, [apply]);

  // Simulyatsiya + render sikli
  useEffect(() => {
    const layout = buildLayout();
    const sim = new OfficeSim(layout);
    const renderer: OfficeRenderer = new Canvas2DRenderer(layout, "/office.jpg");
    simRef.current = sim;
    rendererRef.current = renderer;
    sim.reconcile({ agents: stateRef.current.agents, meeting: stateRef.current.meeting, activeAccount: stateRef.current.activeAccount });
    renderer.mount(stageRef.current!);
    window.__office = { sim, state: () => stateRef.current };

    let raf = 0;
    let last = performance.now();
    let clock = "";
    let clockAt = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (let i = 0; i < speedRef.current; i++) sim.step(dt);
      if (now - clockAt > 1000) {
        clock = fmtTime(new Date());
        clockAt = now;
      }
      renderer.draw(sim.frame(), { ...optsRef.current, clock });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      renderer.destroy();
      delete window.__office;
    };
  }, []);

  // Jonli hodisalar (SSE): bulutchalar darhol, holat — qayta so'rov bilan
  useEffect(() => {
    const es = new EventSource("/api/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as OfficeEvent;
      if (ev.type === "log" && ev.bubble) simRef.current?.say(ev.agentId ?? (ev.actor === "jarvis" ? JARVIS_ID : undefined), ev.bubble);
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [refresh]);

  // Agent paneli
  useEffect(() => {
    if (!selected || selected === JARVIS_ID) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/agents/${selected}`, { cache: "no-store" }).then(async (r) => {
      if (r.ok && !cancelled) setDetail((await r.json()) as AgentDetail);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, state]);

  const onClick = (e: React.MouseEvent) => {
    const p = rendererRef.current?.toWorld(e.clientX, e.clientY);
    if (!p) return;
    setSelected(simRef.current?.hitTest(p) ?? null);
  };

  const sel = state.agents.find((a) => a.id === selected);
  const working = state.agents.filter((a) => a.state === "working").length;
  const chill = state.agents.filter((a) => a.state === "chill").length;

  return (
    <>
      <div className="office-bar">
        <span className="sub">
          kompyuterda {working}/{state.desks} · dam olishda {chill}
          {state.meeting ? " · majlis ketmoqda" : ""}
        </span>
        <span className={`badge ${live ? "ok" : "warn"}`} title="Jonli ulanish">
          {live ? "● jonli" : "○ ulanmoqda"}
        </span>
        <span className="grow" />
        {state.accounts.map((a) => (
          <form key={a.id} action={async (f) => (await switchAccountAction(f), refresh())}>
            <input type="hidden" name="accountId" value={a.id} />
            <button className={`chip ${a.id === state.activeAccount?.id ? "on" : ""}`} aria-pressed={a.id === state.activeAccount?.id}>
              @{a.username}
            </button>
          </form>
        ))}
        <button className="chip" type="button" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}>
          Tezlik: {speed}x
        </button>
        <button className={`chip ${labels ? "on" : ""}`} type="button" aria-pressed={labels} onClick={() => setLabels(!labels)}>
          Ismlar
        </button>
      </div>

      <div className="office-wrap">
        <div className="stage-scroll">
          <div className="stage" ref={stageRef} onClick={onClick} />
        </div>
        <p className="muted stage-hint">← Ofisni yon tomonga surib ko'ring →</p>
        {sel && (
          <aside className="card agent-panel" aria-label={`${sel.name} paneli`}>
            <div className="row" style={{ paddingTop: 0 }}>
              <span className="grow">
                <b>{sel.name}</b> <span className="muted">· {sel.roleTitle} · stol {sel.deskNo}</span>
              </span>
              <button className="btn ghost sm" type="button" onClick={() => setSelected(null)} aria-label="Yopish">
                ✕
              </button>
            </div>
            <p style={{ marginTop: 8 }}>
              <span className="badge">{sel.paused ? "To'xtatilgan" : t.agentState[sel.state]}</span>
            </p>
            <h2>Vazifalar</h2>
            {!detail?.tasks.length ? (
              <div className="empty">Vazifa yo'q</div>
            ) : (
              detail.tasks.map((x) => (
                <div className="row" key={x.id}>
                  <span className="grow">{x.title}</span>
                  {x.status === "in_progress" && (
                    <span className="bar">
                      <i style={{ width: `${x.progress}%` }} />
                    </span>
                  )}
                  <span className="badge">{t.status[x.status]}</span>
                </div>
              ))
            )}
            <form action={async (f) => (await toggleAgentPauseAction(f), refresh())} style={{ margin: "12px 0" }}>
              <input type="hidden" name="agentId" value={sel.id} />
              <input type="hidden" name="paused" value={String(!sel.paused)} />
              <button className={sel.paused ? "btn sm" : "btn danger sm"}>
                {sel.paused ? "Davom ettirish" : "To'xtatish (yangi vazifa bermaslik)"}
              </button>
            </form>
            <h2>Log</h2>
            <div className="log" style={{ maxHeight: 220 }}>
              {!detail?.logs.length && <div className="empty">Hali yozuv yo'q</div>}
              {detail?.logs.map((l) => (
                <div key={l.id}>
                  <span className="muted">{fmtTime(l.at)}</span> {l.message}
                </div>
              ))}
            </div>
          </aside>
        )}
        {selected === JARVIS_ID && (
          <aside className="card agent-panel" aria-label="Jarvis paneli">
            <div className="row" style={{ paddingTop: 0 }}>
              <span className="grow">
                <b>Jarvis</b> <span className="muted">· bosh direktor (sizning Claude ilovangiz)</span>
              </span>
              <button className="btn ghost sm" type="button" onClick={() => setSelected(null)} aria-label="Yopish">
                ✕
              </button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Jarvisga buyruqni Claude ilovasida bering. U majlis chaqiradi, vazifalarni taqsimlaydi va natijani shu yerga yozadi.
            </p>
            {state.meeting && (
              <p>
                <b>Majlis:</b> {state.meeting.command}
              </p>
            )}
          </aside>
        )}
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Ishda</h2>
          {state.agents.filter((a) => a.task).length === 0 && <div className="empty">Hozircha vazifa yo'q. Claude'da Jarvisga buyruq bering.</div>}
          {state.agents
            .filter((a) => a.task)
            .map((a) => (
              <div className="row nowrap" key={a.id} onClick={() => setSelected(a.id)} style={{ cursor: "pointer" }}>
                <span className="grow">
                  <b>{a.name}</b> <span className="muted">· {a.roleTitle}</span>
                  <div className="muted">{a.task!.title}</div>
                </span>
                <span className="bar">
                  <i style={{ width: `${a.task!.progress}%` }} />
                </span>
              </div>
            ))}
        </section>
        <section className="card">
          <h2>{t.status.awaiting_approval}</h2>
          <div className="stat" style={{ color: state.pendingApprovals ? "var(--accent)" : undefined }}>{state.pendingApprovals}</div>
          <a href="/tasks">Ko'rib chiqish →</a>
        </section>
        <section className="card">
          <h2>Jonli log</h2>
          <div className="log">
            {state.recentLogs.length === 0 && <div className="empty">Hali harakat yo'q.</div>}
            {state.recentLogs.map((l) => (
              <div key={l.id}>
                <span className="muted">{fmtTime(l.at)}</span> <b>{actorLabel(l.actor)}</b> {l.message}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
