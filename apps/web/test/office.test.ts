import { describe, expect, it } from "vitest";
import { AGENT_ROSTER, ROLE_GUIDES, TOTAL_DESKS, type AgentState } from "@jarvisgram/shared";
import { buildLayout, type Graph } from "../src/office/graph";
import { JARVIS_ID, OfficeSim, type SimAgentInput, type SimInput } from "../src/office/sim";

const L = buildLayout();
const g = L.graph;

/** Oddiy (sekin) Dijkstra — taqqoslash uchun. */
function refDist(G: Graph, a: string) {
  const dist = new Map<string, number>([...G.nodes.keys()].map((k) => [k, Infinity]));
  dist.set(a, 0);
  const Q = new Set(G.nodes.keys());
  while (Q.size) {
    let u = "";
    for (const k of Q) if (!u || dist.get(k)! < dist.get(u)!) u = k;
    Q.delete(u);
    for (const v of G.edges.get(u)!) dist.set(v, Math.min(dist.get(v)!, dist.get(u)! + G.dist(u, v)));
  }
  return dist;
}
const pathLen = (from: string, p: string[]) => p.reduce((s, n, i) => s + g.dist(i ? p[i - 1]! : from, n), 0);

describe("ofis xaritasi", () => {
  it("20 kompyuter, majlisda 13 joy, dam olishda 13 joy — hammasi har xil", () => {
    expect(L.seats).toHaveLength(TOTAL_DESKS);
    expect(L.conf).toHaveLength(13);
    expect(L.lounge).toHaveLength(13);
    expect(new Set(L.seats.map((s) => s.node)).size).toBe(20);
    expect(new Set(L.conf).size).toBe(13);
    expect(new Set(L.lounge).size).toBe(13);
  });

  it("graf bog'langan: Jarvis kabinetidan har bir tugunga yo'l bor", () => {
    const d = refDist(g, L.jarvisHome);
    for (const [k, v] of d) expect(v, k).toBeLessThan(Infinity);
  });

  it("Dijkstra eng qisqa yo'lni va faqat mavjud qirralarni qaytaradi", () => {
    const targets = [...L.seats.map((s) => s.node), ...L.conf, ...L.lounge, L.jarvisConf];
    for (const from of [L.jarvisHome, L.lounge[0]!, L.seats[19]!.node]) {
      const ref = refDist(g, from);
      for (const to of targets) {
        if (to === from) continue;
        const p = g.route(from, to);
        expect(p.at(-1)).toBe(to);
        p.forEach((n, i) => expect(g.edges.get(i ? p[i - 1]! : from)!.has(n)).toBe(true));
        expect(pathLen(from, p)).toBeCloseTo(ref.get(to)!, 6);
      }
    }
  });

  it("xonalarga faqat eshikdan kiriladi (devordan o'tmaydi)", () => {
    const via = (from: string, to: string, door: string) => expect(g.route(from, to)).toContain(door);
    const deskMid = L.seats[3]!.node;
    for (const spot of L.lounge) via(spot, deskMid, "229,262"); // oshxona eshigi
    for (const seat of L.conf) via(deskMid, seat, "553,149"); // majlis zali eshigi
    via(deskMid, L.jarvisHome, "223,120"); // Jarvis kabineti eshigi
  });
});

const agents = (state: (i: number) => AgentState = () => "chill"): SimAgentInput[] =>
  AGENT_ROSTER.map((a, i) => ({
    id: `a${i}`,
    name: a.name,
    role: a.role,
    roleTitle: ROLE_GUIDES[a.role].title,
    state: state(i),
    deskNo: a.deskNo,
    paused: false,
    task: state(i) === "working" ? { id: `t${i}`, title: "Ish", status: "in_progress", progress: 40 } : null,
  }));
const input = (over: Partial<SimInput> = {}): SimInput => ({ agents: agents(), meeting: null, activeAccount: { username: "shop" }, ...over });
const run = (sim: OfficeSim, sec: number, check?: () => void) => {
  for (let i = 0; i < sec * 50; i++) {
    sim.step(0.02);
    check?.();
  }
};
/** Nuqta biror qirra kesmasi ustidami */
function onEdge(x: number, y: number) {
  for (const [a, ns] of g.edges) {
    const p = g.nodes.get(a)!;
    for (const b of ns) {
      const q = g.nodes.get(b)!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy)));
      if (Math.hypot(p.x + t * dx - x, p.y + t * dy - y) < 0.01) return true;
    }
  }
  return false;
}

describe("simulyatsiya", () => {
  it("birinchi holat darhol joyida: dam olayotganlar oshxonada, ishlayotgan — o'z stolida", () => {
    const sim = new OfficeSim(L, () => 0.5);
    sim.reconcile(input({ agents: agents((i) => (i === 10 ? "working" : "chill")) }));
    const d = sim.debug();
    const rustam = d.find((a) => a.id === "a10")!;
    expect(rustam.at).toBe(L.seats[10]!.node);
    for (const a of d.filter((x) => x.id !== "a10" && x.id !== JARVIS_ID)) expect(L.lounge).toContain(a.at);
    const f = sim.frame();
    expect(f.monitors.filter((m) => m.on)).toHaveLength(1);
    expect(f.actors.find((a) => a.id === "a10")!.progress).toBeCloseTo(0.4);
  });

  it("majlis: hamma zalga yig'iladi, ekran yonadi, Jarvis vazifani tushuntiradi, keyin tarqaladi", () => {
    const sim = new OfficeSim(L, () => 0.5);
    sim.reconcile(input());
    sim.reconcile(input({ agents: agents(() => "meeting"), meeting: { id: "m1", command: "Ertangi Reels'ni tayyorlang" } }));
    expect(sim.frame().screen).toEqual({ on: true, text: "MAJLIS" });
    run(sim, 40, () => {
      for (const a of sim.frame().actors) expect(onEdge(a.x, a.y), `${a.name} devordan o'tdi (${a.x},${a.y})`).toBe(true);
    });
    const d = sim.debug();
    for (const a of d.filter((x) => x.id !== JARVIS_ID)) expect(L.conf).toContain(a.at);
    expect(d.find((a) => a.id === JARVIS_ID)!.at).toBe(L.jarvisConf);
    expect(sim.frame().screen.text).toBe("VAZIFA · @shop");

    // Majlis tugadi: 2 kishi vazifa oldi
    sim.reconcile(input({ agents: agents((i) => (i === 0 ? "working" : i === 10 ? "toDesk" : "chill")) }));
    expect(sim.frame().screen.on).toBe(false);
    run(sim, 40);
    const after = sim.debug();
    expect(after.find((a) => a.id === "a0")!.at).toBe(L.seats[0]!.node);
    expect(after.find((a) => a.id === "a10")!.at).toBe(L.seats[10]!.node);
    expect(after.find((a) => a.id === JARVIS_ID)!.at).toBe(L.jarvisHome);
    const f = sim.frame();
    // Faqat ishlayotganning monitori yonadi; navbatdagi (toDesk) stolda o'tiradi, monitor o'chiq
    expect(f.monitors.filter((m) => m.on)).toHaveLength(1);
    expect(f.actors.find((a) => a.id === "a10")!.atDesk).toBe(true);
    expect(f.actors.find((a) => a.id === "a10")!.progress).toBeNull();
  });

  it("haqiqiy hodisa bulutchasi agent ustida chiqadi va vaqt o'tib yo'qoladi", () => {
    const sim = new OfficeSim(L, () => 0.99);
    sim.reconcile(input());
    sim.say("a3", "Tayyor!");
    expect(sim.frame().actors.find((a) => a.id === "a3")!.say).toBe("Tayyor!");
    sim.say(JARVIS_ID, "Hamma majlis zaliga!");
    expect(sim.frame().actors.find((a) => a.id === JARVIS_ID)!.say).toBe("Hamma majlis zaliga!");
    run(sim, 8);
    expect(sim.frame().actors.find((a) => a.id === "a3")!.say).not.toBe("Tayyor!");
  });

  it("agentni bosish uni topadi", () => {
    const sim = new OfficeSim(L);
    sim.reconcile(input());
    const p = g.nodes.get(L.lounge[2]!)!;
    expect(sim.hitTest({ x: p.x, y: p.y })).toBe("a2");
    expect(sim.hitTest({ x: 700, y: 360 })).toBeNull();
  });
});

describe("bezak suhbati", () => {
  it("bir vaqtda 2 tadan ko'p bezak bulutcha bo'lmaydi, haqiqiy hodisa esa har doim chiqadi", () => {
    const sim = new OfficeSim(L);
    sim.reconcile(input());
    let max = 0;
    run(sim, 60, () => {
      max = Math.max(max, sim.frame().actors.filter((a) => a.say).length);
    });
    expect(max).toBeLessThanOrEqual(2);
    sim.say("a1", "Tayyor!");
    sim.say("a2", "Men olaman!");
    sim.say("a3", "Tasdiqqa yubordim");
    expect(sim.frame().actors.filter((a) => a.say).length).toBeGreaterThanOrEqual(3);
  });
});
