"use client";

import { Chip } from "@empac/cascadeds";
import { NIGHT_GAMES, NIGHT_MAX_GAMES } from "@/lib/nights/games";
import { GameChipIcon } from "@/components/games/GameCover";

/**
 * "Anything else tonight?" in a live night's start modal. The first game is
 * the one being set up; the rest come after, in whatever order the host
 * picks (or spins for) during the night. One scoreboard covers them all.
 */
export function NightLineupPicker({ first, value, onChange }: { first: string; value: string[]; onChange: (next: string[]) => void }) {
  const others = NIGHT_GAMES.filter((g) => g.slug !== first);
  const toggle = (slug: string) => onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug].slice(0, NIGHT_MAX_GAMES - 1));
  return (
    <div className="night-lineup">
      <span className="party-options__label">Playing anything else tonight?</span>
      <div className="party-chips">
        {others.map((g) => {
          const on = value.includes(g.slug);
          return <Chip key={g.slug} clickable selected={on} variant={on ? "primary" : "default"} label={g.short} icon={<GameChipIcon slug={g.slug} name={g.label} />} onClick={() => toggle(g.slug)} />;
        })}
      </div>
      <p className="party-muted">
        {value.length
          ? `One scoreboard for all ${value.length + 1} games: 10, 6, 3 and 1 points for the top four in each, plus missions. Most points is the night's MVP.`
          : "Add games and the night keeps one scoreboard across all of them. You can add more later."}
      </p>
    </div>
  );
}
