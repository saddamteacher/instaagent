/* MAZZAA landing — scroll orkestratsiyasi */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);

  /* ---------- i18n ---------- */
  const dict = window.MAZZAA_I18N || {};
  let saved = null;
  try { saved = localStorage.getItem("mazzaa-lang"); } catch (e) { /* storage blocked */ }
  let lang = saved || ((navigator.language || "").toLowerCase().startsWith("ru") ? "ru" : "uz");
  if (!dict[lang]) lang = "uz";
  const t = (k) => (dict[lang] && dict[lang][k]) || (dict.uz && dict.uz[k]) || k;
  function applyLang(l) {
    lang = dict[l] ? l : "uz";
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$(".lang button").forEach((b) => b.classList.toggle("is-active", b.dataset.lang === lang));
    timerBtn && (timerBtn.textContent = running ? t("ch.stop") : t("ch.btn"));
    try { localStorage.setItem("mazzaa-lang", lang); } catch (e) { /* ignore */ }
    if (hasGsap) ScrollTrigger.refresh();
  }
  $$(".lang button").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang)));

  /* ---------- split title ---------- */
  $$("[data-split]").forEach((el) => {
    const txt = el.textContent.trim();
    el.textContent = "";
    [...txt].forEach((ch) => {
      const o = document.createElement("span");
      o.className = "ch";
      const i = document.createElement("span");
      i.textContent = ch;
      o.appendChild(i);
      el.appendChild(o);
    });
  });

  /* ---------- film ---------- */
  const film = new window.MazzaaFilm($("#filmCanvas"), { reduced });
  const chapters = $$(".chapter").map((el) => ({ el, from: +el.dataset.from, to: +el.dataset.to, center: el.classList.contains("chapter--center") }));
  const hudScene = $("#hudScene"), hudTc = $("#hudTc"), filmBar = $("#filmBar");
  const FILM_SECONDS = 40;

  function renderFilmUI(p) {
    film.setProgress(p);
    filmBar.style.width = (p * 100).toFixed(2) + "%";
    let scene = 1;
    chapters.forEach((c, i) => {
      const fade = 0.035;
      const a = clamp((p - c.from) / fade) * clamp((c.to - p) / fade);
      if (p >= c.from) scene = i + 1;
      c.el.style.opacity = a.toFixed(3);
      c.el.style.visibility = a > 0.001 ? "visible" : "hidden";
      const local = clamp((p - c.from) / (c.to - c.from));
      c.el.style.setProperty("--y", ((0.5 - local) * 60).toFixed(1) + "px");
      c.el.style.setProperty("--s", c.center ? (0.92 + local * 0.12).toFixed(3) : "1");
    });
    hudScene.textContent = String(scene).padStart(2, "0");
    const sec = p * FILM_SECONDS;
    const ff = Math.floor((sec % 1) * 24);
    hudTc.textContent = `00:${String(Math.floor(sec)).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
  }

  /* ---------- loader ---------- */
  const loader = $("#loader"), bar = $("#loaderBar"), pct = $("#loaderPct");
  const parts = { fonts: 0, logo: 0, frames: 0 };
  const setLoad = () => {
    const v = parts.fonts * 0.2 + parts.logo * 0.2 + parts.frames * 0.6;
    bar.style.width = (v * 100).toFixed(0) + "%";
    pct.textContent = Math.round(v * 100);
  };
  const fontsP = (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { parts.fonts = 1; setLoad(); });
  const logoP = new Promise((res) => {
    const im = new Image();
    im.onload = im.onerror = () => { parts.logo = 1; setLoad(); res(); };
    im.src = "assets/logo.webp";
  });
  const framesP = film.loadFrames("assets/frames/manifest.json", (v) => { parts.frames = v; setLoad(); })
    .then((ok) => {
      parts.frames = 1; setLoad();
      document.body.dataset.film = ok ? "frames" : "procedural";
      // Video rejimida 5 sahna teng bo'lingan (har biri 1/5) — matnlarni shunga moslaymiz.
      if (ok) chapters.forEach((c, i, all) => {
        c.from = i / all.length + (i ? 0.012 : 0);
        c.to = i === all.length - 1 ? 1.01 : (i + 1) / all.length - 0.012;
      });
    });
  const minTime = new Promise((r) => setTimeout(r, reduced ? 0 : 1100));
  const timeout = new Promise((r) => setTimeout(r, 7000));

  Promise.race([Promise.all([fontsP, logoP, framesP, minTime]), timeout]).then(start);

  /* ---------- main ---------- */
  let lenis = null;
  function start() {
    loader.classList.add("is-done");
    document.body.classList.remove("is-loading");
    applyLang(lang);
    $("#year").textContent = new Date().getFullYear();

    if (!hasGsap) {
      // Kutubxonalar yuklanmasa ham sahifa ishlasin
      $$(".reveal-up, .split .ch > span").forEach((el) => { el.style.opacity = 1; el.style.transform = "none"; });
      const filmEl = $("#film");
      const onScroll = () => {
        const r = filmEl.getBoundingClientRect();
        renderFilmUI(clamp(-r.top / (r.height - innerHeight)));
      };
      addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    if (!reduced && window.Lenis) {
      lenis = new Lenis({ duration: 1.15, easing: (x) => 1 - Math.pow(1 - x, 4), smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (id.length < 2) return;
        const target = $(id);
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: 0, duration: 1.6 });
      }));
    }

    // Hero intro
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.to(".split .ch > span", { y: 0, duration: 1.3, stagger: 0.06 })
      .to(".hero .reveal-up", { opacity: 1, y: 0, duration: 1, stagger: 0.12 }, "-=1.0")
      .from("#heroDisc", { scale: 0.6, opacity: 0, rotate: -40, duration: 1.6 }, 0.1);

    // Hero disc scroll-out
    gsap.to("#heroDisc", {
      yPercent: 45, scale: 0.7, rotate: 35, opacity: 0.2, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
    gsap.to(".hero__content", {
      yPercent: -30, opacity: 0, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "20% top", end: "bottom top", scrub: true },
    });

    // Film
    ScrollTrigger.create({
      trigger: "#film", start: "top top", end: "bottom bottom", scrub: true,
      onUpdate: (st) => renderFilmUI(st.progress),
    });
    ScrollTrigger.create({
      trigger: "#film", start: "top bottom", end: "bottom top",
      onToggle: (st) => { film.active = st.isActive; },
    });
    film.active = false;
    renderFilmUI(0);
    film.active = ScrollTrigger.isInViewport($("#film"));

    // Section reveals
    $$("section:not(.hero) .reveal-up").forEach((el) => {
      gsap.to(el, { opacity: 1, y: 0, duration: 1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 88%" } });
    });

    // Heat meter
    const levels = $$(".meter__levels li"), num = $("#heatNum");
    ScrollTrigger.create({
      trigger: "#heat", start: "top 70%", end: "bottom 80%", scrub: 0.6,
      onUpdate: (st) => {
        const v = st.progress;
        $("#meterFill").style.width = v * 100 + "%";
        $("#meterFlame").style.left = v * 100 + "%";
        num.textContent = Math.round(v * 100);
        levels.forEach((li, i) => li.classList.toggle("is-lit", v >= (i + 0.5) / levels.length));
      },
    });

    // Cards
    gsap.from(".card", {
      y: 80, opacity: 0, rotateX: -18, duration: 1.2, stagger: 0.15, ease: "expo.out",
      scrollTrigger: { trigger: ".cards", start: "top 85%" },
    });

    // Challenge
    gsap.fromTo("#orbit", { rotate: -40 }, { rotate: 60, ease: "none", scrollTrigger: { trigger: "#challenge", start: "top bottom", end: "bottom top", scrub: true } });
    gsap.fromTo("#challengeLogo", { rotate: -25, scale: 0.8 }, { rotate: 15, scale: 1, ease: "none", scrollTrigger: { trigger: "#challenge", start: "top bottom", end: "center center", scrub: true } });
    gsap.from(".challenge__text > *", { y: 40, opacity: 0, stagger: 0.1, duration: 1, ease: "expo.out", scrollTrigger: { trigger: ".challenge__text", start: "top 80%" } });

    // CTA
    gsap.from(".cta__title", { scale: 0.85, opacity: 0, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: ".cta", start: "top 75%" } });

    // Nav
    const nav = $("#nav");
    let lastY = 0;
    ScrollTrigger.create({
      start: 0, end: "max",
      onUpdate: (st) => {
        const y = st.scroll();
        nav.classList.toggle("is-solid", y > 40);
        nav.classList.toggle("is-hidden", y > 400 && y > lastY + 2);
        if (y < lastY - 2) nav.classList.remove("is-hidden");
        lastY = y;
        sparks.boost = Math.min(3, Math.abs(st.getVelocity()) / 1500);
      },
    });
  }

  /* ---------- tilt cards ---------- */
  $$("[data-tilt]").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.transform = `rotateY(${(x - 0.5) * 14}deg) rotateX(${(0.5 - y) * 14}deg)`;
      card.style.setProperty("--mx", x * 100 + "%");
      card.style.setProperty("--my", y * 100 + "%");
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
  });

  /* ---------- challenge timer ---------- */
  const timerBtn = $("#timerBtn"), timerVal = $("#timerVal"), timerBox = $("#timer");
  let running = false, timerId = 0, left = 60;
  timerBtn.addEventListener("click", () => {
    if (running) {
      clearInterval(timerId); running = false; left = 60; timerVal.textContent = left;
      timerBox.classList.remove("is-running"); timerBtn.textContent = t("ch.btn");
      return;
    }
    running = true; left = 60; timerBox.classList.add("is-running"); timerBtn.textContent = t("ch.stop");
    timerId = setInterval(() => {
      left -= 1;
      timerVal.textContent = left;
      if (left <= 0) {
        clearInterval(timerId); running = false; timerBox.classList.remove("is-running");
        timerVal.textContent = "🔥"; timerBtn.textContent = t("ch.win");
        setTimeout(() => { timerVal.textContent = 60; timerBtn.textContent = t("ch.btn"); }, 4000);
      }
    }, 1000);
  });

  /* ---------- cursor ---------- */
  const cursor = $("#cursor");
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !reduced) {
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; cursor.classList.add("is-on"); sparks.mouse(tx, ty); });
    document.addEventListener("pointerleave", () => cursor.classList.remove("is-on"));
    $$("a, button, [data-tilt]").forEach((el) => {
      el.addEventListener("pointerenter", () => cursor.classList.add("is-hover"));
      el.addEventListener("pointerleave", () => cursor.classList.remove("is-hover"));
    });
    (function follow() {
      cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      requestAnimationFrame(follow);
    })();
  }

  /* ---------- global embers ---------- */
  const sparks = (function () {
    const c = $("#sparks"), g = c.getContext("2d");
    let W = 0, H = 0, dpr = 1;
    const ps = [];
    const api = { boost: 0, mouse: () => {} };
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = innerWidth; H = innerHeight;
      c.width = W * dpr; c.height = H * dpr;
    }
    resize();
    addEventListener("resize", resize);
    if (reduced) return api;
    const add = (x, y, burst) => ps.push({
      x, y, vx: (Math.random() - 0.5) * (burst ? 120 : 30), vy: -(70 + Math.random() * (burst ? 160 : 170)),
      life: 2 + Math.random() * 3, age: 0, s: 0.8 + Math.random() * 1.8, seed: Math.random() * 10,
    });
    let lastM = 0;
    api.mouse = (x, y) => {
      const now = performance.now();
      if (now - lastM > 40) { lastM = now; add(x, y, true); }
    };
    let last = performance.now(), acc = 0;
    (function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt * (7 + api.boost * 40);
      while (acc >= 1 && ps.length < 220) { acc -= 1; add(Math.random() * W, H + 10, false); }
      api.boost *= 0.95;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.age += dt;
        if (p.age > p.life || p.y < -20) { ps.splice(i, 1); continue; }
        p.vx += Math.sin(now / 600 + p.seed) * 20 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const f = p.age / p.life;
        const a = Math.sin(Math.PI * f) * 0.9;
        const r = p.s * (1 + Math.sin(now / 90 + p.seed) * 0.25);
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
        gr.addColorStop(0, `rgba(255,230,150,${a})`);
        gr.addColorStop(0.3, `rgba(255,120,20,${a * 0.6})`);
        gr.addColorStop(1, "rgba(255,40,0,0)");
        g.fillStyle = gr;
        g.fillRect(p.x - r * 4, p.y - r * 4, r * 8, r * 8);
      }
    })(last);
    return api;
  })();
})();
