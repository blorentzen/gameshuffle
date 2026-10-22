/**
 * Every season of a lounge career side by side on one scale (lounge page picks, 2026-10-20), each
 * season with its own division lines, because the lines moved between seasons (MK World's Diamond
 * started at 11,000 in season 1, 12,000 in season 2 and 12,500 in season 3). Our own SVG like the
 * season chart: CascadeDS charts take no reference lines. The drawing never gets narrower than its
 * own width in pixels, so its labels stay 12px; it scrolls sideways on phones.
 */

import { divisionLook } from "@/lib/mmr/look";
import type { CareerSeason } from "@/lib/lounge/season";

const H = 280, L = 56, R = 12, T = 16, B = 36, PANEL = 150;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function CareerChart({ seasons }: { seasons: CareerSeason[] }) {
  const shown = seasons.filter((s) => s.played && s.series.length > 0);
  if (!shown.length) return null;
  const W = Math.max(880, L + R + shown.length * PANEL);
  const all = shown.flatMap((s) => s.series);
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = Math.max(200, (hi - lo) * 0.08);
  const y0 = Math.max(0, Math.floor((lo - pad) / 500) * 500), y1 = Math.ceil((hi + pad) / 500) * 500;
  const y = (m: number) => T + (1 - (m - y0) / (y1 - y0)) * (H - T - B);
  const span = (W - L - R) / shown.length;
  const tickStep = [500, 1000, 2000, 2500, 5000].find((s) => (y1 - y0) / s <= 6) ?? 5000;
  const ticks: number[] = [];
  for (let v = Math.ceil(y0 / tickStep) * tickStep; v <= y1; v += tickStep) ticks.push(v);
  const best = Math.max(...shown.map((s) => s.maxMmr ?? Math.max(...s.series)));
  const label = `MMR across ${shown.length} ${shown.length === 1 ? "season" : "seasons"}: from ${fmt(shown[0].series[0])} in season ${shown[0].season} to ${fmt(shown[shown.length - 1].series[shown[shown.length - 1].series.length - 1])} in season ${shown[shown.length - 1].season}, best peak ${fmt(best)}.`;

  return (
    <figure className="lounge-chart lounge-chart--career" tabIndex={0} role="region" aria-label="Career chart (scrolls sideways on small screens)">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} role="img" aria-label={label}>
        {shown.map((s, i) => {
          const x0 = L + i * span, x1 = x0 + span;
          const smin = Math.min(...s.series), smax = Math.max(...s.series);
          // This season's lines near where the player was that season, at most three, labels kept apart.
          const lines = s.steps
            .filter((st) => st.at > y0 && st.at < y1 && st.at >= smin - 800 && st.at <= smax + 800)
            .sort((a, b) => Math.abs(a.at - (smin + smax) / 2) - Math.abs(b.at - (smin + smax) / 2))
            .slice(0, 3)
            .sort((a, b) => b.at - a.at);
          let lastLabelY = -Infinity;
          const x = (k: number) => x0 + 10 + (s.series.length === 1 ? (span - 20) / 2 : (k / (s.series.length - 1)) * (span - 20));
          const d = s.series.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
          return (
            <g key={s.season}>
              <rect x={x0} y={T} width={span} height={H - T - B} className={i % 2 ? "lounge-chart__panel--alt" : "lounge-chart__panel"} />
              {lines.map((st) => <line key={st.name} x1={x0} x2={x1} y1={y(st.at)} y2={y(st.at)} stroke={divisionLook(st.name).c2} strokeDasharray="4 4" opacity={0.75} />)}
              <path d={d} className="lounge-chart__line" />
              {/* Names over the line, on a halo, kept apart from each other. */}
              {lines.map((st) => {
                const ly = y(st.at);
                if (ly - lastLabelY < 18) return null;
                lastLabelY = ly;
                return <text key={`t-${st.name}`} x={x0 + 6} y={ly - 5} className="lounge-chart__band">{st.name}</text>;
              })}
              <text x={x0 + span / 2} y={H - 12} textAnchor="middle" className="lounge-chart__season">Season {s.season}{s.current ? " (now)" : ""}</text>
            </g>
          );
        })}
        {ticks.map((t) => <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">{fmt(t)}</text>)}
      </svg>
    </figure>
  );
}
