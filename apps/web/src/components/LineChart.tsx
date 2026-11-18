"use client";

import { useId, useRef, useState } from "react";
import { fmtNum } from "@/lib/i18n";

export interface Point {
  /** ISO vaqt */
  t: string;
  v: number;
  /** Serverda formatlangan sana (Toshkent vaqti) */
  label: string;
}

const W = 460;
const H = 200;
const PAD = { l: 46, r: 52, t: 14, b: 26 };

const compact = (v: number) => (Math.abs(v) >= 1e6 ? `${fmtNum(v / 1e6)}M` : Math.abs(v) >= 1e4 ? `${fmtNum(v / 1e3)}K` : fmtNum(v));

function niceTicks(min: number, max: number, n = 4) {
  if (min === max) {
    const d = Math.max(1, Math.abs(min) * 0.1);
    min -= d;
    max += d;
  }
  const raw = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/**
 * Bitta seriyali chiziqli grafik (dataviz qoidalari): 2px chiziq, xira to'r, yakuniy qiymat yorlig'i,
 * kursor (crosshair) + tooltip sichqoncha va klaviaturada, jadval ko'rinishi. Legend yo'q — sarlavha seriyani nomlaydi.
 */
export function LineChart({
  title,
  points,
  unit = "",
}: {
  title: string;
  points: Point[];
  unit?: string;
}) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2)
    return (
      <figure className="chart">
        <figcaption className="chart-title">{title}</figcaption>
        <div className="empty">Grafik uchun kamida 2 ta o'lchov kerak.</div>
      </figure>
    );

  const ts = points.map((p) => new Date(p.t).getTime());
  const t0 = ts[0]!;
  const t1 = ts.at(-1)!;
  const vals = points.map((p) => p.v);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
  const y0 = ticks[0]!;
  const y1 = ticks.at(-1)!;
  const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - y0) / Math.max(1e-9, y1 - y0)) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(ts[i]!).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = points.at(-1)!;
  const xTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  const pick = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < ts.length; i++) if (Math.abs(x(ts[i]!) - sx) < Math.abs(x(ts[best]!) - sx)) best = i;
    setHover(best);
  };
  const h = hover !== null ? points[hover]! : null;
  const hx = hover !== null ? x(ts[hover]!) : 0;

  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <div className="chart-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={`${id}-desc`}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(points.length - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? points.length) - 1));
            if (e.key === "ArrowRight") setHover((v) => Math.min(points.length - 1, (v ?? -1) + 1));
          }}
        >
          <desc id={`${id}-desc`}>
            {title}: {points[0]!.label} — {compact(points[0]!.v)}
            {unit}, {last.label} — {compact(last.v)}
            {unit}
          </desc>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="chart-grid" />
              <text x={PAD.l - 8} y={y(v)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                {compact(v)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(ts[i]!)} y={H - 8} className="chart-axis" textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>
              {points[i]!.label}
            </text>
          ))}
          <path d={d} className="chart-line" />
          <circle cx={x(t1)} cy={y(last.v)} r={4} className="chart-dot" />
          <text x={x(t1) + 8} y={y(last.v)} className="chart-end" dominantBaseline="middle">
            {compact(last.v)}
            {unit}
          </text>
          {h && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={PAD.t} y2={H - PAD.b} className="chart-cross" />
              <circle cx={hx} cy={y(h.v)} r={5} className="chart-dot ring" />
            </g>
          )}
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent" />
        </svg>
        {h && (
          <div className="chart-tip" style={{ left: `${Math.min(86, Math.max(14, (hx / W) * 100))}%` }} role="status">
            <b>
              {compact(h.v)}
              {unit}
            </b>
            <span>{h.label}</span>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Jadval ko'rinishi</summary>
        <table>
          <thead>
            <tr>
              <th>Sana</th>
              <th>{title}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.t}>
                <td>{p.label}</td>
                <td>
                  {fmtNum(p.v, 2)}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
