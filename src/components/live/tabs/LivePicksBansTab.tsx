"use client";

/**
 * Live-view picks/bans tab — viewer-facing tile picker. Replaces the
 * `!gs-pick-*` / `!gs-ban-*` chat commands with a click-to-cycle UI
 * that posts ballots through `/api/picks-bans/ballot`.
 *
 * Visibility option B (Britton's pick): running counts of in-progress +
 * locked ballots are visible to all viewers — bandwagon energy is part
 * of the chat-stream experience. The streamer's apply-top-N runs on
 * locked-only counts (server-side aggregation).
 *
 * Lock semantics: viewer assembles their ballot, then clicks "Lock my
 * vote." Once locked, the ballot is frozen for this round. Carry-over
 * from the previous round (same game) is auto-seeded so viewers can
 * adjust round-to-round without rebuilding from scratch.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button } from "@empac/cascadeds";
import {
  listTracksForGame,
  listItemModesForGame,
  listItemsForGame,
  type Item,
  type ItemMode,
  type RaceGame,
  type Track,
} from "@/lib/randomizers/race";
import { useLiveState } from "../RealtimeLiveView";
import { useAnonViewerId } from "../useAnonViewerId";
import { aggregateBallots } from "@/lib/picks-bans/aggregate";
import type { PicksBansResults } from "@/lib/picks-bans/types";

interface Props {
  sessionId: string;
  game: RaceGame | null;
  /** kebab-case game slug (`mario-kart-8-deluxe` etc.) — needed to
   *  match the open round's `game_slug`. */
  gameSlug: string | null;
  /** Authed-viewer twitch_user_id when available. Anonymous viewers
   *  fall back to the sessionStorage UUID. */
  viewerTwitchUserId: string | null;
  isAuthenticated: boolean;
  onSignInClick: () => void;
}

type Pool = "tracks" | "modes" | "items";

interface BallotState {
  picksTracks: string[];
  bansTracks: string[];
  picksModes: string[];
  bansModes: string[];
  picksItems: string[];
  bansItems: string[];
}

const EMPTY_BALLOT: BallotState = {
  picksTracks: [],
  bansTracks: [],
  picksModes: [],
  bansModes: [],
  picksItems: [],
  bansItems: [],
};

export function LivePicksBansTab({
  sessionId,
  game,
  gameSlug,
  viewerTwitchUserId,
  isAuthenticated,
  onSignInClick,
}: Props) {
  const live = useLiveState();
  const anonId = useAnonViewerId();

  // Round + ballots come from the realtime layer now (rounds /
  // ballots channels in RealtimeLiveView). This tab filters to the
  // open round for the current game and the ballots scoped to it.
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
  // sessionId is part of the parent context but not needed for the
  // ballot filter (live.ballots is already scoped to this session by
  // the realtime channel). Kept as a prop for callers that may want
  // to derive other queries.
  void sessionId;

  // Viewer's own ballot, if any. Hydrates the picker on first render
  // and on every realtime update.
  const ownBallot = useMemo(() => {
    return (
      ballots.find((b) => {
        if (viewerTwitchUserId)
          return b.viewer_twitch_user_id === viewerTwitchUserId;
        if (anonId) return b.anon_session_id === anonId;
        return false;
      }) ?? null
    );
  }, [ballots, viewerTwitchUserId, anonId]);

  const [ballot, setBallot] = useState<BallotState>(EMPTY_BALLOT);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePool, setActivePool] = useState<Pool>("tracks");

  // Sync the picker state from the viewer's own ballot when the
  // realtime layer pushes a fresh copy (or when the viewer's ballot
  // identity changes — e.g., they just submitted, or the round
  // turned over). Per React docs (storing-information-from-previous-
  // renders), syncing during render via a sentinel-id state is the
  // recommended pattern when "derive state from prop with local
  // override" is the right model. Avoids the setState-in-effect
  // cascade the compiler warns against.
  const ownBallotKey = ownBallot
    ? `${ownBallot.id}:${ownBallot.updated_at}`
    : "no-ballot";
  const [syncedFromKey, setSyncedFromKey] = useState<string | null>(null);
  if (syncedFromKey !== ownBallotKey) {
    setSyncedFromKey(ownBallotKey);
    if (ownBallot) {
      // Sync the picker from the server ballot — overwrites any
      // local edits since the last submit.
      setBallot({
        picksTracks: [...ownBallot.picks_tracks],
        bansTracks: [...ownBallot.bans_tracks],
        picksModes: [...ownBallot.picks_item_modes],
        bansModes: [...ownBallot.bans_item_modes],
        picksItems: [...ownBallot.picks_item_literal],
        bansItems: [...ownBallot.bans_item_literal],
      });
      setLocked(!!ownBallot.locked_at);
    } else {
      // No server ballot — could be: no round open yet, OR round
      // open but viewer hasn't submitted, OR a round just closed.
      // In ALL those cases we deliberately DON'T wipe the picker:
      // local pre-selections persist between rounds so a viewer
      // who pre-selects can lock-in instantly when the next round
      // opens. We just clear the locked flag (any prior lock is
      // tied to a now-closed round).
      setLocked(false);
    }
  }

  const tracks = useMemo<Track[]>(
    () => (game ? listTracksForGame(game) : []),
    [game]
  );
  const itemModes = useMemo<ItemMode[]>(
    () => (game ? listItemModesForGame(game) : []),
    [game]
  );
  const items = useMemo<Item[]>(
    () => (game ? listItemsForGame(game) : []),
    [game]
  );

  const aggregate: PicksBansResults = useMemo(
    () => aggregateBallots(ballots, { lockedOnly: false }),
    [ballots]
  );
  const lockedCount = ballots.filter((b) => b.locked_at != null).length;
  const inProgressCount = ballots.length - lockedCount;

  if (!gameSlug || !game) {
    return (
      <div className="live-tab live-tab--empty">
        <p>
          The streamer hasn&rsquo;t selected a supported game yet — picks/bans
          rounds aren&rsquo;t available.
        </p>
      </div>
    );
  }

  const submit = async (lock: boolean) => {
    if (submitting) return;
    if (!round) return; // Pre-select-only mode when no round is open.
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/picks-bans/ballot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: round.id,
          anonSessionId: viewerTwitchUserId ? undefined : anonId,
          picks_tracks: ballot.picksTracks,
          bans_tracks: ballot.bansTracks,
          picks_item_modes: ballot.picksModes,
          bans_item_modes: ballot.bansModes,
          picks_item_literal: ballot.picksItems,
          bans_item_literal: ballot.bansItems,
          lock,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error ?? `Submit failed (${res.status}).`);
      } else if (lock) {
        setLocked(true);
      }
    } catch (err) {
      console.error("[LivePicksBansTab] submit failed", err);
      setError("Submit failed (network error).");
    }
    setSubmitting(false);
  };

  const cyclePick = (pool: Pool, id: string) => {
    if (locked) return;
    setBallot((b) => cyclePoolState(b, pool, id));
    // Round-open: auto-save the in-progress ballot (lock=false) so
    // the server-stored copy stays in sync as the viewer cycles.
    // Round-closed: skip the API call — pre-selections live in
    // local component state until a round opens and the viewer
    // explicitly locks them in.
    if (round) void submit(false);
  };

  return (
    <div className="live-tab live-pb">
      {!isAuthenticated && (
        <Alert variant="info">
          You&rsquo;re voting anonymously — your ballot lives in this
          browser tab. <button
            type="button"
            className="live-pb__signin-link"
            onClick={onSignInClick}
          >
            Sign in with Twitch
          </button>{" "}
          to keep your vote across rounds + tabs.
        </Alert>
      )}

      <div
        className={`live-pb__status${
          round ? " live-pb__status--open" : " live-pb__status--closed"
        }`}
      >
        <div>
          {round ? (
            <>
              <strong>🎲 Picks/bans OPEN</strong> · cast your ballot now
            </>
          ) : (
            <>
              <strong>Picks/bans closed</strong> · pre-select what
              you&rsquo;d vote for and we&rsquo;ll save your picks for the
              next round
            </>
          )}
        </div>
        {round && (
          <div className="live-pb__counts">
            <span>{lockedCount} locked</span>
            <span> · {inProgressCount} in progress</span>
          </div>
        )}
      </div>

      <div className="live-pb__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activePool === "tracks"}
          className={`live-pb__tab${activePool === "tracks" ? " live-pb__tab--active" : ""}`}
          onClick={() => setActivePool("tracks")}
        >
          Tracks ({ballot.picksTracks.length}✓ / {ballot.bansTracks.length}✗)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePool === "modes"}
          className={`live-pb__tab${activePool === "modes" ? " live-pb__tab--active" : ""}`}
          onClick={() => setActivePool("modes")}
        >
          Item Modes ({ballot.picksModes.length}✓ / {ballot.bansModes.length}✗)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePool === "items"}
          className={`live-pb__tab${activePool === "items" ? " live-pb__tab--active" : ""}`}
          onClick={() => setActivePool("items")}
        >
          Items ({ballot.picksItems.length}✓ / {ballot.bansItems.length}✗)
        </button>
      </div>

      {activePool === "tracks" && (
        <PoolGrid
          options={tracks}
          picks={ballot.picksTracks}
          bans={ballot.bansTracks}
          counts={aggregate.tracks}
          onCycle={(id) => cyclePick("tracks", id)}
          locked={locked}
        />
      )}
      {activePool === "modes" && (
        <PoolGrid
          options={itemModes.map((m) => ({ id: m.id, name: m.name }))}
          picks={ballot.picksModes}
          bans={ballot.bansModes}
          counts={aggregate.itemModes}
          onCycle={(id) => cyclePick("modes", id)}
          locked={locked}
        />
      )}
      {activePool === "items" && (
        <PoolGrid
          options={items.map((i) => ({
            id: i.id,
            name: i.name,
            cup: i.category,
            image: i.image,
          }))}
          picks={ballot.picksItems}
          bans={ballot.bansItems}
          counts={aggregate.itemLiteral}
          onCycle={(id) => cyclePick("items", id)}
          locked={locked}
        />
      )}

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="live-pb__actions">
        {round ? (
          locked ? (
            <Alert variant="success">
              Your vote is locked in. The streamer will review the top picks
              when the round closes.
            </Alert>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={() => void submit(true)}
                disabled={submitting}
              >
                {submitting ? "Locking…" : "Lock my vote"}
              </Button>
              <span className="live-pb__lock-hint">
                Once locked, your ballot is frozen for this round.
              </span>
            </>
          )
        ) : (
          <>
            <Button variant="primary" disabled>
              Waiting for round to open
            </Button>
            <span className="live-pb__lock-hint">
              Your selections are saved here. As soon as the streamer opens a
              round, you&rsquo;ll see a toast and you can lock instantly.
            </span>
          </>
        )}
      </div>

      <p className="live-pb__footer-hint">
        Want to follow your vote across rounds? <Link href="/login">Sign in</Link>.
      </p>
    </div>
  );
}

interface PoolGridOption {
  id: string;
  name: string;
  cup?: string;
  image?: string;
}

function PoolGrid({
  options,
  picks,
  bans,
  counts,
  onCycle,
  locked,
}: {
  options: PoolGridOption[];
  picks: string[];
  bans: string[];
  counts: { topPicks: Array<{ id: string; count: number }>; topBans: Array<{ id: string; count: number }> };
  onCycle: (id: string) => void;
  locked: boolean;
}) {
  const pickedSet = new Set(picks);
  const bannedSet = new Set(bans);
  const pickCountById = new Map(counts.topPicks.map((r) => [r.id, r.count]));
  const banCountById = new Map(counts.topBans.map((r) => [r.id, r.count]));

  if (options.length === 0) {
    return (
      <div className="live-pb__empty">
        <p>No options available for this pool yet.</p>
      </div>
    );
  }

  return (
    <div className="live-pb__grid">
      {options.map((o) => {
        const isPicked = pickedSet.has(o.id);
        const isBanned = bannedSet.has(o.id);
        const pickCount = pickCountById.get(o.id) ?? 0;
        const banCount = banCountById.get(o.id) ?? 0;
        const stateClass = isPicked
          ? " live-pb__tile--picked"
          : isBanned
            ? " live-pb__tile--banned"
            : "";
        return (
          <button
            key={o.id}
            type="button"
            className={`live-pb__tile${stateClass}`}
            onClick={() => onCycle(o.id)}
            disabled={locked}
            aria-pressed={isPicked || isBanned}
            aria-label={`${o.name}${isPicked ? ", picked" : isBanned ? ", banned" : ""}`}
          >
            {o.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={o.image}
                alt=""
                className="live-pb__tile-img"
                loading="lazy"
              />
            ) : (
              <div className="live-pb__tile-img live-pb__tile-img--placeholder" />
            )}
            <span className="live-pb__tile-name">{o.name}</span>
            <div className="live-pb__tile-counts">
              <span className="live-pb__tile-pick-count" title="Total picks">
                ✓ {pickCount}
              </span>
              <span className="live-pb__tile-ban-count" title="Total bans">
                ✗ {banCount}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function cyclePoolState(b: BallotState, pool: Pool, id: string): BallotState {
  const fields = poolFields(pool);
  const picks = b[fields.picks];
  const bans = b[fields.bans];
  const isPicked = picks.includes(id);
  const isBanned = bans.includes(id);
  if (!isPicked && !isBanned) {
    return { ...b, [fields.picks]: [...picks, id] };
  }
  if (isPicked) {
    return {
      ...b,
      [fields.picks]: picks.filter((x) => x !== id),
      [fields.bans]: [...bans, id],
    };
  }
  return { ...b, [fields.bans]: bans.filter((x) => x !== id) };
}

function poolFields(pool: Pool): {
  picks: keyof BallotState;
  bans: keyof BallotState;
} {
  if (pool === "tracks") return { picks: "picksTracks", bans: "bansTracks" };
  if (pool === "modes") return { picks: "picksModes", bans: "bansModes" };
  return { picks: "picksItems", bans: "bansItems" };
}
