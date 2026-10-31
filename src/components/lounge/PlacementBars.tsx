/**
 * Free-for-all placements as bars, 1st on the left. Our own markup: CascadeDS BarChart
 * draws no axes (it wraps them in a Fragment, which the chart library skips; on the
 * CascadeDS fix list), and a placement chart needs the place under each bar.
 */

import { placeWord } from "@/lib/mmr/rules";

export function PlacementBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="lounge-bars" tabIndex={0} role="region" aria-label="Free-for-all places">
      <ol className="lounge-bars__list" aria-label="Free-for-all events by place">
        {counts.map((n, i) => (
          <li key={i} className="lounge-bars__col">
            <span className="lounge-bars__n">{n || ""}</span>
            <span className="lounge-bars__bar" style={{ height: `${Math.round((n / max) * 100)}%` }} aria-hidden="true" />
            <span className="lounge-bars__place">{i + 1}</span>
            <span className="sr-only">{placeWord(i + 1)}: {n} {n === 1 ? "event" : "events"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
