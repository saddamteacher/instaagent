/**
 * Ofis xaritasi: yo'lak tugunlari grafi va eng qisqa yo'l (Dijkstra).
 *
 * Koordinatalar "dunyo birliklari"da: WORLD.w × WORLD.h (rasm nisbati bilan bir xil).
 * Rasm o'lchamiga bog'liq emas: 2250 px yoki 4K (3840 px) fon bir xil ishlaydi,
 * render qatlami faqat masshtab koeffitsientini hisoblaydi.
 *
 * Agentlar faqat grafning qirralari bo'ylab yuradi, shuning uchun devordan o'tmaydi.
 */

export const WORLD = { w: 750, h: 372 } as const;

export interface Pt {
  x: number;
  y: number;
}

export interface Seat {
  node: string;
  /** Agent qaysi tomonga qaraydi (1 — pastga, -1 — tepaga) */
  dir: 1 | -1;
  /** Monitorning o'rindiqqa nisbatan Y siljishi */
  mon: number;
}

export class Graph {
  readonly nodes = new Map<string, Pt>();
  readonly edges = new Map<string, Set<string>>();

  node(x: number, y: number): string {
    const k = `${x},${y}`;
    if (!this.nodes.has(k)) {
      this.nodes.set(k, { x, y });
      this.edges.set(k, new Set());
    }
    return k;
  }

  link(a: string, b: string) {
    if (a === b) return;
    this.edges.get(a)!.add(b);
    this.edges.get(b)!.add(a);
  }

  /** Nuqtalarni ketma-ket bog'laydi; oxirgi tugunni qaytaradi. */
  path(pts: [number, number][]): string {
    let prev: string | null = null;
    for (const [x, y] of pts) {
      const k = this.node(x, y);
      if (prev) this.link(prev, k);
      prev = k;
    }
    return prev!;
  }

  /** Bitta to'g'ri chiziqda (x=val yoki y=val) yotgan tugunlarni ketma-ket bog'laydi. */
  linkLine(axis: "x" | "y", val: number, min: number, max: number) {
    const o = axis === "y" ? "x" : "y";
    const ks = [...this.nodes.entries()]
      .filter(([, p]) => p[axis] === val && p[o] >= min && p[o] <= max)
      .sort((a, b) => a[1][o] - b[1][o])
      .map(([k]) => k);
    for (let i = 1; i < ks.length; i++) this.link(ks[i - 1]!, ks[i]!);
  }

  dist(a: string, b: string) {
    const p = this.nodes.get(a)!;
    const q = this.nodes.get(b)!;
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  /** Dijkstra: a → b yo'li (a dan keyingi tugunlar, b bilan tugaydi). Yo'l bo'lmasa []. */
  route(a: string, b: string): string[] {
    if (a === b) return [];
    const dist = new Map<string, number>([[a, 0]]);
    const prev = new Map<string, string>();
    const done = new Set<string>();
    // Kichik binar uyum
    const heap: [number, string][] = [[0, a]];
    const push = (item: [number, string]) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p]![0] <= heap[i]![0]) break;
        [heap[p], heap[i]] = [heap[i]!, heap[p]!];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, u] = pop();
      if (done.has(u)) continue;
      done.add(u);
      if (u === b) break;
      for (const v of this.edges.get(u) ?? []) {
        const nd = d + this.dist(u, v);
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          prev.set(v, u);
          push([nd, v]);
        }
      }
    }
    if (!done.has(b)) return [];
    const out: string[] = [];
    for (let c: string | undefined = b; c && c !== a; c = prev.get(c)) out.unshift(c);
    return out;
  }

  /** Erkin nuqtaga eng yaqin tugun (agent yo'ldan chetda bo'lsa, qaytish uchun). */
  nearest(p: Pt): string {
    let best = "";
    let bd = Infinity;
    for (const [k, q] of this.nodes) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }
}

/** Ofis rejasi: xona va o'rindiqlar (rasm: public/office.jpg). */
export interface OfficeLayout {
  graph: Graph;
  /** 20 ta kompyuterli o'rindiq. Agent stoli: seats[deskNo - 1]. */
  seats: Seat[];
  /** Majlis zalidagi o'rindiqlar (13 ta agent uchun) */
  conf: string[];
  /** Dam olish xonasidagi joylar (13 ta) */
  lounge: string[];
  jarvisHome: string;
  jarvisConf: string;
  /** Majlis zalidagi ekran (dunyo birliklarida) */
  screen: { x: number; y: number; w: number; h: number };
  /** Qabulxona peshtaxtasidagi brend yozuvi o'rni */
  sign: { x: number; y: number; w: number; h: number };
}

export function buildLayout(): OfficeLayout {
  const g = new Graph();
  const UY = 155; // yuqori yo'lak
  const LY = 236; // pastki yo'lak
  const seats: Seat[] = [];

  // O'rta zona: 14 ta stol (7 yuqori qator, 7 pastki qator)
  for (const x of [124, 165, 243, 284, 363, 409, 487]) seats.push({ node: g.path([[x, UY], [x, 174]]), dir: 1, mon: 13 });
  for (const x of [119, 163, 242, 283, 362, 407, 487]) seats.push({ node: g.path([[x, LY], [x, 219]]), dir: -1, mon: -20 });

  for (const [x, y] of [[81, UY], [529, UY], [223, UY], [268, UY], [341, UY], [517, UY], [81, LY], [529, LY], [229, LY]] as const)
    g.node(x, y);
  g.path([[81, UY], [81, LY]]);
  g.path([[529, UY], [529, LY]]);

  // Chap tepa: Jarvis kabineti
  const jarvisHome = g.path([[223, UY], [223, 120], [223, 100], [168, 96], [168, 45], [127, 45]]);
  // Kabinetlar 2, 3, 4: yana 6 ta kompyuter (jami 20)
  seats.push({ node: g.path([[268, UY], [268, 122], [311, 118], [311, 43], [282, 43]]), dir: 1, mon: 14 });
  seats.push({ node: g.path([[341, UY], [341, 122], [407, 118], [407, 40], [380, 40]]), dir: 1, mon: 15 });
  g.path([[517, UY], [517, 100]]);
  seats.push({ node: g.path([[517, 100], [499, 96], [499, 86]]), dir: -1, mon: -18 });
  seats.push({ node: g.path([[499, 96], [465, 96], [465, 86]]), dir: -1, mon: -18 });
  seats.push({ node: g.path([[517, 100], [517, 42], [499, 42], [499, 50]]), dir: 1, mon: 8 });
  seats.push({ node: g.path([[499, 42], [465, 42], [465, 50]]), dir: 1, mon: 8 });

  // O'ng tepa: majlis zali
  g.path([[529, UY], [553, 149], [566, 150]]);
  const conf: string[] = [];
  for (const y of [70, 84, 98, 112, 126, 140, 154]) conf.push(g.path([[566, y], [579, y]]));
  g.node(566, 47);
  g.node(566, 186);
  conf.push(g.path([[611, 186], [611, 176]]));
  conf.push(g.path([[630, 186], [630, 176]]));
  g.node(668, 186);
  for (const y of [154, 140, 126, 112]) conf.push(g.path([[668, y], [656, y]]));
  const jarvisConf = g.path([[566, 47], [611, 47]]);
  g.linkLine("x", 566, 47, 186);
  g.linkLine("y", 186, 566, 668);
  g.linkLine("x", 668, 112, 186);

  // Chap past: oshxona / dam olish xonasi
  g.path([[229, LY], [229, 262], [205, 280], [195, 300], [195, 326]]);
  const lounge: string[] = [];
  for (const x of [112, 131, 150, 169]) lounge.push(g.path([[x, 326], [x, 313]]));
  for (const x of [124, 146]) lounge.push(g.path([[x, 326], [x, 343]]));
  lounge.push(g.path([[97, 326], [88, 330]]));
  lounge.push(g.path([[97, 326], [92, 312], [71, 311]]));
  lounge.push(g.path([[180, 326], [180, 340]]));
  lounge.push(g.path([[186, 326], [186, 313]]));
  lounge.push(g.path([[101, 326], [101, 340]]));
  lounge.push(g.node(160, 326));
  lounge.push(g.node(137, 326));
  g.linkLine("y", 326, 97, 195);
  g.linkLine("y", UY, 81, 529);
  g.linkLine("y", LY, 81, 529);

  return {
    graph: g,
    seats,
    conf,
    lounge,
    jarvisHome,
    jarvisConf,
    screen: { x: 582, y: 23, w: 53, h: 12 },
    sign: { x: 310, y: 258, w: 68, h: 27 },
  };
}
