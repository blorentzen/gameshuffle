import { Badge, Chip, Progress } from "@empac/cascadeds";
import { nightGame } from "@/lib/nights/games";
import { rankVariant, seasonLabel, nextRank } from "@/lib/seasons/ranks";
import type { UserSeason } from "@/lib/seasons/store";

/**
 * A profile's Season tab: this month's points per game, rank, and roster
 * races (win with every fighter, character or board you own).
 */
export function SeasonPanel({ seasonKey, season }: { seasonKey: string; season: UserSeason }) {
  const next = nextRank(season.points);
  return (
    <div className="season-panel">
      <div className="season-panel__head">
        <div>
          <p className="party-options__label">{seasonLabel(seasonKey)}</p>
          <p className="season-panel__points"><strong>{season.points}</strong> season points</p>
        </div>
        <Badge variant={rankVariant(season.rank.id)}>{season.rank.label}</Badge>
      </div>
      {next && <p className="party-muted">{next.needed} point{next.needed === 1 ? "" : "s"} to {next.rank.label}</p>}
      {season.games.length > 0 && (
        <ul className="season-panel__games">
          {season.games.map((g) => <li key={g.gameSlug}><span>{nightGame(g.gameSlug)?.label ?? g.gameSlug}</span><span>{g.points}</span></li>)}
        </ul>
      )}
      {season.rosters.map((r) => (
        <section key={`${r.gameSlug}-${r.kind}`} className="season-panel__roster">
          <h3 className="party-h3">Roster race: {r.label}</h3>
          <p className="party-muted">Won with {r.won.length} of {r.pool.length}{r.kind === "boards" ? " boards" : ""} this season. Only what they own counts.</p>
          <Progress value={r.won.length} max={Math.max(1, r.pool.length)} size="small" />
          <div className="party-chips season-panel__chips">
            {r.pool.map((n) => { const won = r.won.includes(n); return <Chip key={n} size="small" selected={won} variant={won ? "primary" : "default"} label={n} />; })}
          </div>
        </section>
      ))}
    </div>
  );
}
