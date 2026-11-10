"use client";

/**
 * After the last daily of the day (dailies + explore picks 2026-11-05, 5A and 8A): who you beat among the people you
 * follow and who's left to beat, then three picks by your interests (one starts a night with friends in one tap).
 * Signed out: the most played picks. Shown on each daily's end screen once every daily is done; never in the Discord
 * Activity (it keeps its own Next up).
 */

import { useEffect, useState } from "react";
import { IconClock, IconTrophy } from "@tabler/icons-react";
import { useDailies } from "@/components/originals/Dailies";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { HappeningCard } from "@/components/home/HappeningBand";
import { useQuickStart } from "@/components/home/QuickStart";
import type { DailiesId } from "@/lib/originals/dailies";
import type { Pick } from "@/lib/home/nextPicks";
import "@/styles/happening.css";
import "@/styles/home-today.css";

/** Minutes to midnight Pacific, as "6h 12m". */
function untilMidnight(): string {
  const now = new Date();
  const pt = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const ms = (24 * 60 - (pt.getHours() * 60 + pt.getMinutes())) * 60_000;
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function DailiesAfter({ current }: { current: Exclude<DailiesId, "weekly"> }) {
  const { activity } = useOriginalsHost();
  const { shown, entries, signedIn } = useDailies(current);
  // Waits for the server (signedIn null until it answers) so a half-loaded list never looks "all done".
  // Your dailies (choose your dailies, 2026-11-09: your picks and the one you're on; the Weekly isn't a daily, and
  // signed out it can't be played).
  const dailies = shown.filter((id) => id !== "weekly");
  const allDone = signedIn !== null && dailies.length >= 1 && dailies.every((id) => entries[id]?.state === "done");
  const [data, setData] = useState<{ beat: string | null; picks: Pick[] } | null>(null);
  const [left, setLeft] = useState<string | null>(null);
  const { start, window: startWindow } = useQuickStart(`after-${current}`);

  useEffect(() => {
    if (!allDone || activity) return;
    let stop = false;
    fetch(`/api/dailies/after?game=${current}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!stop && j) setData(j); }).catch(() => {});
    const tick = () => setLeft(untilMidnight());
    const t0 = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 60_000);
    return () => { stop = true; window.clearTimeout(t0); window.clearInterval(t); };
  }, [allDone, activity, current]);

  if (!allDone || activity || !data) return null;
  return (
    <section className="dailies-after" aria-labelledby="dailies-after-title">
      {data.beat && <p className="dailies-after__beat"><IconTrophy size={20} stroke={2} aria-hidden="true" />{data.beat}</p>}
      <h2 id="dailies-after-title" className="dailies-after__title">That&apos;s your dailies done</h2>
      {data.picks.length > 0 && (
        <ul className={`band__row band__row--${data.picks.length} dailies-after__picks`}>
          {data.picks.map((p, k) => (
            <li key={p.id}><HappeningCard h={p} from={`after-${current}`} k={k} track="next" onPress={p.start ? () => start(p.start!) : undefined} /></li>
          ))}
        </ul>
      )}
      {left && <p className="dailies-after__next"><IconClock size={16} stroke={2} aria-hidden="true" />New dailies in {left}</p>}
      {startWindow}
    </section>
  );
}
