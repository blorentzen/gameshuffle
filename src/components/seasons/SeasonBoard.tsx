"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Chip } from "@empac/cascadeds";
import { nightGame } from "@/lib/nights/games";
import { rankFor, rankVariant, seasonLabel } from "@/lib/seasons/ranks";
import { GameChipIcon } from "@/components/games/GameCover";

/**
 * A community's season: this month's GS points from its live nights, overall
 * or per game, with each player's rank. Boards arrive pre-computed per game,
 * so switching is instant.
 */

export interface SeasonBoardRow { userId: string; name: string; username: string | null; points: number }

export function SeasonBoard({ seasonKey, boards, emptyHint }: { seasonKey: string; boards: Record<string, SeasonBoardRow[]>; emptyHint: string }) {
  const games = Object.keys(boards).filter((k) => k !== "all");
  const [game, setGame] = useState("all");
  const rows = boards[game] ?? [];
  return (
    <div className="season-board">
      <p className="party-muted">{seasonLabel(seasonKey)} · points from live nights: placings plus missions</p>
      {games.length > 1 && (
        <div className="party-chips">
          <Chip clickable selected={game === "all"} variant={game === "all" ? "primary" : "default"} label="All games" onClick={() => setGame("all")} />
          {games.map((g) => <Chip key={g} clickable selected={game === g} variant={game === g ? "primary" : "default"} label={nightGame(g)?.short ?? g} icon={<GameChipIcon slug={g} name={nightGame(g)?.label ?? g} />} onClick={() => setGame(g)} />)}
        </div>
      )}
      {rows.length ? (
        <ol className="season-board__rows">
          {rows.map((r, i) => {
            const rank = rankFor(r.points);
            return (
              <li key={r.userId}>
                <span className="season-board__pos">{i + 1}</span>
                <span className="season-board__name">{r.username ? <Link href={`/u/${r.username}`}>{r.name}</Link> : r.name}</span>
                <Badge variant={rankVariant(rank.id)} size="small">{rank.label}</Badge>
                <span className="season-board__pts">{r.points}</span>
              </li>
            );
          })}
        </ol>
      ) : <p className="party-muted">{emptyHint}</p>}
    </div>
  );
}

