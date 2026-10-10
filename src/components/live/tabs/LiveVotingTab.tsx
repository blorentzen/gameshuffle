"use client";

/**
 * The room's tally for an open picks/bans round: which tracks, item modes
 * and items are winning the pick and the ban, plus how many ballots are in.
 * Sits under the viewer's own ballot in the live page's Picks & bans section
 * (it was a separate tab that pointed back there, until 2026-10-10).
 */

import { useMemo } from "react";
import Image from "next/image";
import {
  listTracksForGame,
  listItemModesForGame,
  listItemsForGame,
  type RaceGame,
} from "@/lib/randomizers/race";
import { getImagePath } from "@/lib/images";
import { aggregateBallots } from "@/lib/picks-bans/aggregate";
import type { PicksBansResults } from "@/lib/picks-bans/types";
import { useLiveState } from "../RealtimeLiveView";

interface Props {
  game: RaceGame | null;
  /** kebab-case game slug used to find the open round in live.rounds. */
  gameSlug: string | null;
}

const TOP_N = 5;

export function LiveVotingTab({ game, gameSlug }: Props) {
  const live = useLiveState();
  const round = useMemo(
    () =>
      gameSlug
        ? live.rounds.find(
            (r) => r.game_slug === gameSlug && r.status === "open"
          ) ?? null
        : null,
    [live.rounds, gameSlug]
  );
  const ballots = useMemo(
    () =>
      round ? live.ballots.filter((b) => b.round_id === round.id) : [],
    [live.ballots, round]
  );
  const aggregate: PicksBansResults = useMemo(
    () => aggregateBallots(ballots, { lockedOnly: false }),
    [ballots]
  );
  const lockedCount = ballots.filter((b) => b.locked_at != null).length;
  const inProgressCount = ballots.length - lockedCount;

  const tracksCatalog = useMemo(
    () => (game ? listTracksForGame(game) : []),
    [game]
  );
  const modesCatalog = useMemo(
    () => (game ? listItemModesForGame(game) : []),
    [game]
  );
  const itemsCatalog = useMemo(
    () => (game ? listItemsForGame(game) : []),
    [game]
  );

  // Look up display info (name + image) for a leaderboard entry id by
  // walking the per-pool catalog. An id the catalog doesn't know (old or
  // mismatched ballot rows) is left out rather than printed raw ("c0-t1").
  const lookupTrack = (id: string) => tracksCatalog.find((t) => t.id === id) ?? null;
  const lookupMode = (id: string) => modesCatalog.find((m) => m.id === id) ?? null;
  const lookupItem = (id: string) => itemsCatalog.find((i) => i.id === id) ?? null;

  if (!round) {
    return (
      <div className="live-tab live-tab--empty">
        <p className="live-pb__no-round-headline">
          No round open right now.
        </p>
        <p className="live-pb__no-round-sub">
          When the streamer opens one, the room&rsquo;s votes show here as they come in.
        </p>
      </div>
    );
  }

  return (
    <div className="live-tab live-voting">
      <header className="live-voting__header">
        <p className="live-voting__title">
          How the room is voting
        </p>
        <p className="live-voting__counts">
          <strong>{lockedCount}</strong> locked ·{" "}
          <strong>{inProgressCount}</strong> in progress ·{" "}
          <strong>{ballots.length}</strong> total ballots
        </p>
      </header>

      <Leaderboard
        title="Tracks"
        picks={aggregate.tracks.topPicks.slice(0, TOP_N)}
        bans={aggregate.tracks.topBans.slice(0, TOP_N)}
        lookup={(id) => {
          const t = lookupTrack(id);
          return t ? { name: t.name, image: t.image } : null;
        }}
      />
      <Leaderboard
        title="Item modes"
        picks={aggregate.itemModes.topPicks.slice(0, TOP_N)}
        bans={aggregate.itemModes.topBans.slice(0, TOP_N)}
        lookup={(id) => {
          const m = lookupMode(id);
          return m ? { name: m.name } : null;
        }}
      />
      <Leaderboard
        title="Items"
        picks={aggregate.itemLiteral.topPicks.slice(0, TOP_N)}
        bans={aggregate.itemLiteral.topBans.slice(0, TOP_N)}
        lookup={(id) => {
          const i = lookupItem(id);
          return i ? { name: i.name, image: i.image } : null;
        }}
      />

    </div>
  );
}

interface LeaderboardEntry {
  id: string;
  count: number;
}

interface LeaderboardProps {
  title: string;
  picks: LeaderboardEntry[];
  bans: LeaderboardEntry[];
  lookup: (id: string) => { name: string; image?: string } | null;
}

function Leaderboard({ title, picks: rawPicks, bans: rawBans, lookup }: LeaderboardProps) {
  // Only entries the catalog can name.
  const picks = rawPicks.filter((p) => lookup(p.id));
  const bans = rawBans.filter((b) => lookup(b.id));
  if (picks.length === 0 && bans.length === 0) return null;
  const maxPick = picks[0]?.count ?? 1;
  const maxBan = bans[0]?.count ?? 1;
  return (
    <section className="live-voting__pool">
      <h3 className="live-voting__pool-title">{title}</h3>
      <div className="live-voting__columns">
        <div className="live-voting__column">
          <h4 className="live-voting__column-title live-voting__column-title--picks">
            ✓ Top picks
          </h4>
          {picks.length === 0 ? (
            <p className="live-voting__column-empty">No picks yet.</p>
          ) : (
            <ol className="live-voting__list">
              {picks.map((p) => {
                const meta = lookup(p.id)!;
                return (
                  <li key={p.id} className="live-voting__row">
                    <LeaderboardRow
                      meta={meta}
                      count={p.count}
                      max={maxPick}
                      tone="picks"
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div className="live-voting__column">
          <h4 className="live-voting__column-title live-voting__column-title--bans">
            ✗ Top bans
          </h4>
          {bans.length === 0 ? (
            <p className="live-voting__column-empty">No bans yet.</p>
          ) : (
            <ol className="live-voting__list">
              {bans.map((b) => {
                const meta = lookup(b.id)!;
                return (
                  <li key={b.id} className="live-voting__row">
                    <LeaderboardRow
                      meta={meta}
                      count={b.count}
                      max={maxBan}
                      tone="bans"
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function LeaderboardRow({
  meta,
  count,
  max,
  tone,
}: {
  meta: { name: string; image?: string };
  count: number;
  max: number;
  tone: "picks" | "bans";
}) {
  const pct = Math.max(4, Math.round((count / Math.max(1, max)) * 100));
  return (
    <>
      {meta.image ? (
        <div className="live-voting__row-img">
          <Image
            src={getImagePath(meta.image)}
            alt=""
            width={36}
            height={36}
            unoptimized
          />
        </div>
      ) : (
        <div
          className="live-voting__row-img live-voting__row-img--placeholder"
          aria-hidden
        />
      )}
      <div className="live-voting__row-meta">
        <span className="live-voting__row-name">{meta.name}</span>
        <div className="live-voting__row-bar">
          <div
            className={`live-voting__row-bar-fill live-voting__row-bar-fill--${tone}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="live-voting__row-count">{count}</span>
    </>
  );
}
