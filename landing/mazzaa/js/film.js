/*
 * MAZZAA scroll film.
 *
 * Ikki rejim:
 *  1) FRAMES — assets/frames/manifest.json mavjud bo'lsa, Flow'da yaratilgan videodan
 *     olingan kadrlar (WebP) scroll bilan "scrub" qilinadi, ustidan uchqun/yorug'lik qo'shiladi.
 *  2) PROCEDURAL — kadrlar bo'lmasa, butun sahna canvas'da real vaqtda chiziladi:
 *     gaz olovi -> tovaga kartoshka tushadi -> tova siltanadi va alanga -> chili yomg'iri -> final.
 *
 * Tashqi API:  const film = new MazzaaFilm(canvas); film.setProgress(0..1); film.active = bool;
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t;
  const bell = (t) => Math.sin(Math.PI * clamp(t));
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sprite(size, stops) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }

  const SPR = {
    core: sprite(96, [[0, "rgba(255,236,190,1)"], [0.22, "rgba(255,190,90,.9)"], [0.55, "rgba(255,110,20,.4)"], [1, "rgba(255,60,0,0)"]]),
    orange: sprite(96, [[0, "rgba(255,150,40,.9)"], [0.35, "rgba(240,80,5,.55)"], [1, "rgba(200,30,0,0)"]]),
    red: sprite(96, [[0, "rgba(255,95,25,.75)"], [0.4, "rgba(200,30,0,.35)"], [1, "rgba(120,0,0,0)"]]),
    blue: sprite(64, [[0, "rgba(215,235,255,.95)"], [0.3, "rgba(90,150,255,.7)"], [1, "rgba(20,40,255,0)"]]),
    smoke: sprite(96, [[0, "rgba(130,118,110,.45)"], [1, "rgba(60,55,50,0)"]]),
    dust: sprite(32, [[0, "rgba(220,40,15,.7)"], [1, "rgba(160,10,0,0)"]]),
    spark: sprite(16, [[0, "rgba(255,255,235,1)"], [0.4, "rgba(255,200,80,.9)"], [1, "rgba(255,100,0,0)"]]),
  };

  const RAW = [247, 231, 172], GOLD = [244, 172, 52], SPICY = [214, 82, 30];

  /* ---------------- Frame sequence (Flow videodan) ---------------- */
  class FrameSeq {
    constructor(manifest, onProgress) {
      const tiers = manifest.tiers || {};
      const need = Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2);
      const t4k = tiers["4k"], thd = tiers.hd || tiers["1080"] || Object.values(tiers)[0];
      this.tier = need > 2300 && t4k ? t4k : thd;
      this.count = manifest.count;
      this.imgs = new Array(this.count);
      this.loaded = 0;
      this.onProgress = onProgress;
      this.ready = new Promise((res) => (this._resolve = res));
      this._queue();
    }
    url(i) {
      const n = String(i + 1).padStart(4, "0");
      return this.tier.path.replace("%04d", n);
    }
    _queue() {
      // Progressiv tartib: avval har 16-kadr, keyin 8, 4, 2, 1 — scroll darrov ishlaydi.
      const order = [], seen = new Uint8Array(this.count);
      for (let step = 16; step >= 1; step >>= 1)
        for (let i = 0; i < this.count; i += step) if (!seen[i]) { seen[i] = 1; order.push(i); }
      if (!seen[this.count - 1]) order.push(this.count - 1);
      const firstBatch = Math.min(order.length, Math.ceil(this.count / 8) + 1);
      let idx = 0, inflight = 0;
      const next = () => {
        while (inflight < 6 && idx < order.length) {
          const i = order[idx++];
          inflight++;
          const img = new Image();
          img.decoding = "async";
          img.onload = img.onerror = () => {
            inflight--;
            if (img.naturalWidth) this.imgs[i] = img;
            this.loaded++;
            if (this.onProgress) this.onProgress(Math.min(1, this.loaded / firstBatch));
            if (this.loaded === firstBatch) this._resolve();
            next();
          };
          img.src = this.url(i);
        }
      };
      next();
    }
    get(p) {
      const want = Math.round(clamp(p) * (this.count - 1));
      for (let d = 0; d < this.count; d++) {
        if (this.imgs[want - d]) return this.imgs[want - d];
        if (this.imgs[want + d]) return this.imgs[want + d];
      }
      return null;
    }
  }

  /* ---------------- Film renderer ---------------- */
  class MazzaaFilm {
    constructor(canvas, opts = {}) {
      this.c = canvas;
      this.g = canvas.getContext("2d");
      this.p = 0;
      this.target = 0;
      this.parts = [];
      this.active = true;
      this.time = 0;
      this.last = performance.now();
      this.frames = null;
      this.reduced = !!opts.reduced;
      this._build();
      this.resize();
      addEventListener("resize", () => this.resize());
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    /** Kadrlarni yuklashga urinadi. Promise: true = kadrlar bor, false = procedural. */
    loadFrames(url, onProgress) {
      return fetch(url, { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((m) => {
          if (!m || !m.count || !m.tiers) throw 0;
          const seq = new FrameSeq(m, onProgress);
          return seq.ready.then(() => { this.frames = seq; return true; });
        })
        .catch(() => false);
    }

    setProgress(p) { this.target = clamp(p); }

    _build() {
      const r = rng(1337);
      const N = 24;
      this.chips = [];
      for (let i = 0; i < N; i++) {
        this.chips.push({
          a: r() * TAU,
          rr: Math.sqrt(r()) * 0.8,
          size: 0.15 + r() * 0.06,
          rot: r() * TAU,
          fall: 0.2 + (i / N) * 0.2 + r() * 0.012,
          spin: (r() < 0.5 ? -1 : 1) * (1 + r() * 1.6),
          toss: 0.55 + r() * 0.7,
          td: r() * 0.045,
          bias: r() * 0.18,
          stack: r(),
          dots: Array.from({ length: 16 }, () => [r() - 0.5, r() - 0.5, 0.5 + r()]),
          prevF: 0,
        });
      }
      this.chips.sort((a, b) => Math.sin(a.a) * a.rr - Math.sin(b.a) * b.rr);
      this.flakes = Array.from({ length: 170 }, () => ({
        a: r() * TAU, rr: Math.sqrt(r()) * 0.84, start: 0.7 + r() * 0.14, rot: r() * TAU,
        s: 0.6 + r() * 0.9, drift: r() - 0.5, col: r() < 0.6 ? [196, 22, 12] : r() < 0.5 ? [235, 60, 20] : [120, 10, 6],
      }));
      this.peppers = [
        { a: -0.5, rr: 0.32, start: 0.712, rot: 0.35, s: 1, spin: 2.4 },
        { a: 2.5, rr: 0.42, start: 0.742, rot: -2.6, s: 0.85, spin: -2 },
      ];
    }

    resize() {
      const w = this.c.clientWidth || innerWidth;
      const h = this.c.clientHeight || innerHeight;
      let dpr = Math.min(devicePixelRatio || 1, 2);
      const maxPx = 3.8e6;
      if (w * h * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (w * h));
      this.dpr = dpr;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.W = w; this.H = h;
      const narrow = w < 720;
      this.R = narrow ? Math.min(w * 0.42, h * 0.34) : Math.min(w * 0.3, h * 0.42);
      this.cx = w / 2;
      this.cy = h * (narrow ? 0.58 : 0.6);
      this.Ry = this.R * 0.42;
      this.wall = this.R * 0.13;
    }

    /* ---------- particles ---------- */
    _emit(n, fn) {
      if (this.parts.length > 1800) return;
      this._acc = this._acc || {};
      const key = fn.name;
      this._acc[key] = (this._acc[key] || 0) + n;
      while (this._acc[key] >= 1) { this._acc[key] -= 1; this.parts.push(fn.call(this)); }
    }

    _update(dt, s) {
      const { R, cx, cy, Ry, wall } = this;
      const rnd = Math.random;
      const panY = cy + s.panLift;

      // gaz olovi (ko'k)
      this._emit(170 * s.ign * (1 - s.fin * 0.8) * dt, function burner() {
        const th = rnd() * TAU;
        return { k: "blue", x: cx + Math.cos(th) * R * 0.78, y: cy + wall + Ry * 0.62 + Math.sin(th) * Ry * 0.62,
          vx: Math.cos(th) * R * 0.15, vy: -R * (0.35 + rnd() * 0.3), age: 0, life: 0.22 + rnd() * 0.2, s: R * (0.06 + rnd() * 0.05), seed: rnd() * 10 };
      });
      // qovurilish paytida chetdan mayda tillar
      this._emit(55 * s.sizzle * dt, function rim() {
        const th = Math.PI + rnd() * Math.PI;
        return { k: "fire", x: cx + Math.cos(th) * R * 0.95, y: panY + Math.sin(th) * Ry * 0.95, vx: (rnd() - 0.5) * R * 0.2,
          vy: -R * (0.5 + rnd() * 0.6), age: 0, life: 0.3 + rnd() * 0.3, s: R * (0.07 + rnd() * 0.07), seed: rnd() * 10 };
      });
      // katta alanga (flambe)
      this._emit((400 * s.burst + 30 * s.fin) * dt, function flame() {
        const u = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.85;
        const k = 0.6 + s.burst * 0.9;
        return { k: "fire", x: cx + Math.cos(u) * rr * R, y: panY + Math.sin(u) * rr * Ry - R * 0.04, vx: (rnd() - 0.5) * R * 0.5,
          vy: -R * (1.1 + rnd() * 1.5) * k, age: 0, life: 0.45 + rnd() * 0.65, s: R * (0.16 + rnd() * 0.24) * k, seed: rnd() * 10 };
      });
      // uchqunlar
      this._emit((14 * s.ign + 140 * s.burst + 30 * s.sizzle + 30 * s.fin) * dt, function spark() {
        const u = rnd() * TAU;
        return { k: "spark", x: cx + Math.cos(u) * R * 0.7 * rnd(), y: panY + Math.sin(u) * Ry * 0.7 * rnd(), vx: (rnd() - 0.5) * R * 1.6,
          vy: -R * (1 + rnd() * 2.6), age: 0, life: 0.8 + rnd() * 1.2, s: (1.2 + rnd() * 2.4), seed: rnd() * 10 };
      });
      // tutun / bug'
      this._emit((10 * s.sizzle + 26 * s.burst) * dt, function smoke() {
        return { k: "smoke", x: cx + (rnd() - 0.5) * R * 1.2, y: panY - R * 0.1, vx: (rnd() - 0.5) * R * 0.2,
          vy: -R * (0.25 + rnd() * 0.25), age: 0, life: 2.6 + rnd() * 1.8, s: R * (0.35 + rnd() * 0.3), seed: rnd() * 10 };
      });
      // yog' pufakchalari
      this._emit(110 * s.bubbles * dt, function bubble() {
        const u = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.86;
        return { k: "bubble", x: cx + Math.cos(u) * rr * R * 0.92, y: panY + Math.sin(u) * rr * Ry * 0.9, vx: 0, vy: 0,
          age: 0, life: 0.18 + rnd() * 0.25, s: R * (0.008 + rnd() * 0.018), seed: 0 };
      });
      // chili kukuni
      this._emit(160 * bell(s.spice) * dt, function dust() {
        return { k: "dust", x: cx + (rnd() - 0.5) * R * 1.8, y: panY - R * (0.6 + rnd() * 1.4), vx: (rnd() - 0.5) * R * 0.1,
          vy: R * (0.15 + rnd() * 0.2), age: 0, life: 1.4 + rnd(), s: R * (0.05 + rnd() * 0.07), seed: rnd() * 10 };
      });

      const t = this.time;
      const out = [];
      for (const q of this.parts) {
        q.age += dt;
        if (q.age >= q.life) continue;
        if (q.k === "fire" || q.k === "blue") {
          q.vx += Math.sin(t * 6 + q.seed + q.y * 0.02) * R * 1.4 * dt;
          q.vx *= 1 - 1.5 * dt;
          q.vy *= 1 - 0.4 * dt;
        } else if (q.k === "spark") {
          q.vx += Math.sin(t * 3 + q.seed) * R * 0.8 * dt;
          q.vy += R * 0.35 * dt;
        } else if (q.k === "drop") {
          q.vy += R * 6 * dt;
        } else if (q.k === "smoke") {
          q.vx += Math.sin(t + q.seed) * R * 0.05 * dt;
        }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        out.push(q);
      }
      this.parts = out;
    }

    _splash(x, y) {
      const R = this.R, rnd = Math.random;
      for (let i = 0; i < 9; i++) {
        const u = -Math.PI * (0.1 + rnd() * 0.8);
        const v = R * (0.6 + rnd() * 1.1);
        this.parts.push({ k: "drop", x, y, vx: Math.cos(u) * v, vy: Math.sin(u) * v, age: 0, life: 0.35 + rnd() * 0.25, s: 1.4 + rnd() * 2.2, seed: 0 });
      }
    }

    _drawParts(g, kinds) {
      for (const q of this.parts) {
        if (!kinds.includes(q.k)) continue;
        const f = q.age / q.life;
        if (q.k === "fire") {
          const sz = q.s * (1.05 - f * 0.75);
          g.globalAlpha = Math.pow(1 - f, 1.3) * 0.62;
          const spr = f < 0.22 ? SPR.core : f < 0.58 ? SPR.orange : SPR.red;
          g.drawImage(spr, q.x - sz / 2, q.y - sz * 0.75, sz, sz * 1.45);
        } else if (q.k === "blue") {
          const sz = q.s * (1 - f * 0.6);
          g.globalAlpha = (1 - f) * 0.9;
          g.drawImage(f < 0.5 ? SPR.blue : SPR.orange, q.x - sz / 2, q.y - sz, sz, sz * 1.6);
        } else if (q.k === "spark" || q.k === "drop") {
          const sz = q.s * 3 * (1 - f * 0.5);
          g.globalAlpha = 1 - f;
          g.drawImage(SPR.spark, q.x - sz / 2, q.y - sz / 2, sz, sz);
        } else if (q.k === "smoke") {
          const sz = q.s * (1 + f * 2.2);
          g.globalAlpha = Math.sin(Math.PI * f) * 0.12;
          g.drawImage(SPR.smoke, q.x - sz / 2, q.y - sz / 2, sz, sz);
        } else if (q.k === "dust") {
          const sz = q.s * (1 + f);
          g.globalAlpha = Math.sin(Math.PI * f) * 0.5;
          g.drawImage(SPR.dust, q.x - sz / 2, q.y - sz / 2, sz, sz);
        } else if (q.k === "bubble") {
          g.globalAlpha = Math.sin(Math.PI * f) * 0.5;
          g.strokeStyle = "rgba(255,240,200,1)";
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(q.x, q.y, q.s * (0.6 + f), q.s * 0.5 * (0.6 + f), 0, 0, TAU);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }

    /* ---------- objects ---------- */
    _pan(g, cx, cy, s) {
      const { R, Ry, wall } = this;
      // soya
      g.save();
      g.translate(cx, cy + wall + Ry * 0.55);
      g.scale(1, 0.32);
      let gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.3);
      gr.addColorStop(0, "rgba(0,0,0,.75)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(-R * 1.4, -R * 1.4, R * 2.8, R * 2.8);
      g.restore();

      // dasta
      const hx0 = cx + R * 0.88, hy0 = cy - Ry * 0.12, hx1 = cx + R * 1.95, hy1 = cy - Ry * 1.05;
      g.lineCap = "round";
      g.strokeStyle = "#151111"; g.lineWidth = R * 0.1;
      g.beginPath(); g.moveTo(hx0, hy0); g.lineTo(hx1, hy1); g.stroke();
      const mx = lerp(hx0, hx1, 0.38), my = lerp(hy0, hy1, 0.38);
      gr = g.createLinearGradient(mx, my - R * 0.08, mx, my + R * 0.08);
      gr.addColorStop(0, "#3b3230"); gr.addColorStop(0.5, "#1a1414"); gr.addColorStop(1, "#070505");
      g.strokeStyle = gr; g.lineWidth = R * 0.125;
      g.beginPath(); g.moveTo(mx, my); g.lineTo(hx1, hy1); g.stroke();
      g.strokeStyle = "rgba(255,230,210,.14)"; g.lineWidth = R * 0.02;
      g.beginPath(); g.moveTo(mx + R * 0.02, my - R * 0.045); g.lineTo(hx1 - R * 0.02, hy1 - R * 0.05); g.stroke();

      // devor
      g.beginPath();
      g.ellipse(cx, cy + wall, R * 0.9, Ry * 0.9, 0, 0, Math.PI);
      g.lineTo(cx - R, cy);
      g.ellipse(cx, cy, R, Ry, 0, Math.PI, 0, true);
      g.closePath();
      gr = g.createLinearGradient(cx - R, 0, cx + R, 0);
      gr.addColorStop(0, "#080606"); gr.addColorStop(0.28, "#2d2726"); gr.addColorStop(0.42, "#6f6562");
      gr.addColorStop(0.52, "#3a3231"); gr.addColorStop(0.8, "#141010"); gr.addColorStop(1, "#050404");
      g.fillStyle = gr; g.fill();
      if (s.light > 0.02) {
        g.globalCompositeOperation = "lighter";
        g.fillStyle = `rgba(255,90,20,${s.light * 0.22})`; g.fill();
        g.globalCompositeOperation = "source-over";
      }

      // gardish
      g.beginPath(); g.ellipse(cx, cy, R, Ry, 0, 0, TAU);
      g.fillStyle = "#231e1d"; g.fill();
      gr = g.createLinearGradient(cx - R, cy, cx + R, cy);
      gr.addColorStop(0, "rgba(255,255,255,.04)"); gr.addColorStop(0.33, "rgba(255,240,228,.55)");
      gr.addColorStop(0.6, "rgba(255,255,255,.06)"); gr.addColorStop(0.9, `rgba(255,170,110,${0.2 + s.light * 0.5})`);
      g.strokeStyle = gr; g.lineWidth = R * 0.022; g.stroke();

      // ichki yuza
      g.beginPath(); g.ellipse(cx, cy + R * 0.012, R * 0.93, Ry * 0.9, 0, 0, TAU);
      gr = g.createRadialGradient(cx - R * 0.25, cy - Ry * 0.35, R * 0.05, cx, cy, R);
      gr.addColorStop(0, "#3c3534"); gr.addColorStop(0.5, "#191514"); gr.addColorStop(1, "#090707");
      g.fillStyle = gr; g.fill();
      if (s.heat > 0.01) {
        g.save(); g.clip();
        g.globalCompositeOperation = "lighter";
        gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
        gr.addColorStop(0, `rgba(255,70,10,${0.16 * s.heat + 0.25 * s.light})`); gr.addColorStop(1, "rgba(255,30,0,0)");
        g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2);
        g.restore();
      }
      // yog' yaltirashi
      if (s.oil > 0.01) {
        g.save();
        g.beginPath(); g.ellipse(cx, cy + R * 0.01, R * 0.82, Ry * 0.78, 0, 0, TAU);
        gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.85);
        gr.addColorStop(0, `rgba(255,200,90,${0.16 * s.oil})`); gr.addColorStop(1, `rgba(255,160,40,${0.06 * s.oil})`);
        g.fillStyle = gr; g.fill();
        g.beginPath(); g.ellipse(cx - R * 0.1, cy - Ry * 0.12, R * 0.62, Ry * 0.5, 0, Math.PI * 1.05, Math.PI * 1.6);
        g.strokeStyle = `rgba(255,250,235,${0.35 * s.oil})`; g.lineWidth = R * 0.012; g.lineCap = "round"; g.stroke();
        g.restore();
      }
    }

    _chip(g, x, y, size, rot, sy, color, spice, dots, light) {
      g.save();
      g.translate(x, y);
      g.scale(1, sy);
      g.rotate(rot);
      const h = size / 2, r = size * 0.2;
      g.beginPath();
      g.moveTo(-h + r, -h);
      // to'lqinsimon yuqori qirra
      for (let i = 1; i <= 4; i++) g.quadraticCurveTo(-h + r + (i - 0.5) * (size - 2 * r) / 4, -h - size * 0.03 * (i % 2 ? 1 : -1), -h + r + i * (size - 2 * r) / 4, -h);
      g.quadraticCurveTo(h, -h, h, -h + r);
      g.lineTo(h, h - r);
      g.quadraticCurveTo(h, h, h - r, h);
      for (let i = 1; i <= 4; i++) g.quadraticCurveTo(h - r - (i - 0.5) * (size - 2 * r) / 4, h + size * 0.03 * (i % 2 ? 1 : -1), h - r - i * (size - 2 * r) / 4, h);
      g.quadraticCurveTo(-h, h, -h, h - r);
      g.lineTo(-h, -h + r);
      g.quadraticCurveTo(-h, -h, -h + r, -h);
      g.closePath();
      const gr = g.createLinearGradient(-h, -h, h, h);
      gr.addColorStop(0, rgb(mix(color, [255, 245, 215], 0.35)));
      gr.addColorStop(0.55, rgb(color));
      gr.addColorStop(1, rgb(mix(color, [90, 30, 0], 0.4)));
      g.fillStyle = gr;
      g.fill();
      g.save();
      g.clip();
      g.lineWidth = size * 0.04;
      for (let k = 1; k <= 5; k++) {
        const xx = -h + (k * size) / 6;
        g.strokeStyle = "rgba(120,45,0,.26)";
        g.beginPath(); g.moveTo(xx, -h); g.lineTo(xx, h); g.stroke();
        g.strokeStyle = "rgba(255,245,215,.2)";
        g.beginPath(); g.moveTo(xx + size * 0.035, -h); g.lineTo(xx + size * 0.035, h); g.stroke();
      }
      if (spice > 0.01) {
        g.fillStyle = `rgba(185,18,8,${0.9 * spice})`;
        const n = Math.ceil(dots.length * spice);
        for (let i = 0; i < n; i++) {
          const d = dots[i];
          g.beginPath(); g.arc(d[0] * size, d[1] * size, size * 0.03 * d[2], 0, TAU); g.fill();
        }
      }
      if (light > 0.02) {
        g.globalCompositeOperation = "lighter";
        g.fillStyle = `rgba(255,110,30,${light * 0.28})`;
        g.fillRect(-h, -h, size, size);
      }
      g.restore();
      g.strokeStyle = "rgba(105,40,0,.35)";
      g.lineWidth = size * 0.025;
      g.stroke();
      g.restore();
    }

    _pepper(g, x, y, L, rot, sy) {
      g.save();
      g.translate(x, y);
      g.scale(1, sy);
      g.rotate(rot);
      g.translate(-L * 0.45, 0);
      const gr = g.createLinearGradient(0, -L * 0.12, 0, L * 0.14);
      gr.addColorStop(0, "#ff6a48"); gr.addColorStop(0.35, "#e3170a"); gr.addColorStop(1, "#6e0404");
      g.beginPath();
      g.moveTo(0, -L * 0.1);
      g.bezierCurveTo(L * 0.35, -L * 0.17, L * 0.75, -L * 0.09, L, L * 0.13);
      g.bezierCurveTo(L * 0.7, L * 0.05, L * 0.35, L * 0.13, 0, L * 0.1);
      g.quadraticCurveTo(-L * 0.05, 0, 0, -L * 0.1);
      g.fillStyle = gr; g.fill();
      g.beginPath();
      g.moveTo(L * 0.08, -L * 0.065);
      g.bezierCurveTo(L * 0.35, -L * 0.12, L * 0.6, -L * 0.07, L * 0.8, L * 0.03);
      g.strokeStyle = "rgba(255,225,205,.5)"; g.lineWidth = L * 0.022; g.lineCap = "round"; g.stroke();
      g.beginPath();
      g.moveTo(0, 0); g.quadraticCurveTo(-L * 0.12, -L * 0.02, -L * 0.17, -L * 0.15);
      g.strokeStyle = "#3f9a2c"; g.lineWidth = L * 0.045; g.stroke();
      g.beginPath(); g.ellipse(-L * 0.01, 0, L * 0.045, L * 0.105, 0, 0, TAU);
      g.fillStyle = "#2f7a22"; g.fill();
      g.restore();
    }

    /* ---------- state from progress ---------- */
    _state(p) {
      const burst = Math.pow(bell(seg(p, 0.47, 0.72)), 0.8);
      const fin = easeInOut(seg(p, 0.86, 1));
      const cook = seg(p, 0.28, 0.85);
      return {
        p,
        intro: easeOut(seg(p, 0, 0.2)),
        ign: easeOut(seg(p, 0.02, 0.12)),
        oil: seg(p, 0.1, 0.2),
        heat: seg(p, 0.05, 0.4),
        cook,
        sizzle: seg(p, 0.3, 0.4) * (1 - seg(p, 0.85, 0.95)),
        bubbles: seg(p, 0.22, 0.32) * (1 - seg(p, 0.84, 0.92)),
        burst,
        spice: seg(p, 0.7, 0.88),
        fin,
        panLift: -bell(seg(p, 0.48, 0.58)) * this.R * 0.11,
        tilt: -bell(seg(p, 0.48, 0.6)) * 0.07,
        light: clamp(burst * 0.9 + cook * 0.15 + fin * 0.3),
      };
    }

    /* ---------- loop ---------- */
    _loop(now) {
      requestAnimationFrame(this._loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.active) return;
      this.time += dt;
      const k = this.reduced ? 1 : 1 - Math.exp(-dt * 9);
      const prev = this.p;
      this.p += (this.target - this.p) * k;
      if (Math.abs(this.target - this.p) < 1e-4) this.p = this.target;
      const s = this._state(this.p);
      if (!this.reduced) this._update(dt, s);
      this._draw(s, this.p >= prev);
    }

    _draw(s, forward) {
      const g = this.g, { W, H, R, Ry, cx, cy, dpr } = this;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;

      // fon
      let gr = g.createRadialGradient(cx, cy - R * 0.2, 0, cx, cy, Math.max(W, H) * 0.8);
      gr.addColorStop(0, "#1d0806"); gr.addColorStop(0.5, "#0d0403"); gr.addColorStop(1, "#050202");
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);

      if (this.frames) {
        const img = this.frames.get(s.p);
        if (img) {
          const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
          const iw = img.naturalWidth * sc, ih = img.naturalHeight * sc;
          g.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
        }
        // kadr ustiga faqat uchqunlar va iliq yorug'lik
        g.globalCompositeOperation = "lighter";
        this._drawParts(g, ["spark"]);
        g.globalCompositeOperation = "source-over";
        this._finale(g, s);
        return;
      }

      // kamera
      const scale = lerp(0.84, 1, s.intro) * lerp(1, 1.6, s.fin);
      const shake = s.burst * R * 0.012;
      const ox = (Math.random() - 0.5) * shake, oy = (Math.random() - 0.5) * shake;
      const fy = cy - R * 0.1;
      g.translate(cx + ox, fy + oy);
      g.scale(scale, scale);
      g.translate(-cx, -fy + lerp(-H * 0.06, 0, s.intro));

      // plita yuzasi
      g.save();
      g.translate(cx, cy + this.wall + Ry * 0.7);
      g.scale(1, 0.38);
      gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 2.6);
      gr.addColorStop(0, "rgba(46,26,22,.95)"); gr.addColorStop(0.6, "rgba(22,12,10,.7)"); gr.addColorStop(1, "rgba(10,4,3,0)");
      g.fillStyle = gr; g.fillRect(-R * 2.7, -R * 2.7, R * 5.4, R * 5.4);
      g.restore();
      // gorelka panjarasi
      g.strokeStyle = "#0a0707"; g.lineWidth = R * 0.05;
      g.beginPath(); g.ellipse(cx, cy + this.wall + Ry * 0.62, R * 0.86, Ry * 0.62, 0, 0, TAU); g.stroke();

      // iliq yorug'lik (orqa)
      g.globalCompositeOperation = "lighter";
      gr = g.createRadialGradient(cx, cy - R * 0.35, 0, cx, cy - R * 0.35, R * 2.4);
      gr.addColorStop(0, `rgba(255,95,15,${0.06 + 0.45 * s.burst + 0.1 * s.cook + 0.1 * s.fin})`);
      gr.addColorStop(1, "rgba(255,40,0,0)");
      g.fillStyle = gr; g.fillRect(cx - R * 2.5, cy - R * 2.8, R * 5, R * 5);
      this._drawParts(g, ["blue"]);
      g.globalCompositeOperation = "source-over";

      // tova + ichidagilar (siltanish bilan birga harakatlanadi)
      const panY = cy + s.panLift;
      g.save();
      g.translate(cx, panY);
      g.rotate(s.tilt);
      g.translate(-cx, -panY);
      this._pan(g, cx, panY, s);
      g.restore();

      this._drawParts(g, ["bubble"]);
      g.globalCompositeOperation = "lighter";
      this._drawParts(g, ["fire"]);
      g.globalCompositeOperation = "source-over";

      // chipslar
      for (const c of this.chips) {
        const f = seg(s.p, c.fall, c.fall + 0.05);
        if (forward && c.prevF < 1 && f >= 1 && s.p < 0.5) {
          this._splash(cx + Math.cos(c.a) * c.rr * R * 0.86, panY + Math.sin(c.a) * c.rr * Ry * 0.86);
        }
        c.prevF = f;
        if (f <= 0) continue;
        const restX = cx + Math.cos(c.a) * c.rr * R * 0.84;
        const restY = panY + Math.sin(c.a) * c.rr * Ry * 0.84 - c.stack * R * 0.03 + Math.tan(s.tilt) * (restX - cx);
        const fe = easeIn(f);
        let x = lerp(restX + c.spin * R * 0.25, restX, fe);
        let y = lerp(cy - H * 0.75, restY, fe);
        let flipA = (1 - f) * c.spin * 2.4;
        let rot = c.rot + (1 - f) * c.spin;
        let sy = lerp(0.95, 0.42, f);
        const tt = seg(s.p, 0.5 + c.td, 0.64 + c.td);
        if (tt > 0 && tt < 1) {
          const b = bell(tt);
          y -= b * c.toss * R * 1.15;
          x += b * Math.cos(c.a) * R * 0.18;
          flipA += tt * TAU * Math.sign(c.spin);
          rot += tt * c.spin * 0.7;
          sy = lerp(0.42, 0.95, b);
        }
        const flip = Math.cos(flipA);
        const sgn = flip < 0 ? -1 : 1;
        const fy2 = sgn * Math.max(0.14, Math.abs(flip));
        const cookAmt = clamp(s.cook + c.bias - 0.09);
        const color = cookAmt < 0.6 ? mix(RAW, GOLD, cookAmt / 0.6) : mix(GOLD, SPICY, (cookAmt - 0.6) / 0.4 * 0.8);
        this._chip(g, x, y, c.size * R, rot, sy * fy2, color, s.spice, c.dots, s.light);
      }

      // butun qalampirlar
      for (const pp of this.peppers) {
        const f = seg(s.p, pp.start, pp.start + 0.05);
        if (f <= 0) continue;
        const rx = cx + Math.cos(pp.a) * pp.rr * R * 0.84;
        const ry = panY + Math.sin(pp.a) * pp.rr * Ry * 0.84 - R * 0.04;
        const x = lerp(rx - pp.spin * R * 0.2, rx, easeIn(f));
        const y = lerp(cy - H * 0.8, ry, easeIn(f));
        this._pepper(g, x, y, R * 0.5 * pp.s, pp.rot + (1 - f) * pp.spin, lerp(0.95, 0.5, f));
      }

      // chili parchalari
      for (const fl of this.flakes) {
        const f = seg(s.p, fl.start, fl.start + 0.07);
        if (f <= 0) continue;
        const rx = cx + Math.cos(fl.a) * fl.rr * R * 0.86;
        const ry = panY + Math.sin(fl.a) * fl.rr * Ry * 0.86 - R * 0.03;
        const x = rx + fl.drift * R * 0.5 * (1 - f);
        const y = lerp(cy - H * 0.85, ry, easeIn(f));
        const sz = R * 0.02 * fl.s;
        g.save();
        g.translate(x, y);
        g.scale(1, lerp(1, 0.5, f));
        g.rotate(fl.rot + (1 - f) * 8);
        g.fillStyle = rgb(fl.col);
        g.beginPath();
        g.moveTo(-sz, -sz * 0.4); g.lineTo(sz * 0.8, -sz * 0.6); g.lineTo(sz, sz * 0.5); g.lineTo(-sz * 0.6, sz * 0.6);
        g.closePath(); g.fill();
        g.restore();
      }

      this._drawParts(g, ["smoke", "dust"]);
      g.globalCompositeOperation = "lighter";
      this._drawParts(g, ["spark", "drop"]);
      g.globalCompositeOperation = "source-over";

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._finale(g, s);
    }

    // final: logotip uchun qorong'ilashtirish
    _finale(g, s) {
      if (s.fin <= 0) return;
      const { W, H } = this;
      const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, `rgba(40,4,0,${s.fin * 0.45})`);
      gr.addColorStop(1, `rgba(5,1,1,${s.fin * 0.85})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
  }

  window.MazzaaFilm = MazzaaFilm;
})();
