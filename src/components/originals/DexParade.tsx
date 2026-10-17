"use client";

/**
 * The Daily Dex before the first guess: two lanes of Pokémon drifting past,
 * like the Daily Shuffle's parade (DailyParade.tsx) but as type tiles and
 * names, since the Dex shows no Pokémon art. Decoration only (hidden from
 * screen readers), shuffled in the browser on each visit so it can't hint at
 * the answer, and still with reduced motion (randomizer.css).
 */

import { useEffect, useState } from "react";
import { TypeTile } from "@/components/pokemon/TypeCard";

const PER_LANE = 14;

type Mon = { name: string; types?: string[] };

export function DexParade({ names }: { names: Mon[] }) {
  const [lanes, setLanes] = useState<Mon[][] | null>(null);
  useEffect(() => {
    const list = [...names];
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    void Promise.resolve().then(() => setLanes([list.slice(0, PER_LANE), list.slice(PER_LANE, PER_LANE * 2)]));
  }, [names]);
  if (!lanes) return <div className="daily-parade dex-parade" aria-hidden />;
  return (
    <div className="daily-parade dex-parade" aria-hidden>
      {lanes.map((lane, i) => (
        <div key={i} className={`daily-parade__lane${i === 1 ? " daily-parade__lane--back" : ""}`}>
          {/* Three times over, so a wide screen never sees the end and the loop has no seam. */}
          {[...lane, ...lane, ...lane].map((m, j) => (
            <span key={`${m.name}-${j}`} className="dex-parade__mon">
              <TypeTile types={m.types ?? []} size={i === 1 ? "small" : "medium"} />
              <span className="dex-parade__name">{m.name}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
