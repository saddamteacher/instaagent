import type { AgentRole, AgentState } from "@jarvisgram/shared";
import type { OfficeLayout, Pt } from "./graph";
import { HAIRS, SHIRTS, TALK } from "./talk";

/**
 * Ofis simulyatsiyasi (DOM'siz, render qatlamidan mustaqil).
 *
 * Kim qayerda bo'lishi HAQIQIY office_state'dan olinadi (reconcile), simulyatsiya faqat
 * u yerga graf bo'ylab qanday yurib borishni va gap bulutchalarini boshqaradi.
 * Natija — SimFrame: 2D canvas ham, keyinchalik three.js ham shuni chizadi.
 */

export interface SimAgentInput {
  id: string;
  name: string;
  role: AgentRole;
  roleTitle: string;
  state: AgentState;
  deskNo: number;
  paused: boolean;
  task: { id: string; title: string; status: string; progress: number } | null;
}

export interface SimInput {
  agents: SimAgentInput[];
  meeting: { id: string; command: string } | null;
  activeAccount: { username: string } | null;
}

export const JARVIS_ID = "jarvis";
const WALK_SPEED = 38; // dunyo birligi / soniya
const BUBBLE_SEC = 3.2;
/** Bir vaqtda ko'pi bilan shuncha bezak (ambient) bulutcha — haqiqiy hodisalar cheklanmaydi. */
const MAX_AMBIENT = 2;

interface Say {
  text: string;
  wait: number;
  dur: number;
}

interface Actor {
  id: string;
  name: string;
  roleTitle: string;
  role: AgentRole | "jarvis";
  isJarvis: boolean;
  x: number;
  y: number;
  at: string;
  path: string[];
  target: string;
  delay: number;
  dir: 1 | -1;
  moving: boolean;
  phase: number;
  state: AgentState | "cabinet";
  paused: boolean;
  task: SimAgentInput["task"];
  index: number;
  say: string;
  sayT: number;
  /** Joriy bulutcha bezak suhbatimi */
  ambient: boolean;
  queue: Say[];
  talk: number;
  shirt: string;
  hair: string;
}

export interface FrameActor {
  id: string;
  name: string;
  roleTitle: string;
  isJarvis: boolean;
  x: number;
  y: number;
  dir: 1 | -1;
  moving: boolean;
  bob: number;
  state: AgentState | "cabinet";
  /** Stolda o'tirib ishlayaptimi (progress chizig'i va yongan monitor). */
  atDesk: boolean;
  progress: number | null;
  paused: boolean;
  say: string;
  shirt: string;
  hair: string;
}

export interface SimFrame {
  t: number;
  actors: FrameActor[];
  monitors: { x: number; y: number; on: boolean }[];
  screen: { on: boolean; text: string };
}

const pick = (list: string[], rnd: () => number) => list[Math.floor(rnd() * list.length)]!;
const short = (s: string, n = 44) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export class OfficeSim {
  private actors = new Map<string, Actor>();
  private meeting: SimInput["meeting"] = null;
  private account = "";
  private briefed: string | null = null;
  private initialized = false;
  private t = 0;

  constructor(
    readonly layout: OfficeLayout,
    private rnd: () => number = Math.random,
  ) {
    const home = layout.graph.nodes.get(layout.jarvisHome)!;
    this.actors.set(JARVIS_ID, {
      id: JARVIS_ID,
      name: "Jarvis",
      roleTitle: "Bosh direktor",
      role: "jarvis",
      isJarvis: true,
      x: home.x,
      y: home.y,
      at: layout.jarvisHome,
      path: [],
      target: layout.jarvisHome,
      delay: 0,
      dir: 1,
      moving: false,
      phase: 0,
      state: "cabinet",
      paused: false,
      task: null,
      index: -1,
      say: "",
      sayT: 0,
      ambient: false,
      queue: [],
      talk: 6,
      shirt: "#1a2030",
      hair: "#1b1b1d",
    });
  }

  /** Agentning maqsad tuguni haqiqiy holatdan kelib chiqadi. */
  private targetFor(a: { state: AgentState; deskNo: number; index: number }) {
    const L = this.layout;
    const i = a.index % L.lounge.length;
    if (a.state === "meeting") return L.conf[i % L.conf.length]!;
    if (a.state === "working" || a.state === "toDesk") return L.seats[(a.deskNo - 1) % L.seats.length]!.node;
    return L.lounge[i]!;
  }

  private goTo(a: Actor, target: string, delay = 0, snap = false) {
    if (a.target === target && (a.path.length || a.at === target)) return;
    a.target = target;
    const g = this.layout.graph;
    if (snap) {
      const p = g.nodes.get(target)!;
      a.x = p.x;
      a.y = p.y;
      a.at = target;
      a.path = [];
      return;
    }
    // Yo'lda bo'lsa — joriy oraliq tugundan davom etadi (orqaga sakramaydi)
    const from = a.path[0] ?? a.at;
    const head = a.path.length ? [a.path[0]!] : [];
    a.path = [...head, ...g.route(from, target)];
    a.delay = delay;
  }

  private enqueue(a: Actor, text: string, wait = 0, dur = BUBBLE_SEC) {
    a.queue.push({ text: short(text), wait, dur });
  }

  /** Server holatini qo'llash (birinchi marta — joyiga darhol qo'yiladi). */
  reconcile(input: SimInput) {
    const snap = !this.initialized;
    this.initialized = true;
    const sorted = [...input.agents].sort((a, b) => a.deskNo - b.deskNo);
    const seen = new Set<string>();
    const meetingStarted = !!input.meeting && input.meeting.id !== this.meeting?.id;
    const meetingEnded = !input.meeting && !!this.meeting;
    this.account = input.activeAccount ? `@${input.activeAccount.username}` : "";

    sorted.forEach((inp, index) => {
      seen.add(inp.id);
      let a = this.actors.get(inp.id);
      if (!a) {
        const start = this.layout.lounge[index % this.layout.lounge.length]!;
        const p = this.layout.graph.nodes.get(start)!;
        a = {
          id: inp.id,
          name: inp.name,
          roleTitle: inp.roleTitle,
          role: inp.role,
          isJarvis: false,
          x: p.x,
          y: p.y,
          at: start,
          path: [],
          target: start,
          delay: 0,
          dir: 1,
          moving: false,
          phase: index * 1.7,
          state: inp.state,
          paused: inp.paused,
          task: inp.task,
          index,
          say: "",
          sayT: 0,
          ambient: false,
          queue: [],
          talk: 2 + index * 0.9,
          shirt: SHIRTS[(inp.deskNo - 1) % SHIRTS.length]!,
          hair: HAIRS[(inp.deskNo - 1) % HAIRS.length]!,
        };
        this.actors.set(inp.id, a);
      }
      const prev = a.state;
      a.name = inp.name;
      a.roleTitle = inp.roleTitle;
      a.state = inp.state;
      a.paused = inp.paused;
      a.task = inp.task;
      a.index = index;
      this.goTo(a, this.targetFor({ state: inp.state, deskNo: inp.deskNo, index }), snap ? 0 : index * 0.2, snap);
      if (!snap && meetingStarted) this.enqueue(a, pick(TALK.call, this.rnd), 0.3 + this.rnd() * 2.5, 2.4);
      if (!snap && prev === "meeting" && (inp.state === "toDesk" || inp.state === "working"))
        this.enqueue(a, pick(TALK.walk, this.rnd), 0.4 + index * 0.1, 2.4);
    });
    for (const id of [...this.actors.keys()]) if (id !== JARVIS_ID && !seen.has(id)) this.actors.delete(id);

    const j = this.actors.get(JARVIS_ID)!;
    j.state = input.meeting ? "meeting" : "cabinet";
    this.goTo(j, input.meeting ? this.layout.jarvisConf : this.layout.jarvisHome, snap ? 0 : 0.6, snap);
    if (meetingStarted) this.briefed = null;
    if (meetingEnded && !snap) this.enqueue(j, "Ishga!", 0.5, 2.6);
    this.meeting = input.meeting;
  }

  /** Haqiqiy hodisadan gap bulutchasi (MCP: Tayyor!, Men olaman!, log_add ...). */
  say(actorId: string | undefined, text: string) {
    const a = actorId ? this.actors.get(actorId) : undefined;
    if (!a || !text.trim()) return;
    a.queue = [];
    a.say = short(text);
    a.ambient = false;
    a.sayT = BUBBLE_SEC + Math.min(3, text.length / 20);
    a.talk = 6 + this.rnd() * 8;
  }

  private ambient(a: Actor): string | null {
    if (a.isJarvis) return a.state === "cabinet" && !a.moving ? pick(TALK.jarvis, this.rnd) : null;
    if (a.moving) return a.state === "toDesk" || a.state === "working" ? pick(TALK.walk, this.rnd) : null;
    if (a.state === "working") return pick(TALK[a.role as AgentRole], this.rnd);
    if (a.state === "toDesk") return pick(TALK.queued, this.rnd);
    if (a.state === "chill") return pick(TALK.chill, this.rnd);
    return null;
  }

  /** Vaqt bo'yicha yangilash (dt — soniya, speed — tezlik koeffitsienti). */
  step(dt: number) {
    this.t += dt;
    const g = this.layout.graph;
    let ambientNow = [...this.actors.values()].filter((x) => x.say && x.ambient).length;
    for (const a of this.actors.values()) {
      if (a.delay > 0) {
        a.delay -= dt;
      } else {
        let left = WALK_SPEED * dt;
        a.moving = a.path.length > 0;
        while (a.path.length && left > 0) {
          const n = g.nodes.get(a.path[0]!)!;
          const dx = n.x - a.x;
          const dy = n.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d <= left) {
            a.x = n.x;
            a.y = n.y;
            a.at = a.path.shift()!;
            left -= d;
          } else {
            a.x += (dx / d) * left;
            a.y += (dy / d) * left;
            if (Math.abs(dy) > Math.abs(dx)) a.dir = dy > 0 ? 1 : -1;
            left = 0;
          }
        }
        if (!a.path.length) {
          a.moving = false;
          const seat = this.seatOf(a);
          if (seat && a.at === seat.node) a.dir = seat.dir;
        }
      }

      if (a.sayT > 0 && (a.sayT -= dt) <= 0) a.say = "";
      const q = a.queue[0];
      if (q && !a.say && (q.wait -= dt) <= 0) {
        a.queue.shift();
        a.ambient = false;
        a.say = q.text;
        a.sayT = q.dur;
        a.talk = 5 + this.rnd() * 8;
      }
      if ((a.talk -= dt) <= 0) {
        a.talk = 6 + this.rnd() * 11;
        if (!a.say && !a.queue.length && ambientNow < MAX_AMBIENT) {
          const s = this.ambient(a);
          if (s) {
            a.say = s;
            a.sayT = 2.6;
            a.ambient = true;
            ambientNow++;
          }
        }
      }
    }

    // Majlis: hamma yig'ilgach Jarvis vazifani tushuntiradi
    if (this.meeting && this.briefed !== this.meeting.id) {
      const all = [...this.actors.values()].every((a) => !a.path.length && a.delay <= 0);
      if (all) {
        this.briefed = this.meeting.id;
        const j = this.actors.get(JARVIS_ID)!;
        j.queue = [];
        j.ambient = false;
        j.say = short(this.meeting.command, 60);
        j.sayT = 6;
        for (const a of this.actors.values())
          if (!a.isJarvis && this.rnd() < 0.6) this.enqueue(a, pick(TALK.brief, this.rnd), 1.5 + this.rnd() * 3.5, 2.4);
      }
    }
  }

  private seatOf(a: Actor) {
    if (a.isJarvis || (a.state !== "working" && a.state !== "toDesk")) return null;
    return this.layout.seats.find((s) => s.node === a.target) ?? null;
  }

  frame(): SimFrame {
    const actors: FrameActor[] = [];
    const busySeats = new Map<string, boolean>();
    for (const a of this.actors.values()) {
      const seat = this.seatOf(a);
      const atDesk = !!seat && !a.path.length && a.at === seat.node;
      if (seat && atDesk) busySeats.set(seat.node, a.state === "working");
      actors.push({
        id: a.id,
        name: a.name,
        roleTitle: a.roleTitle,
        isJarvis: a.isJarvis,
        x: a.x,
        y: a.y,
        dir: a.dir,
        moving: a.moving,
        bob: a.moving ? Math.sin(this.t * 11 + a.phase) * 0.12 : 0,
        state: a.state,
        atDesk,
        progress: atDesk && a.state === "working" && a.task ? Math.min(100, a.task.progress) / 100 : null,
        paused: a.paused,
        say: a.say,
        shirt: a.shirt,
        hair: a.hair,
      });
    }
    actors.sort((p, q) => p.y - q.y);

    const g = this.layout.graph;
    const monitors = this.layout.seats.map((s) => {
      const p = g.nodes.get(s.node)!;
      return { x: p.x, y: p.y + s.mon, on: busySeats.get(s.node) === true };
    });

    const briefing = !!this.meeting && this.briefed === this.meeting.id;
    return {
      t: this.t,
      actors,
      monitors,
      screen: {
        on: !!this.meeting,
        text: briefing ? `VAZIFA${this.account ? " · " + this.account : ""}` : "MAJLIS",
      },
    };
  }

  /** Bosilgan nuqtadagi agent (dunyo birliklarida). */
  hitTest(p: Pt, radius = 10): string | null {
    let best: string | null = null;
    let bd = radius;
    for (const a of this.actors.values()) {
      const d = Math.hypot(a.x - p.x, a.y - 2 - p.y);
      if (d < bd) {
        bd = d;
        best = a.id;
      }
    }
    return best;
  }

  /** Testlar va disk raskadrovka uchun. */
  debug() {
    return [...this.actors.values()].map((a) => ({
      id: a.id,
      name: a.name,
      state: a.state,
      at: a.at,
      target: a.target,
      moving: a.moving || a.path.length > 0,
      say: a.say,
    }));
  }
}
