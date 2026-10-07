import { Badge, Chip, Progress } from "@empac/cascadeds";
import { nightGame } from "@/lib/nights/games";
import { rankVariant, seasonLabel, nextRank } from "@/lib/seasons/ranks";
import Link from "next/link";
import type { UserSeason } from "@/lib/seasons/store";
import type { RivalView } from "@/lib/party/rivals";

/**
 * A profile's Season tab: this month's points per game, rank, and roster
 * races (win with every fighter, character or board you own).
 */
export function SeasonPanel({ seasonKey, season, rivals = [] }: { seasonKey: string; season: UserSeason; rivals?: RivalView[] }) {
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
      {rivals.length > 0 && (
        <section className="season-panel__roster">
          <h3 className="party-h3">Rivals</h3>
          <ul className="season-panel__games">
            {rivals.map((r) => (
              <li key={r.opponentId}>
                <span>{r.username ? <Link href={`/u/${r.username}`}>{r.name}</Link> : r.name}</span>
                <span>{r.wins}-{r.losses} in {r.games} game{r.games === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        </section>
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
