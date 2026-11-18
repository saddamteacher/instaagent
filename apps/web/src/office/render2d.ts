import { WORLD, type OfficeLayout, type Pt } from "./graph";
import type { OfficeRenderer, RenderOptions } from "./renderer";
import type { FrameActor, SimFrame } from "./sim";

/** Rasm o'lchamidan qat'i nazar: canvas = ko'rinadigan kenglik × devicePixelRatio (rasm kengligidan oshmaydi). */
const MAX_CANVAS_W = 3840;

/**
 * 2D render: tepadan ko'rinadigan ofis rasmi (public/office.jpg, 4K) fon,
 * ustida agentlar, yongan monitorlar, majlis ekrani, progress chiziqlari va gap bulutchalari.
 *
 * Barcha o'lchamlar dunyo birligida (graph.ts → WORLD) beriladi va `k` bilan masshtablanadi.
 */
export class Canvas2DRenderer implements OfficeRenderer {
  private canvas = document.createElement("canvas");
  private g = this.canvas.getContext("2d")!;
  private bg = document.createElement("canvas");
  private img = new Image();
  private ro: ResizeObserver | null = null;
  private container: HTMLElement | null = null;
  /** piksel / dunyo birligi */
  private k = 1;
  private dpr = 1;

  constructor(
    private layout: OfficeLayout,
    src = "/office.jpg",
  ) {
    this.img.decoding = "async";
    this.img.onload = () => this.paintBackground();
    this.img.src = src;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Ofis: Jarvis kabineti, ish stollari, majlis zali va dam olish xonasi");
    this.canvas.style.cssText = "display:block;width:100%;height:auto;cursor:pointer";
  }

  mount(container: HTMLElement) {
    this.container = container;
    container.appendChild(this.canvas);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  destroy() {
    this.ro?.disconnect();
    this.canvas.remove();
  }

  private resize() {
    if (!this.container) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.min(MAX_CANVAS_W, Math.round(this.container.clientWidth * this.dpr));
    if (w <= 0 || w === this.canvas.width) return;
    this.canvas.width = w;
    this.canvas.height = Math.round((w * WORLD.h) / WORLD.w);
    this.k = w / WORLD.w;
    this.paintBackground();
  }

  /** Fon (rasm + brend yozuvi) alohida canvas'ga bir marta chiziladi. */
  private paintBackground() {
    const { width, height } = this.canvas;
    this.bg.width = width;
    this.bg.height = height;
    const b = this.bg.getContext("2d")!;
    if (this.img.complete && this.img.naturalWidth) {
      b.imageSmoothingQuality = "high";
      b.drawImage(this.img, 0, 0, width, height);
    } else {
      b.fillStyle = "#3a342e";
      b.fillRect(0, 0, width, height);
    }
    const s = this.layout.sign;
    const k = this.k;
    b.fillStyle = "#35271d";
    b.fillRect(s.x * k, s.y * k, s.w * k, s.h * k);
    b.fillStyle = "#f1e6d2";
    b.font = `700 ${4.4 * k}px system-ui, sans-serif`;
    b.textAlign = "center";
    b.textBaseline = "middle";
    b.fillText("JARVISGRAM", (s.x + s.w / 2) * k, (s.y + s.h / 2) * k);
  }

  toWorld(clientX: number, clientY: number): Pt | null {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return null;
    return { x: ((clientX - r.left) / r.width) * WORLD.w, y: ((clientY - r.top) / r.height) * WORLD.h };
  }

  /** Matn o'lchami: dunyo bo'yicha, lekin ekranda kamida `minCss` px (mobil uchun o'qiladigan). */
  private font(world: number, minCss: number) {
    return Math.max(world * this.k, minCss * this.dpr);
  }

  draw(f: SimFrame, opts: RenderOptions) {
    const { g, k } = this;
    const { width: W, height: H } = this.canvas;
    if (!W) return;
    g.drawImage(this.bg, 0, 0);

    // Yongan monitorlar
    for (const m of f.monitors) {
      if (!m.on) continue;
      const x = m.x * k;
      const y = m.y * k;
      const fl = 0.85 + 0.15 * Math.sin(f.t * 9 + m.x);
      g.save();
      g.shadowColor = "rgba(140,200,255,.95)";
      g.shadowBlur = 11 * k;
      g.fillStyle = `rgba(190,228,255,${fl})`;
      g.fillRect(x - 5 * k, y - 2 * k, 10 * k, 4 * k);
      g.restore();
      g.fillStyle = "rgba(60,120,200,.55)";
      g.fillRect(x - 3.7 * k, y - 1 * k, 4.7 * k, 0.7 * k);
      g.fillRect(x - 3.7 * k, y + 0.3 * k, 6.7 * k, 0.7 * k);
    }

    // Majlis zali ekrani
    if (f.screen.on) {
      const s = this.layout.screen;
      const on = 0.85 + 0.15 * Math.sin(f.t * 5);
      g.save();
      g.shadowColor = "rgba(120,190,255,.95)";
      g.shadowBlur = 16 * k;
      g.fillStyle = `rgba(70,150,255,${on})`;
      g.fillRect(s.x * k, s.y * k, s.w * k, s.h * k);
      g.restore();
      g.fillStyle = "#fff";
      g.font = `700 ${this.font(4.2, 9)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(f.screen.text, (s.x + s.w / 2) * k, (s.y + s.h / 2) * k, s.w * k * 0.94);
    }

    for (const a of f.actors) this.person(a, a.id === opts.selectedId);

    // Yorliqlar, progress va gap bulutchalari (to'qnashuvsiz joylashtirish)
    const placed: Rect[] = [];
    const bubbles: { text: string; rect: Rect; tailX: number; below: boolean; size: number }[] = [];
    const names: { a: FrameActor; x: number; y: number; below: boolean }[] = [];
    for (const a of f.actors) {
      const x = a.x * k;
      // Xonaning eng tepasida (masalan majlis ekrani ostida) — yorliqlar pastga
      const below = a.y < 62;
      let y = below ? a.y * k + 9 * k : a.y * k - 9 * k;
      if (a.progress !== null) {
        const w = 14.7 * k;
        const h = Math.max(2.3 * k, 3 * this.dpr);
        const by = below ? y : y - h;
        g.fillStyle = "rgba(0,0,0,.6)";
        g.fillRect(x - w / 2, by, w, h);
        g.fillStyle = "#6fb1ff";
        g.fillRect(x - w / 2, by, w * a.progress, h);
        y += below ? h + 2 * k : -(h + 2 * k);
      }
      let pill: Pill | null = null;
      if (a.isJarvis) pill = this.measurePill("JARVIS", x, y, below, this.font(6.6, 10), "#f0a04b", "#1a1206");
      else if (a.paused) pill = this.measurePill("To'xtatilgan", x, y, below, this.font(5.4, 9), "rgba(239,107,107,.92)", "#fff");
      if (pill) {
        this.drawPill(pill);
        placed.push(pill.rect);
        y = below ? pill.rect.y + pill.rect.h + 2 * this.dpr : pill.rect.y - 2 * this.dpr;
      }
      if (a.say) {
        const size = this.font(a.isJarvis ? 7.4 : 6.4, a.isJarvis ? 12 : 11);
        const b = this.measureBubble(a.say, x, y, below, size);
        for (let i = 0; i < 5 && placed.some((r) => overlap(r, b.rect)); i++) b.rect.y += (below ? 1 : -1) * (b.rect.h + 3 * this.dpr);
        b.rect.y = Math.max(2, Math.min(this.canvas.height - b.rect.h - 2, b.rect.y));
        placed.push(b.rect);
        bubbles.push({ ...b, below, size, text: a.say });
      } else if (!pill && (opts.labels || a.id === opts.selectedId) && !a.moving && a.state !== "meeting") {
        names.push({ a, x, y, below });
      }
    }
    // Tanlangan agent ismi birinchi navbatda; qolganlari faqat joy bo'lsa
    names.sort((p, q) => Number(q.a.id === opts.selectedId) - Number(p.a.id === opts.selectedId));
    for (const n of names) {
      const pl = this.measurePill(n.a.name, n.x, n.y, n.below, this.font(5.6, 9), "rgba(15,17,20,.78)", "#fff");
      if (n.a.id !== opts.selectedId && placed.some((r) => overlap(r, pl.rect))) continue;
      placed.push(pl.rect);
      this.drawPill(pl);
    }
    for (const b of bubbles) this.drawBubble(b.text, b.rect, b.tailX, b.below, b.size);

    const clock = this.measurePill(opts.clock, W - 24 * k, H - 4 * k, false, this.font(7, 11), "rgba(15,17,20,.78)", "#fff");
    this.drawPill(clock);
  }

  private person(a: FrameActor, selected: boolean) {
    const { g, k } = this;
    const u = (k / 3) * 1.3; // prototip piksellari (2250 px'da 1.3× shkala)
    const x = a.x * k;
    const y = a.y * k;
    g.save();
    if (selected) {
      g.strokeStyle = "#f0a04b";
      g.lineWidth = 2.5 * u;
      g.beginPath();
      g.arc(x, y, 22 * u, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,.38)";
    g.beginPath();
    g.ellipse(x + 3 * u, y + 7 * u, 19 * u, 12 * u, 0, 0, Math.PI * 2);
    g.fill();
    // Tana (kostyum yoki ko'ylak)
    g.save();
    g.translate(x, y);
    g.rotate(a.bob);
    g.fillStyle = a.isJarvis ? "#1a2030" : a.shirt;
    g.beginPath();
    g.ellipse(0, 0, 17 * u, 11 * u, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,.45)";
    g.lineWidth = 1.5 * u;
    g.stroke();
    if (a.isJarvis) {
      // Oq ko'ylak yoqasi va qizil galstuk
      g.fillStyle = "#f4f4f1";
      g.beginPath();
      g.moveTo(-5 * u, a.dir * 2 * u);
      g.lineTo(5 * u, a.dir * 2 * u);
      g.lineTo(0, a.dir * 10 * u);
      g.fill();
      g.fillStyle = "#a02525";
      g.fillRect(-1.5 * u, a.dir > 0 ? 3 * u : -9 * u, 3 * u, 6 * u);
    }
    g.restore();
    // Bosh: yuz qaragan tomonga
    g.fillStyle = "#e3b48f";
    g.beginPath();
    g.arc(x, y - 3 * u + a.dir * 2.5 * u, 9 * u, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = a.hair;
    g.beginPath();
    g.arc(x, y - 3 * u, 9.5 * u, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,.35)";
    g.lineWidth = u;
    g.stroke();
    g.restore();
  }

  private measurePill(text: string, x: number, y: number, below: boolean, size: number, bg: string, fg: string): Pill {
    this.g.font = `600 ${size}px system-ui, sans-serif`;
    const w = this.g.measureText(text).width + size * 0.9;
    const h = size * 1.55;
    const cx = Math.max(w / 2 + 4, Math.min(this.canvas.width - w / 2 - 4, x));
    return { text, size, bg, fg, rect: { x: cx - w / 2, y: below ? y : y - h, w, h } };
  }

  private drawPill(p: Pill) {
    const g = this.g;
    const r = p.rect;
    g.font = `600 ${p.size}px system-ui, sans-serif`;
    g.fillStyle = p.bg;
    g.beginPath();
    g.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
    g.fill();
    g.fillStyle = p.fg;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(p.text, r.x + r.w / 2, r.y + r.h / 2 + 1);
  }

  private measureBubble(text: string, x: number, y: number, below: boolean, size: number) {
    this.g.font = `600 ${size}px system-ui, sans-serif`;
    const w = this.g.measureText(text).width + size * 1.1;
    const h = size * 1.7;
    const tail = size * 0.55;
    const cx = Math.max(w / 2 + 4, Math.min(this.canvas.width - w / 2 - 4, x));
    return { rect: { x: cx - w / 2, y: below ? y + tail : y - h - tail, w, h }, tailX: x };
  }

  /** Komiks uslubidagi gap bulutchasi (oq, qora chegara, agentga qaragan dum). */
  private drawBubble(text: string, r: Rect, x: number, below: boolean, size: number) {
    const g = this.g;
    const tail = size * 0.55;
    const lw = Math.max(1.5, size * 0.12);
    const tx = Math.max(r.x + r.h / 2, Math.min(r.x + r.w - r.h / 2, x));
    const base = below ? r.y + lw : r.y + r.h - lw;
    const tip = below ? r.y - tail : r.y + r.h + tail;
    g.font = `600 ${size}px system-ui, sans-serif`;
    g.fillStyle = "#fff";
    g.strokeStyle = "#14161a";
    g.lineWidth = lw;
    g.beginPath();
    g.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(tx - tail * 0.6, base);
    g.lineTo(tx, tip);
    g.lineTo(tx + tail * 0.6, base);
    g.fill();
    g.beginPath();
    g.moveTo(tx - tail * 0.6, below ? r.y : r.y + r.h);
    g.lineTo(tx, tip);
    g.lineTo(tx + tail * 0.6, below ? r.y : r.y + r.h);
    g.stroke();
    g.fillStyle = "#14161a";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + 1);
  }
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Pill {
  text: string;
  size: number;
  bg: string;
  fg: string;
  rect: Rect;
}
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
