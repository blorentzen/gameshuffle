"use client";

/**
 * The lead after every race on the war page: one line around a level line, the side ahead named on the axis, a
 * gold mark where the war was out of reach. Our own SVG (CascadeDS charts take no zero line or fixed scale; on the
 * CascadeDS fix list). Hover, tap or the arrow keys read out a race; the race list below is the table view.
 * Labels stay 12px: the drawing never goes narrower than its own 720 units and scrolls sideways on phones.
 */

import { useState, type KeyboardEvent, type PointerEvent } from "react";

export interface LeadPoint { n: number; lead: number; diff: number; code: string | null }

const W = 720, H = 240, L = 76, R = 18, T = 18, B = 34;
const STEPS = [10, 20, 25, 50, 100, 150, 200, 250];

export function WarLeadChart({ points, racesTotal, usTag, themTag, decidedAt }: { points: LeadPoint[]; racesTotal: number; usTag: string; themTag: string; decidedAt: number | null }) {
  const [active, setActive] = useState<number | null>(null);
  // Each side of the level line goes as far as that team's biggest lead, and at least one step, so a war one team
  // led all the way doesn't spend half the chart on empty space.
  const hiLead = Math.max(0, ...points.map((p) => p.lead));
  const loLead = Math.max(0, ...points.map((p) => -p.lead));
  const step = STEPS.find((s) => Math.max(1, Math.ceil(hiLead / s)) + Math.max(1, Math.ceil(loLead / s)) <= 5) ?? 500;
  const top = Math.max(1, Math.ceil(hiLead / step)) * step;
  const bottom = Math.max(1, Math.ceil(loLead / step)) * step;
  const x = (n: number) => L + (n / racesTotal) * (W - L - R);
  const y = (v: number) => T + ((top - v) / (top + bottom)) * (H - T - B);
  const ticks: number[] = [];
  for (let v = -bottom; v <= top; v += step) ticks.push(v);
  const all = [{ n: 0, lead: 0, diff: 0, code: null }, ...points];
  const line = all.map((p, i) => `${i ? "L" : "M"}${x(p.n).toFixed(1)} ${y(p.lead).toFixed(1)}`).join(" ");
  const last = all[all.length - 1];
  const area = `${line} L${x(last.n).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const every = racesTotal > 12 ? 2 : 1;
  const tickLabel = (v: number) => (v === 0 ? "Level" : `${v > 0 ? usTag : themTag} +${Math.abs(v)}`);
  const leadText = (v: number) => (v === 0 ? "Level" : `${v > 0 ? usTag : themTag} by ${Math.abs(v)}`);
  const raceText = (d: number) => (d === 0 ? "Even race" : `${d > 0 ? usTag : themTag} +${Math.abs(d)}`);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!points.length) return;
    const box = e.currentTarget.getBoundingClientRect();
    const ux = ((e.clientX - box.left) / box.width) * W;
    const n = Math.round(((ux - L) / (W - L - R)) * racesTotal);
    const near = points.reduce((best, p) => (Math.abs(p.n - n) < Math.abs(best.n - n) ? p : best), points[0]);
    setActive(near.n);
  };
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!points.length) return;
    const i = points.findIndex((p) => p.n === active);
    if (e.key === "ArrowRight") setActive(points[Math.min(points.length - 1, i < 0 ? 0 : i + 1)].n);
    else if (e.key === "ArrowLeft") setActive(points[Math.max(0, i < 0 ? points.length - 1 : i - 1)].n);
    else if (e.key === "Home") setActive(points[0].n);
    else if (e.key === "End") setActive(points[points.length - 1].n);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const on = points.find((p) => p.n === active) ?? null;
  const decided = decidedAt != null ? points.find((p) => p.n === decidedAt) ?? null : null;
  const summary = points.length
    ? `The lead after each of ${points.length} races, from level to ${leadText(last.lead)}${decided ? `, out of reach after race ${decided.n}` : ""}.`
    : "No races yet.";

  return (
    <figure className="wp-chart" tabIndex={0} role="group" aria-label="The lead, race by race. Use the arrow keys to read each race." onKeyDown={onKey} onBlur={() => setActive(null)}>
      <div className="wp-chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? "wp-chart__zero" : "wp-chart__grid"} />
              <text x={L - 10} y={y(v) + 4} textAnchor="end">{tickLabel(v)}</text>
            </g>
          ))}
          {Array.from({ length: racesTotal }, (_, i) => i + 1).filter((n) => n % every === 0 || n === 1).map((n) => (
            <text key={n} x={x(n)} y={H - 10} textAnchor="middle">{n}</text>
          ))}
          {on && <line x1={x(on.n)} x2={x(on.n)} y1={T} y2={H - B} className="wp-chart__cross" />}
          <path d={area} className="wp-chart__area" />
          <path d={line} className="wp-chart__line" />
          {points.map((p) => <circle key={p.n} cx={x(p.n)} cy={y(p.lead)} r={p.n === active ? 6 : 4} className="wp-chart__dot" />)}
          {decided && (
            <g>
              <circle cx={x(decided.n)} cy={y(decided.lead)} r={7} className="wp-chart__gold" />
              <text x={Math.min(x(decided.n), W - R)} y={decided.lead >= 0 ? y(decided.lead) - 14 : y(decided.lead) + 24} textAnchor={decided.n > racesTotal * 0.75 ? "end" : "middle"} className="wp-chart__gold-label">Can&apos;t be caught</text>
            </g>
          )}
        </svg>
        {on && (
          <div className={`wp-chart__tip${on.n > racesTotal * 0.7 ? " wp-chart__tip--left" : on.n < racesTotal * 0.25 ? " wp-chart__tip--right" : ""}`} style={{ left: `${(x(on.n) / W) * 100}%`, top: `${(y(on.lead) / H) * 100}%` }} aria-hidden="true">
            <b>Race {on.n}{on.code ? ` · ${on.code}` : ""}</b>
            <span>{raceText(on.diff)}</span>
            <span>Lead: {leadText(on.lead)}</span>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{on ? `Race ${on.n}${on.code ? `, ${on.code}` : ""}: ${raceText(on.diff)}, lead ${leadText(on.lead)}.` : ""}</p>
    </figure>
  );
}
