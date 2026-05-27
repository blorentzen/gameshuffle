"use client";

/**
 * Shared pick/ban picker — tile-grid UI for assembling a ballot.
 *
 * Used by the viewer-facing live page (`LivePicksBansTab`) AND the
 * streamer-facing Hub panel (`PicksBansRoundPanel`). Both surfaces
 * have the same interaction model:
 *   - Picker is always visible while the active game supports it
 *   - Selections debounce-save to the per-(session, game, viewer) draft
 *   - Locking commits a ballot for the open round + mirrors to draft
 *   - Pick / Ban are explicit buttons per tile (not a cycle button)
 *
 * Caller is responsible for resolving:
 *   - The currently-open round for this game (or null)
 *   - All ballots for that round (used for live aggregate counts)
 *   - The viewer's identity (twitch_user_id for authed, sessionStorage
 *     UUID for anon)
 *
 * Per `gs-picks-bans-evergreen-drafts-spec.md`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Button, Modal } from "@empac/cascadeds";
import {
  listTracksForGame,
  listRalliesForGame,
  listItemModesForGame,
  listItemsForGame,
  getItemById,
  type Item,
  type ItemMode,
  type RaceGame,
  type Rally,
  type Track,
} from "@/lib/randomizers/race";
import { aggregateBallots } from "@/lib/picks-bans/aggregate";
import {
  getModePresentation,
  type ModePresentation,
} from "@/lib/picks-bans/modePresentation";
import type {
  PicksBansBallot,
  PicksBansDraft,
  PicksBansResults,
  PicksBansRound,
} from "@/lib/picks-bans/types";

/** Quiet window before a local picker edit is flushed to the draft
 *  endpoint. Tuned to feel responsive while still collapsing rapid
 *  cycling of the same tile into a single write. */
const DRAFT_SAVE_DEBOUNCE_MS = 800;

export type Pool = "tracks" | "rallies" | "modes" | "items";
export type PoolAction = "pick" | "ban";

export interface BallotState {
  picksTracks: string[];
  bansTracks: string[];
  picksRallies: string[];
  bansRallies: string[];
  picksModes: string[];
  bansModes: string[];
  picksItems: string[];
  bansItems: string[];
}

const EMPTY_BALLOT: BallotState = {
  picksTracks: [],
  bansTracks: [],
  picksRallies: [],
  bansRallies: [],
  picksModes: [],
  bansModes: [],
  picksItems: [],
  bansItems: [],
};

/** Which data target the picker reads + writes to.
 *
 *  - `"ballot"` (default): viewer-style. Hydrates from the per-(session,
 *    game, viewer) draft via `/api/picks-bans/draft`; debounced edits
 *    save to that same endpoint; lock-in writes a round-scoped ballot.
 *    Renders a Lock button when a round is open.
 *  - `"config"`: streamer-side canonical editor. Hydrates from the
 *    `initialBallot` prop (parent maps from RaceRandomizerConfig);
 *    debounced edits call `onConfigSave`. No draft endpoint, no Lock
 *    button — changes go live immediately.
 *
 *  The visual UI is the same in both modes; only the data destination
 *  changes. This is the consolidation that lets one component back
 *  both the streamer's "manual config" and "voting" surfaces. */
export type PickerMode = "ballot" | "config";

export interface PicksBansPickerProps {
  sessionId: string;
  /** kebab-case game slug. The picker filters round + ballot matching
   *  by this slug. */
  gameSlug: string;
  game: RaceGame;
  /** The currently-open round for this (session, game). Null when no
   *  round is open — the picker stays visible as a draft-only state
   *  with the lock button disabled. */
  round: PicksBansRound | null;
  /** All ballots for the open round above — used for live aggregate
   *  counts shown alongside each tile. Empty when no round open. */
  ballots: PicksBansBallot[];
  /** Authed viewer's Twitch ID (from `users.twitch_id`). Null when
   *  viewer is anonymous. */
  viewerTwitchUserId: string | null;
  /** Anon viewer's sessionStorage UUID. Null on SSR / unsupported
   *  browsers; should be resolved client-side via `useAnonViewerId()`
   *  before render. */
  anonId: string | null;
  /** True if the current user has any authenticated identity (auth
   *  provider doesn't matter — controls the "sign in with Twitch" CTA
   *  in the anon footer). */
  isAuthenticated: boolean;
  /** Handler for the anonymous "Sign in with Twitch" CTA. Pass
   *  `undefined` to suppress the CTA entirely (e.g., on the Hub where
   *  the streamer is always signed in). */
  onSignInClick?: () => void;
  /** Which surface the picker drives. Defaults to `"ballot"` — viewer
   *  side. The Hub's Race Setup module passes `"config"` so the
   *  picker writes directly to the canonical RaceRandomizerConfig. */
  mode?: PickerMode;
  /** Required when `mode === "config"`. The current canonical config's
   *  picks/bans mapped to BallotState shape. The picker hydrates from
   *  this on mount and whenever its identity (key) changes. */
  initialBallot?: BallotState;
  /** Required when `mode === "config"`. Called debounced after each
   *  user edit with the latest BallotState — parent maps back to
   *  RaceRandomizerConfig and persists. */
  onConfigSave?: (next: BallotState) => Promise<void> | void;
}

export function PicksBansPicker({
  sessionId,
  gameSlug,
  game,
  round,
  ballots,
  viewerTwitchUserId,
  anonId,
  isAuthenticated,
  onSignInClick,
  mode = "ballot",
  initialBallot,
  onConfigSave,
}: PicksBansPickerProps) {
  const isConfigMode = mode === "config";
  // Viewer's own ballot — used to hydrate locked state when round is
  // open and the viewer has already locked in.
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
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from the appropriate source.
  //
  //  - ballot mode: GET /api/picks-bans/draft. Async, network.
  //  - config mode: `initialBallot` prop (parent maps from
  //    RaceRandomizerConfig). Synchronous, no network — just copy
  //    into local state. Hydrate immediately so the picker is
  //    interactive on first paint.
  useEffect(() => {
    if (!sessionId || !gameSlug) {
      setHydrated(true);
      return;
    }
    if (isConfigMode) {
      if (initialBallot) {
        setBallot({
          picksTracks: [...initialBallot.picksTracks],
          bansTracks: [...initialBallot.bansTracks],
          picksRallies: [...initialBallot.picksRallies],
          bansRallies: [...initialBallot.bansRallies],
          picksModes: [...initialBallot.picksModes],
          bansModes: [...initialBallot.bansModes],
          picksItems: [...initialBallot.picksItems],
          bansItems: [...initialBallot.bansItems],
        });
      }
      setHydrated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const url = new URL("/api/picks-bans/draft", window.location.origin);
      url.searchParams.set("sessionId", sessionId);
      url.searchParams.set("gameSlug", gameSlug);
      if (!viewerTwitchUserId && anonId) {
        url.searchParams.set("anonSessionId", anonId);
      }
      try {
        const res = await fetch(url.toString());
        if (cancelled) return;
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          draft?: PicksBansDraft | null;
        } | null;
        if (cancelled) return;
        const draft = body?.ok && body.draft ? body.draft : null;
        if (draft) {
          setBallot({
            picksTracks: [...draft.picks_tracks],
            bansTracks: [...draft.bans_tracks],
            picksRallies: [...(draft.picks_rallies ?? [])],
            bansRallies: [...(draft.bans_rallies ?? [])],
            picksModes: [...draft.picks_item_modes],
            bansModes: [...draft.bans_item_modes],
            picksItems: [...draft.picks_item_literal],
            bansItems: [...draft.bans_item_literal],
          });
        }
      } catch {
        // Best-effort. Next change will trigger another save attempt.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, gameSlug, viewerTwitchUserId, anonId, isConfigMode, initialBallot]);

  // Sync from ownBallot when present (overrides the draft for the
  // current round). When ownBallot disappears (round closes / no
  // ballot yet for a new round), DO NOT reset the picker state — the
  // viewer's draft stays as their carry-over for the next round.
  const ownBallotKey = ownBallot
    ? `${ownBallot.id}:${ownBallot.updated_at}`
    : null;
  const [syncedFromBallotKey, setSyncedFromBallotKey] = useState<string | null>(
    null,
  );
  if (syncedFromBallotKey !== ownBallotKey) {
    setSyncedFromBallotKey(ownBallotKey);
    if (ownBallot) {
      setBallot({
        picksTracks: [...ownBallot.picks_tracks],
        bansTracks: [...ownBallot.bans_tracks],
        picksRallies: [...(ownBallot.picks_rallies ?? [])],
        bansRallies: [...(ownBallot.bans_rallies ?? [])],
        picksModes: [...ownBallot.picks_item_modes],
        bansModes: [...ownBallot.bans_item_modes],
        picksItems: [...ownBallot.picks_item_literal],
        bansItems: [...ownBallot.bans_item_literal],
      });
      setLocked(!!ownBallot.locked_at);
    } else {
      setLocked(false);
    }
  }

  const tracks = useMemo<Track[]>(() => listTracksForGame(game), [game]);
  const rallies = useMemo<Rally[]>(() => listRalliesForGame(game), [game]);
  const itemModes = useMemo<ItemMode[]>(
    () => listItemModesForGame(game),
    [game],
  );
  const items = useMemo<Item[]>(() => listItemsForGame(game), [game]);
  const hasRallies = rallies.length > 0;

  // Modes get an (i) info button per tile — clicking opens a modal
  // showing what items the mode contains. Tracks + Items don't need
  // it: their artwork already conveys the option fully. Modes also
  // get a Tabler icon + dual-color gradient via the mode-presentation
  // registry — no static artwork URL.
  const modesOptions = useMemo<PoolGridOption[]>(
    () =>
      itemModes.map((m) => {
        const infoItems = m.items
          .map((id) => getItemById(id))
          .filter((i): i is NonNullable<typeof i> => !!i)
          .map((i) => ({ id: i.id, name: i.name, image: i.image }));
        return {
          id: m.id,
          name: m.name,
          info: {
            description: m.description,
            items: infoItems,
          },
          presentation: getModePresentation(m.id),
        };
      }),
    [itemModes],
  );

  const aggregate: PicksBansResults = useMemo(
    () => aggregateBallots(ballots, { lockedOnly: false }),
    [ballots],
  );
  const lockedCount = ballots.filter((b) => b.locked_at != null).length;
  const inProgressCount = ballots.length - lockedCount;

  const draftSaveTimerRef = useRef<number | null>(null);
  const cancelPendingDraftSave = () => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
  };
  const saveDraft = async (next: BallotState) => {
    if (!sessionId || !gameSlug) return;
    // Config mode routes saves to the parent's onConfigSave (which
    // persists to RaceRandomizerConfig). Ballot mode keeps the draft
    // endpoint behavior.
    if (isConfigMode) {
      if (!onConfigSave) return;
      try {
        await onConfigSave(next);
      } catch {
        // Best-effort. Surfaced upstream if the caller wants to.
      }
      return;
    }
    try {
      await fetch("/api/picks-bans/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          gameSlug,
          anonSessionId: viewerTwitchUserId ? undefined : anonId,
          picks_tracks: next.picksTracks,
          bans_tracks: next.bansTracks,
          picks_rallies: next.picksRallies,
          bans_rallies: next.bansRallies,
          picks_item_modes: next.picksModes,
          bans_item_modes: next.bansModes,
          picks_item_literal: next.picksItems,
          bans_item_literal: next.bansItems,
        }),
      });
    } catch {
      // Best-effort. Next change will trigger another save attempt.
    }
  };
  const scheduleDraftSave = (next: BallotState) => {
    cancelPendingDraftSave();
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      void saveDraft(next);
    }, DRAFT_SAVE_DEBOUNCE_MS) as unknown as number;
  };
  useEffect(() => {
    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, []);

  const lockIn = async () => {
    if (!round || submitting) return;
    setSubmitting(true);
    setError(null);
    cancelPendingDraftSave();
    try {
      const ballotRes = await fetch("/api/picks-bans/ballot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: round.id,
          anonSessionId: viewerTwitchUserId ? undefined : anonId,
          picks_tracks: ballot.picksTracks,
          bans_tracks: ballot.bansTracks,
          picks_rallies: ballot.picksRallies,
          bans_rallies: ballot.bansRallies,
          picks_item_modes: ballot.picksModes,
          bans_item_modes: ballot.bansModes,
          picks_item_literal: ballot.picksItems,
          bans_item_literal: ballot.bansItems,
          lock: true,
        }),
      });
      const ballotBody = await ballotRes.json().catch(() => ({}));
      if (!ballotRes.ok || !ballotBody.ok) {
        setError(ballotBody.error ?? `Lock failed (${ballotRes.status}).`);
        setSubmitting(false);
        return;
      }
      setLocked(true);
      void saveDraft(ballot);
    } catch (err) {
      console.error("[PicksBansPicker] lock failed", err);
      setError("Lock failed (network error).");
    }
    setSubmitting(false);
  };

  const applyAction = (pool: Pool, id: string, action: PoolAction) => {
    if (locked) return;
    setBallot((b) => {
      const next = applyPoolAction(b, pool, id, action);
      scheduleDraftSave(next);
      return next;
    });
  };

  if (!hydrated) {
    return (
      <div className="live-tab live-pb">
        <p className="live-pb__hydrating">Loading your picks…</p>
      </div>
    );
  }

  return (
    <div className="live-tab live-pb">
      {!isAuthenticated && onSignInClick && (
        <Alert variant="info">
          Voting anonymously — your draft lives in this browser tab and
          persists across rounds for this session.{" "}
          <button
            type="button"
            className="live-pb__signin-link"
            onClick={onSignInClick}
          >
            Sign in with Twitch
          </button>{" "}
          to keep your picks across future sessions too.
        </Alert>
      )}

      <div className="live-pb__status">
        <div>
          {isConfigMode ? (
            <strong>Editing canonical picks & bans</strong>
          ) : round ? (
            <>
              <strong>Round open</strong> · {round.game_slug}
            </>
          ) : (
            <strong>Drafting — round not open yet</strong>
          )}
        </div>
        {round && !isConfigMode && (
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
        {hasRallies && (
          <button
            type="button"
            role="tab"
            aria-selected={activePool === "rallies"}
            className={`live-pb__tab${activePool === "rallies" ? " live-pb__tab--active" : ""}`}
            onClick={() => setActivePool("rallies")}
          >
            Rallies ({ballot.picksRallies.length}✓ /{" "}
            {ballot.bansRallies.length}✗)
          </button>
        )}
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
          onAction={(id, action) => applyAction("tracks", id, action)}
          locked={locked}
          showCounts={!isConfigMode}
        />
      )}
      {activePool === "rallies" && (
        <PoolGrid
          options={rallies.map((r) => ({
            id: r.id,
            name: r.name,
            image: r.image,
          }))}
          picks={ballot.picksRallies}
          bans={ballot.bansRallies}
          counts={aggregate.rallies}
          onAction={(id, action) => applyAction("rallies", id, action)}
          locked={locked}
          showCounts={!isConfigMode}
        />
      )}
      {activePool === "modes" && (
        <PoolGrid
          options={modesOptions}
          picks={ballot.picksModes}
          bans={ballot.bansModes}
          counts={aggregate.itemModes}
          onAction={(id, action) => applyAction("modes", id, action)}
          locked={locked}
          showCounts={!isConfigMode}
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
          onAction={(id, action) => applyAction("items", id, action)}
          locked={locked}
          showCounts={!isConfigMode}
        />
      )}

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {isConfigMode ? (
        <div className="live-pb__actions">
          <span className="live-pb__lock-hint">
            Changes save automatically to your canonical picks &amp; bans.
            Switch to <em>Drafting ballot</em> to participate in an open
            round instead.
          </span>
        </div>
      ) : (
        <div className="live-pb__actions">
          {!locked ? (
            <>
              <Button
                variant="primary"
                onClick={() => void lockIn()}
                disabled={submitting || !round}
              >
                {submitting
                  ? "Locking…"
                  : round
                    ? "Lock my vote"
                    : "Round not open yet"}
              </Button>
              <span className="live-pb__lock-hint">
                {round
                  ? "Once locked, your ballot is frozen for this round."
                  : "Your picks are saved as a draft and will be ready to submit when the streamer opens a round."}
              </span>
            </>
          ) : (
            <Alert variant="success">
              Your vote is locked in. The streamer will review the top picks
              when the round closes.
            </Alert>
          )}
        </div>
      )}

      {!isAuthenticated && onSignInClick && (
        <p className="live-pb__footer-hint">
          Want your picks to follow you across future sessions?{" "}
          <Link href="/login">Sign in</Link>.
        </p>
      )}
    </div>
  );
}

interface PoolGridOptionInfoItem {
  id: string;
  name: string;
  image?: string;
}

interface PoolGridOption {
  id: string;
  name: string;
  cup?: string;
  image?: string;
  /** When present, a small (i) button on the tile opens a modal with
   *  this descriptive content. Used to show viewers + streamers what
   *  items make up a themed mode without rolling. Mobile-friendly
   *  alternative to a native `title` tooltip. */
  info?: {
    description?: string;
    items?: PoolGridOptionInfoItem[];
  };
  /** Tabler icon + dual-color palette used to render the tile artwork.
   *  Modes use this in place of an `image`; tracks/items stick with
   *  the artwork URL pattern. */
  presentation?: ModePresentation;
}

function PoolGrid({
  options,
  picks,
  bans,
  counts,
  onAction,
  locked,
  showCounts,
}: {
  options: PoolGridOption[];
  picks: string[];
  bans: string[];
  counts: {
    topPicks: Array<{ id: string; count: number }>;
    topBans: Array<{ id: string; count: number }>;
  };
  onAction: (id: string, action: PoolAction) => void;
  locked: boolean;
  /** Hide the per-tile pick/ban tally row. Used in canonical-config
   *  mode where no ballots exist and the row would always read 0/0. */
  showCounts: boolean;
}) {
  const pickedSet = new Set(picks);
  const bannedSet = new Set(bans);
  const pickCountById = new Map(counts.topPicks.map((r) => [r.id, r.count]));
  const banCountById = new Map(counts.topBans.map((r) => [r.id, r.count]));

  // Info-modal state — clicking the (i) on a tile sets the open option.
  // Stays scoped to the active PoolGrid since only one renders at a
  // time (selected via the activePool tab in the parent).
  const [infoOpen, setInfoOpen] = useState<PoolGridOption | null>(null);

  if (options.length === 0) {
    return (
      <div className="live-pb__empty">
        <p>No options available for this pool yet.</p>
      </div>
    );
  }

  return (
    <>
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
            <div
              key={o.id}
              className={`live-pb__tile${stateClass}`}
              aria-label={`${o.name}${isPicked ? ", picked" : isBanned ? ", banned" : ""}`}
            >
              {o.presentation ? (
                <div
                  className="live-pb__tile-img live-pb__tile-img--mode"
                  style={{
                    background: `linear-gradient(135deg, ${o.presentation.primary}, ${o.presentation.accent})`,
                    color: o.presentation.iconColor,
                  }}
                  aria-hidden
                >
                  <o.presentation.Icon size={48} stroke={2} />
                </div>
              ) : o.image ? (
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
              {o.info && (
                <button
                  type="button"
                  className="race-pool__tile-info"
                  aria-label={`Show details for ${o.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInfoOpen(o);
                  }}
                >
                  i
                </button>
              )}
              {showCounts && (
                <div className="live-pb__tile-counts">
                  <span className="live-pb__tile-pick-count" title="Total picks">
                    ✓ {pickCount}
                  </span>
                  <span className="live-pb__tile-ban-count" title="Total bans">
                    ✗ {banCount}
                  </span>
                </div>
              )}
              <div className="live-pb__tile-actions">
                <button
                  type="button"
                  className={`live-pb__tile-btn live-pb__tile-btn--pick${
                    isPicked ? " live-pb__tile-btn--active" : ""
                  }`}
                  onClick={() => onAction(o.id, "pick")}
                  disabled={locked}
                  aria-pressed={isPicked}
                >
                  Pick
                </button>
                <button
                  type="button"
                  className={`live-pb__tile-btn live-pb__tile-btn--ban${
                    isBanned ? " live-pb__tile-btn--active" : ""
                  }`}
                  onClick={() => onAction(o.id, "ban")}
                  disabled={locked}
                  aria-pressed={isBanned}
                >
                  Ban
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {infoOpen && (
        <Modal
          isOpen={!!infoOpen}
          onClose={() => setInfoOpen(null)}
          title={infoOpen.name}
          size="medium"
          primaryAction={{
            label: "Close",
            onClick: () => setInfoOpen(null),
          }}
        >
          <div className="race-pool__info-modal">
            {infoOpen.info?.description && (
              <p className="race-pool__info-description">
                {infoOpen.info.description}
              </p>
            )}
            {infoOpen.info?.items && infoOpen.info.items.length > 0 && (
              <>
                <p className="race-pool__info-label">Items in this mode</p>
                <ul className="race-pool__info-grid">
                  {infoOpen.info.items.map((it) => (
                    <li key={it.id} className="race-pool__info-item">
                      {it.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.image}
                          alt=""
                          className="race-pool__info-item-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="race-pool__info-item-img race-pool__info-item-img--placeholder" />
                      )}
                      <span className="race-pool__info-item-name">
                        {it.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function applyPoolAction(
  b: BallotState,
  pool: Pool,
  id: string,
  action: PoolAction,
): BallotState {
  const fields = poolFields(pool);
  const picks = b[fields.picks];
  const bans = b[fields.bans];
  const isPicked = picks.includes(id);
  const isBanned = bans.includes(id);
  if (action === "pick") {
    if (isPicked) {
      return { ...b, [fields.picks]: picks.filter((x) => x !== id) };
    }
    return {
      ...b,
      [fields.picks]: [...picks, id],
      [fields.bans]: isBanned ? bans.filter((x) => x !== id) : bans,
    };
  }
  if (isBanned) {
    return { ...b, [fields.bans]: bans.filter((x) => x !== id) };
  }
  return {
    ...b,
    [fields.bans]: [...bans, id],
    [fields.picks]: isPicked ? picks.filter((x) => x !== id) : picks,
  };
}

function poolFields(pool: Pool): {
  picks: keyof BallotState;
  bans: keyof BallotState;
} {
  if (pool === "tracks") return { picks: "picksTracks", bans: "bansTracks" };
  if (pool === "rallies")
    return { picks: "picksRallies", bans: "bansRallies" };
  if (pool === "modes") return { picks: "picksModes", bans: "bansModes" };
  return { picks: "picksItems", bans: "bansItems" };
}
