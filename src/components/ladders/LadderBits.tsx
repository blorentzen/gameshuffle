/**
 * Small pieces of the ladder pages (server-rendered): the last 10 as squares, a change with its sign, and a player's
 * season as a line of MMR after each table.
 */

import { signed } from "@/lib/ladders/rules";

export function LastTen({ deltas }: { deltas: number[] }) {
  if (!deltas.length) return <span className="ladder-muted">None yet</span>;
  const gains = deltas.filter((d) => d > 0).length;
  return (
    <span className="ladder-sq" role="img" aria-label={`Last ${deltas.length}: ${gains} up, ${deltas.length - gains} down`}>
      {[...deltas].reverse().map((d, i) => <i key={i} className={d > 0 ? "is-up" : d < 0 ? "is-down" : undefined} />)}
    </span>
  );
}

export function Delta({ n }: { n: number }) {
  return <span className={n > 0 ? "lounge-up" : n < 0 ? "lounge-down" : undefined}>{signed(n)}</span>;
}

/** MMR after each table, oldest first (n: the table's count, 0 the start, negative a penalty or bonus, unlabelled).
 *  Never narrower than 640 units so labels stay 12px; scrolls sideways on phones. */
export function LadderChart({ points, label }: { points: { n: number; mmr: number }[]; label: string }) {
  if (points.length < 2) return null;
  const W = 720, H = 240, L = 56, R = 16, T = 16, B = 32;
  const lo = Math.min(...points.map((p) => p.mmr)), hi = Math.max(...points.map((p) => p.mmr));
  const pad = Math.max(50, (hi - lo) * 0.1);
  const y0 = lo - pad, y1 = hi + pad;
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.mmr).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - B} L${L},${H - B} Z`;
  const ticks = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1].map((v) => Math.round(v / 10) * 10);
  const every = Math.max(1, Math.ceil(points.length / 8));
  return (
    <figure className="ladder-chart" tabIndex={0} aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="ladder-chart__grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end">{t.toLocaleString("en-US")}</text>
          </g>
        ))}
        <path className="ladder-chart__area" d={area} />
        <path className="ladder-chart__line" d={line} />
        {points.map((p, i) => ((i % every === 0 || i === points.length - 1) && p.n >= 0 ? <text key={i} x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : "middle"}>{p.n === 0 ? "Start" : p.n.toLocaleString("en-US")}</text> : null))}
        <circle className="ladder-chart__dot" cx={x(points.length - 1)} cy={y(points[points.length - 1].mmr)} r={5} />
      </svg>
    </figure>
  );
}

const monthYear = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/Los_Angeles" }) : null);

/** The Season menu's choices, newest first: "Season 8 (this season)", "Season 7 · Feb 2024 to Sep 2025". */
export function seasonOptions(seasons: { season: number; startedAt: string | null; endedAt: string | null; current: boolean }[]): { value: string; label: string }[] {
  return seasons.map((s) => {
    const from = monthYear(s.startedAt), to = monthYear(s.endedAt);
    const dates = s.current ? "this season" : from && to ? `${from} to ${to}` : from ? `from ${from}` : null;
    return { value: String(s.season), label: dates ? (s.current ? `Season ${s.season} (${dates})` : `Season ${s.season} · ${dates}`) : `Season ${s.season}` };
  });
}

/** "Sep 28, 2025" in Pacific. */
export const longDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) : "");
