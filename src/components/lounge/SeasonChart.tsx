/**
 * The season's MMR after every change, with each division's band and start line
 * (competitive dashboard picks, 2026-10-20). Our own SVG: CascadeDS charts draw a
 * line but take no reference bands or fixed scale, which the division lines need
 * (on the CascadeDS fix list). Server-rendered; the numbers it shows are also in
 * the text summary for screen readers.
 */

import { divisionLook } from "@/lib/mmr/look";

export interface SeasonPoint { at: string; mmr: number }

const W = 880, H = 280, L = 52, R = 14, T = 14, B = 30;
const fmt = (n: number) => n.toLocaleString("en-US");

export function SeasonChart({ points, steps, peak }: { points: SeasonPoint[]; steps: { name: string; at: number }[]; peak: number | null }) {
  if (points.length < 2) return <p className="lounge-empty">The chart starts once there are two numbers this season.</p>;
  const values = points.map((p) => p.mmr);
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max(150, (hi - lo) * 0.12);
  const y0 = Math.max(0, Math.floor((lo - pad) / 500) * 500), y1 = Math.ceil((hi + pad) / 500) * 500;
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (m: number) => T + (1 - (m - y0) / (y1 - y0)) * (H - T - B);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.mmr).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;

  // Bands for the divisions the chart's range touches.
  const bands = steps
    .map((s, i) => ({ ...s, end: steps[i + 1]?.at ?? Infinity }))
    .filter((s) => s.end > y0 && s.at < y1)
    .map((s) => ({ ...s, from: Math.max(s.at, y0), to: Math.min(s.end, y1) }));

  // Ticks every 500 or 1,000, whichever gives four to six.
  const stepSize = (y1 - y0) / 500 > 6 ? 1000 : 500;
  const ticks: number[] = [];
  for (let v = Math.ceil(y0 / stepSize) * stepSize; v <= y1; v += stepSize) ticks.push(v);

  // Where the player moved into a higher division.
  const crossings: { i: number; name: string }[] = [];
  const divisionAt = (m: number) => [...steps].reverse().find((s) => m >= s.at)?.name ?? null;
  for (let i = 1; i < points.length; i++) {
    const a = divisionAt(points[i - 1].mmr), b = divisionAt(points[i].mmr);
    const ia = steps.findIndex((s) => s.name === a), ib = steps.findIndex((s) => s.name === b);
    if (b && ib > ia) crossings.push({ i, name: b });
  }
  // The latest move into each division (a player can dip under a line and cross it again), the last two shown.
  const latest = new Map<string, { i: number; name: string }>();
  for (const c of crossings) latest.set(c.name, c);
  const shown = [...latest.values()].sort((a, b) => a.i - b.i).slice(-2);
  const peakIndex = peak != null ? points.findIndex((p) => p.mmr === peak) : -1;
  const last = points.length - 1;
  const first = new Date(points[0].at), end = new Date(points[last].at);
  const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

  return (
    <figure className="lounge-chart" tabIndex={0} role="region" aria-label="Season chart (scrolls sideways on small screens)">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`MMR over the season, from ${fmt(points[0].mmr)} to ${fmt(points[last].mmr)}${peak != null ? `, peak ${fmt(peak)}` : ""}.`}>
        {bands.map((b) => {
          const look = divisionLook(b.name);
          return (
            <g key={b.name}>
              <rect x={L} y={y(b.to)} width={W - L - R} height={y(b.from) - y(b.to)} fill={look.c} opacity={0.12} />
              {b.at >= y0 && b.at <= y1 && <line x1={L} x2={W - R} y1={y(b.at)} y2={y(b.at)} stroke={look.c2} strokeDasharray="4 4" opacity={0.7} />}
            </g>
          );
        })}
        {ticks.map((t) => <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">{fmt(t)}</text>)}
        <text x={L} y={H - 8}>{day(first)}</text>
        <text x={W - R} y={H - 8} textAnchor="end">{day(end)}</text>
        <path d={area} className="lounge-chart__area" />
        <path d={line} className="lounge-chart__line" />
        {/* Division names over the line, each on a halo of the page color, so the line never cuts through a word. */}
        {bands.filter((b) => b.at >= y0 && b.at <= y1).map((b) => <text key={`t-${b.name}`} x={L + 6} y={y(b.at) - 6} className="lounge-chart__band">{b.name} · {fmt(b.at)}</text>)}
        {shown.map((c) => (
          <g key={`${c.i}-${c.name}`}>
            <circle cx={x(c.i)} cy={y(points[c.i].mmr)} r={5} fill={divisionLook(c.name).c2} stroke="#fff" strokeWidth={2} />
            <text x={x(c.i) - 8} y={y(points[c.i].mmr) + 20} textAnchor="end">Into {c.name}</text>
          </g>
        ))}
        {peakIndex >= 0 && (
          <g>
            <circle cx={x(peakIndex)} cy={y(peak!)} r={5} fill="#ffd25a" stroke="#fff" strokeWidth={2} />
            <text x={Math.min(x(peakIndex), W - R)} y={y(peak!) - 10} textAnchor={peakIndex > last * 0.7 ? "end" : "middle"}>Peak {fmt(peak!)}</text>
          </g>
        )}
      </svg>
    </figure>
  );
}
