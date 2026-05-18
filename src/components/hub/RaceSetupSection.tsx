"use client";

/**
 * Race Setup — consolidated streamer-side module for race randomization
 * + picks/bans rounds. Replaces the previously-separate
 * `<RaceRandomizerSection>` (canonical config editor) and
 * `<PicksBansRoundPanel>` (round lifecycle + viewer-vote aggregator)
 * into one unified surface.
 *
 * Single picker (the `<PicksBansPicker>` tile UI) drives both data
 * destinations via a streamer-facing mode toggle:
 *
 *   - "Editing config" — clicks debounce-save to the canonical
 *     RaceRandomizerConfig in `session_modules.race_randomizer`. This
 *     is the default when no picks/bans round is open.
 *   - "Drafting ballot" — clicks debounce-save to the streamer's
 *     per-(session, game) draft. Lock-in commits a ballot for the open
 *     round (rolled up into the same aggregation as viewer ballots).
 *     Auto-engaged when a round opens.
 *
 * What this module shows, top-to-bottom:
 *   1. Header + master enabled switch
 *   2. Defaults — race series length, duplicate handling, manual roll
 *   3. Round controls — open/close/cancel + Apply editor on close
 *   4. Mode toggle
 *   5. The picker
 *
 * Per the user's "consolidate race randomizer + picks/bans" UX call,
 * scoped to Phase 1 (Tracks / Item Modes / Items pools — rallies and
 * advanced sub-pool editors deferred).
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Radio,
  RadioGroup,
  Switch,
} from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import {
  openPicksBansRoundAction,
  closePicksBansRoundAction,
  applyPicksBansResultsAction,
  cancelPicksBansRoundAction,
  updateRaceConfigAction,
} from "@/app/hub/sessions/[slug]/actions";
import { topN } from "@/lib/picks-bans/aggregate";
import type {
  PicksBansBallot,
  PicksBansRound,
  PicksBansResults,
  RecommendationMode,
} from "@/lib/picks-bans/types";
import {
  getTrackById,
  getRallyById,
  getItemModeById,
  getItemById,
  type RaceGame,
} from "@/lib/randomizers/race";
import { getGameName } from "@/data/game-registry";
import { GameArtwork } from "./GameArtwork";
import { listRalliesForGame } from "@/lib/randomizers/race";
import type { RaceRandomizerConfig } from "@/lib/modules/types";
import {
  getItemModesConfig,
  getLiteralItemsConfig,
} from "@/lib/modules/types";
import {
  PicksBansPicker,
  type BallotState,
} from "@/components/picks-bans/PicksBansPicker";
import {
  getModePresentation,
  type ModePresentation,
} from "@/lib/picks-bans/modePresentation";
import { useSessionSave } from "./SessionSaveProvider";

interface Props {
  /** Active session id (or null when there's no live session — manual
   *  roll buttons disable, but the picker still works on draft). */
  sessionId: string | null;
  sessionSlug: string;
  /** RaceGame enum — drives the picker's tile contents. Null if the
   *  selected slug isn't a supported race game (GS Queue etc.) — the
   *  parent renders a different surface in that case. */
  game: RaceGame | null;
  gameSlug: string;
  /** Hydrated config snapshot from the server. */
  initial: RaceRandomizerConfig | null;
  /** When false, the session isn't active — picks/bans round controls
   *  render disabled with a hint. */
  sessionLive: boolean;
  /** Which slice of the module this instance renders.
   *
   *  - `"config"` (Modules tab) — enabled toggle, defaults, canonical
   *    picks/bans picker in config mode. No round polling, no manual
   *    roll, no apply editor. Pure setup.
   *  - `"live"` (Dashboard) — manual roll, round controls, ballot-mode
   *    picker when a round is open, apply editor when a round just
   *    closed. No enabled toggle, no defaults. Pure runtime.
   *
   *  Two surfaces give the streamer a clean mental model: configure
   *  before going live, control while live. */
  surface: "config" | "live";
}

const POLL_INTERVAL_MS = 4000;

const SERIES_PRESETS: number[] = [1, 2, 4, 6, 8, 12, 16];

const DEFAULT_CONFIG: RaceRandomizerConfig = {
  enabled: true,
  tracks: { enabled: true, picks: [], bans: [] },
  items: {
    modes: { enabled: true, picks: [], bans: [] },
    literal: { enabled: true, picks: [], bans: [] },
  },
  defaultSeriesLength: 1,
};

/** Map RaceRandomizerConfig picks/bans → the picker's BallotState
 *  shape. Uses the `getItemModesConfig` / `getLiteralItemsConfig`
 *  helpers so the legacy single-sub-pool items shape is normalized
 *  transparently. */
function configToBallot(config: RaceRandomizerConfig): BallotState {
  const modes = getItemModesConfig(config.items);
  const literal = getLiteralItemsConfig(config.items);
  return {
    picksTracks: [...config.tracks.picks],
    bansTracks: [...config.tracks.bans],
    picksRallies: [...(config.rallies?.picks ?? [])],
    bansRallies: [...(config.rallies?.bans ?? [])],
    picksModes: [...modes.picks],
    bansModes: [...modes.bans],
    picksItems: [...literal.picks],
    bansItems: [...literal.bans],
  };
}

/** Inverse of configToBallot — splice ballot back into config. Writes
 *  through the normalized items shape (`{ modes, literal }`) — the
 *  store-side helpers + SQL migration auto-upgrade legacy rows on
 *  first save, so this is safe to emit unconditionally. */
function applyBallotToConfig(
  config: RaceRandomizerConfig,
  ballot: BallotState,
): RaceRandomizerConfig {
  const modes = getItemModesConfig(config.items);
  const literal = getLiteralItemsConfig(config.items);
  return {
    ...config,
    tracks: {
      ...config.tracks,
      picks: [...ballot.picksTracks],
      bans: [...ballot.bansTracks],
    },
    // Only emit a `rallies` sub-config when the picker has rally
    // selections OR the config already had one — avoids silently
    // adding the field to MK8DX (which has no rally pool).
    ...(config.rallies ||
    ballot.picksRallies.length > 0 ||
    ballot.bansRallies.length > 0
      ? {
          rallies: {
            ...(config.rallies ?? { enabled: true, picks: [], bans: [] }),
            picks: [...ballot.picksRallies],
            bans: [...ballot.bansRallies],
          },
        }
      : {}),
    items: {
      modes: {
        ...modes,
        picks: [...ballot.picksModes],
        bans: [...ballot.bansModes],
      },
      literal: {
        ...literal,
        picks: [...ballot.picksItems],
        bans: [...ballot.bansItems],
      },
    },
  };
}

export function RaceSetupSection({
  sessionId,
  sessionSlug,
  game,
  gameSlug,
  initial,
  sessionLive,
  surface,
}: Props) {
  const isConfigSurface = surface === "config";
  const isLiveSurface = surface === "live";
  // ----- Canonical config state ------------------------------------------
  const initialConfig = initial ?? DEFAULT_CONFIG;
  const [config, setConfig] = useState<RaceRandomizerConfig>(initialConfig);
  // Snapshot of the last successfully-saved server state. Drives dirty
  // detection: `config !== lastSaved` (by deep equality) → unsaved
  // changes. Updates on save success.
  const [lastSaved, setLastSaved] = useState<RaceRandomizerConfig>(
    initialConfig,
  );
  const [error, setError] = useState<string | null>(null);
  const [rerolling, setRerolling] = useState<
    "race" | "rally" | "items" | "track" | null
  >(
    null,
  );

  const { registerSection, unregisterSection, setDirty } = useSessionSave();
  // Keep the save fn pointing at the latest config without re-registering.
  // Ref is updated via effect (not during render) per React's strict
  // refs rule.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  // ----- Round state (polled — same cadence as old PicksBansRoundPanel) --
  const [round, setRound] = useState<PicksBansRound | null>(null);
  const [closedRound, setClosedRound] = useState<PicksBansRound | null>(null);
  const [ballots, setBallots] = useState<PicksBansBallot[]>([]);
  const [pending, startTransition] = useTransition();
  const [topNValue, setTopNValue] = useState<number>(5);
  const [recMode, setRecMode] = useState<RecommendationMode>("recommend");

  const [streamerTwitchId, setStreamerTwitchId] = useState<string | null>(null);

  // ----- Picker mode is derived per-surface at the render sites below.
  //   - config surface → renders <PicksBansPicker mode="config" />
  //   - live surface (only when a round is open) → mode="ballot"
  // No top-level state; the runtime toggle that used to live here is
  // gone with the Modules/Dashboard split.

  // ----- Streamer twitch_id lookup ---------------------------------------
  // Only the live surface uses the streamer's twitch_id (for the ballot
  // picker identity). Config surface skips this fetch entirely.
  useEffect(() => {
    if (!isLiveSurface) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: profile } = await supabase
        .from("users")
        .select("twitch_id")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      setStreamerTwitchId((profile?.twitch_id as string | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLiveSurface]);

  // ----- Round polling ---------------------------------------------------
  // Live surface only — config surface has no use for round state.
  useEffect(() => {
    if (!isLiveSurface) return;
    if (!sessionId) return;
    let cancelled = false;
    const supabase = createClient();
    const refresh = async () => {
      const { data: openRows } = await supabase
        .from("session_picks_bans_rounds")
        .select("*")
        .eq("session_id", sessionId)
        .eq("game_slug", gameSlug)
        .eq("status", "open")
        .limit(1);
      if (cancelled) return;
      const open = (openRows?.[0] as PicksBansRound | undefined) ?? null;
      setRound(open);

      const { data: closedRows } = await supabase
        .from("session_picks_bans_rounds")
        .select("*")
        .eq("session_id", sessionId)
        .eq("game_slug", gameSlug)
        .eq("status", "closed")
        .order("opened_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      setClosedRound((closedRows?.[0] as PicksBansRound | undefined) ?? null);

      const targetRoundId = open?.id ?? closedRows?.[0]?.id ?? null;
      if (!targetRoundId) {
        setBallots([]);
        return;
      }
      const { data: rows } = await supabase
        .from("session_picks_bans_ballots")
        .select("*")
        .eq("round_id", targetRoundId);
      if (cancelled) return;
      setBallots((rows ?? []) as PicksBansBallot[]);
    };
    void refresh();
    const handle = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [sessionId, gameSlug, isLiveSurface]);

  // ----- Register with the page's save bar -----------------------------
  // Config surface only — live surface's actions are imperative (fire
  // server actions immediately on click), nothing to "save".
  // Replaces the previous on-every-edit debounced autosave. Local edits
  // now accumulate; the top-of-page Save bar fires `persistConfig` on
  // explicit user action.
  useEffect(() => {
    if (!isConfigSurface) return;
    const id = `race-setup:${gameSlug}`;
    registerSection(
      id,
      async () => {
        const cur = configRef.current;
        return new Promise<{ ok: true } | { ok: false; error?: string }>(
          (resolve) => {
            void persistConfig(sessionSlug, gameSlug, cur, {
              onStart: () => setError(null),
              onSuccess: () => {
                setLastSaved(cur);
                resolve({ ok: true });
              },
              onError: (msg) => {
                setError(msg);
                resolve({ ok: false, error: msg });
              },
            });
          },
        );
      },
      { label: `Race Setup (${gameSlug})` },
    );
    return () => unregisterSection(id);
  }, [registerSection, unregisterSection, sessionSlug, gameSlug, isConfigSurface]);

  // Dirty tracking: any divergence from the last server-known state.
  // Deep equality via JSON serialization is fine — the config is small
  // and the comparison is cheap relative to the React commit cycle.
  // Skipped on the live surface (which doesn't register a saver).
  useEffect(() => {
    if (!isConfigSurface) return;
    const dirty = JSON.stringify(config) !== JSON.stringify(lastSaved);
    setDirty(`race-setup:${gameSlug}`, dirty);
  }, [config, lastSaved, gameSlug, setDirty, isConfigSurface]);

  // ----- Round actions ---------------------------------------------------
  const openRound = () => {
    setError(null);
    startTransition(async () => {
      const res = await openPicksBansRoundAction(sessionSlug, {
        gameSlug,
        recommendationTopN: topNValue,
        recommendationMode: recMode,
      });
      if (!res.ok) setError(res.error ?? "Failed to open round.");
    });
  };
  const closeRound = () => {
    if (!round) return;
    setError(null);
    startTransition(async () => {
      const res = await closePicksBansRoundAction(sessionSlug, round.id);
      if (!res.ok) setError(res.error ?? "Failed to close round.");
    });
  };
  const cancelRound = () => {
    if (!round) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelPicksBansRoundAction(sessionSlug, round.id);
      if (!res.ok) setError(res.error ?? "Failed to cancel round.");
    });
  };

  const aggregateClosed: PicksBansResults | null = closedRound?.results
    ? (closedRound.results as PicksBansResults)
    : null;

  const lockedCount = ballots.filter((b) => b.locked_at != null).length;
  const inProgressCount = ballots.length - lockedCount;

  const reroll = async (kind: "race" | "rally" | "track" | "items") => {
    if (!sessionId) return;
    setRerolling(kind);
    setError(null);
    try {
      const payload: Record<string, unknown> = { sessionId, kind };
      if (kind === "race" && (config.defaultSeriesLength ?? 1) > 1) {
        payload.series = config.defaultSeriesLength;
      }
      const res = await fetch("/api/twitch/race/reroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Reroll failed (${res.status}).`);
      }
    } catch (err) {
      console.error("[RaceSetupSection] reroll failed", err);
      setError("Reroll failed (network error).");
    }
    setRerolling(null);
  };

  const initialBallotForPicker = useMemo(
    () => configToBallot(config),
    [config],
  );

  // Save handler for "config" picker mode — debounced via the picker's
  // own internal save timer. Splice the ballot back into the canonical
  // config; the existing debounced config-save effect picks it up and
  // writes to the server.
  const handleConfigSaveFromPicker = (next: BallotState) => {
    setConfig((c) => applyBallotToConfig(c, next));
  };

  const liveSession = !!sessionId;
  const seriesLength = config.defaultSeriesLength ?? 1;
  // Rally pool is MKWorld-only — `listRalliesForGame` returns [] for
  // games without rallies. Used to gate the "Roll rally" button on the
  // Manual Roll card.
  const hasRallies = game ? listRalliesForGame(game).length > 0 : false;

  const sectionTitle = isConfigSurface ? "Race Setup" : "Race Controls";
  // Live surface gets a per-game qualifier — the Dashboard is scoped
  // to whichever game the streamer is currently playing, so we make it
  // unmistakable WHICH game these controls drive. Modules tab already
  // has the GameCarousel above to communicate selection.
  const showGameQualifier = isLiveSurface && !!game;

  return (
    <section className="hub-detail__section">
      <div className="hub-detail__section-title-row">
        {showGameQualifier && (
          <GameArtwork slug={gameSlug} size="thumb" />
        )}
        <h2 className="hub-detail__section-title">
          {sectionTitle}
          {showGameQualifier && (
            <span className="hub-detail__section-title-suffix">
              {" · "}
              {getGameName(gameSlug)}
            </span>
          )}
        </h2>
      </div>
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!game && (
        <Alert variant="info">
          This session has no race game selected. Set a supported game
          (Mario Kart 8 Deluxe or Mario Kart World) on the Session
          details section to use this module.
        </Alert>
      )}

      {/* ──────────────────────────────────────────────────────────
          Config surface — single card: defaults + canonical picker
          ────────────────────────────────────────────────────────── */}
      {isConfigSurface && (
        <Card variant="outlined" padding="medium">
          <div className="hub-form__field-stack">
            <label className="hub-form__inline-field hub-form__inline-field--row">
              <Switch
                checked={config.enabled}
                onChange={() =>
                  setConfig((c) => ({ ...c, enabled: !c.enabled }))
                }
              />
              <span>
                <strong>{config.enabled ? "Enabled" : "Disabled"}</strong>
                <span className="hub-form__platform-disabled">
                  Master toggle. Disable to silence{" "}
                  <code>!gs-track</code>, <code>!gs-items</code>,{" "}
                  <code>!gs-race</code> entirely.
                </span>
              </span>
            </label>

            <label className="hub-form__field" htmlFor="race-default-series">
              <span className="hub-form__label">Default race series</span>
              <select
                id="race-default-series"
                className="hub-form__select"
                value={String(seriesLength)}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setConfig((c) => ({ ...c, defaultSeriesLength: n }));
                }}
              >
                {SERIES_PRESETS.map((n) => (
                  <option key={n} value={String(n)}>
                    {n === 1 ? "1 race" : `${n} races`}
                  </option>
                ))}
              </select>
              <p className="hub-form__platform-disabled">
                Sets the default series length for{" "}
                <code>!gs-track</code> and <code>!gs-race</code>. Explicit
                args still override.
              </p>
            </label>

            {hasRallies && (
              <RadioGroup
                name={`roll-kind-${gameSlug}`}
                label="Default roll kind"
                orientation="vertical"
                value={config.rollKind ?? "race"}
                onChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    rollKind: v as "race" | "rally" | "auto",
                  }))
                }
              >
                <Radio
                  value="race"
                  label="Race tracks"
                  helperText="!gs-race rolls a regular race track."
                />
                <Radio
                  value="rally"
                  label="Knockout rallies"
                  helperText="!gs-race rolls a knockout rally."
                />
                <Radio
                  value="auto"
                  label="Mix it up"
                  helperText="!gs-race picks a race or rally at random each call."
                />
              </RadioGroup>
            )}

            <div className="hub-form__field">
              <span className="hub-form__label">Series duplicates</span>
              <label className="hub-form__inline-field hub-form__inline-field--row">
                <Switch
                  checked={!!config.allowSeriesDuplicates}
                  onChange={() =>
                    setConfig((c) => ({
                      ...c,
                      allowSeriesDuplicates: !c.allowSeriesDuplicates,
                    }))
                  }
                />
                <span>
                  <strong>
                    {config.allowSeriesDuplicates
                      ? "Duplicates allowed"
                      : "No duplicate tracks"}
                  </strong>
                  <span className="hub-form__platform-disabled">
                    {config.allowSeriesDuplicates
                      ? "A track can roll more than once in a series."
                      : "Each track rolls at most once per series. Competitive default."}
                  </span>
                </span>
              </label>
            </div>
          </div>
          {game && (
            <PicksBansPicker
              sessionId={sessionId ?? ""}
              gameSlug={gameSlug}
              game={game}
              round={null}
              ballots={[]}
              viewerTwitchUserId={null}
              anonId={null}
              isAuthenticated={true}
              mode="config"
              initialBallot={initialBallotForPicker}
              onConfigSave={handleConfigSaveFromPicker}
            />
          )}
        </Card>
      )}

      {/* ──────────────────────────────────────────────────────────
          Live surface — two-column card grid:
            • Left:  Manual roll  (race randomizer trigger)
            • Right: Picks & Bans (round lifecycle + ballot picker)
          Visual separation makes it clear these are independent
          actions; the columns collapse to a stack on narrow viewports
          via the `.hub-detail__card-grid` CSS. The mode selector is a
          CDS `<RadioGroup>` rather than competing primary buttons.
          ────────────────────────────────────────────────────────── */}
      {isLiveSurface && (
        <div className="hub-detail__card-grid">
          <Card variant="outlined" padding="medium">
            <h3 className="hub-detail__card-title">Manual roll</h3>
            <div className="hub-form__action-stack">
              <div className="hub-form__action-line">
                <Button
                  variant="primary"
                  onClick={() => void reroll("race")}
                  disabled={
                    !liveSession || !config.enabled || rerolling !== null
                  }
                  fullWidth
                >
                  {rerolling === "race"
                    ? "Rolling…"
                    : seriesLength === 1
                      ? "Roll race"
                      : `Roll ${seriesLength}-race series`}
                </Button>
                <p className="hub-form__platform-disabled">
                  Track + item mode together — same as{" "}
                  <code>!gs-race</code> in chat (respects your rally /
                  race default).
                </p>
              </div>
              {hasRallies && (
                <div className="hub-form__action-line">
                  <Button
                    variant="secondary"
                    onClick={() => void reroll("rally")}
                    disabled={
                      !liveSession || !config.enabled || rerolling !== null
                    }
                    fullWidth
                  >
                    {rerolling === "rally" ? "Rolling…" : "Roll rally"}
                  </Button>
                  <p className="hub-form__platform-disabled">
                    Force a knockout rally regardless of your default —
                    same as <code>!gs-rally</code>.
                  </p>
                </div>
              )}
              <div className="hub-form__action-line">
                <Button
                  variant="secondary"
                  onClick={() => void reroll("track")}
                  disabled={
                    !liveSession || !config.enabled || rerolling !== null
                  }
                  fullWidth
                >
                  {rerolling === "track" ? "Rolling…" : "Re-roll track only"}
                </Button>
                <p className="hub-form__platform-disabled">
                  Pick a new track without touching items —{" "}
                  <code>!gs-track</code>.
                </p>
              </div>
              <div className="hub-form__action-line">
                <Button
                  variant="secondary"
                  onClick={() => void reroll("items")}
                  disabled={
                    !liveSession || !config.enabled || rerolling !== null
                  }
                  fullWidth
                >
                  {rerolling === "items" ? "Rolling…" : "Re-roll items only"}
                </Button>
                <p className="hub-form__platform-disabled">
                  Roll a fresh item mode without touching the track —{" "}
                  <code>!gs-items</code>.
                </p>
              </div>
            </div>
            {!liveSession && (
              <p className="hub-form__platform-disabled">
                Manual rolls fire from here once the session is active.
              </p>
            )}
          </Card>

          <Card variant="outlined" padding="medium">
            <h3 className="hub-detail__card-title">Picks &amp; Bans</h3>

            {!sessionLive && (
              <Alert variant="info">
                Activate the session to open a picks/bans round. Once live,
                viewers can vote at <code>/live/[your-slug]</code>.
              </Alert>
            )}

            {sessionLive && !round && !closedRound && (
              <div className="hub-form__field-stack">
                <label className="hub-form__field">
                  <span className="hub-form__label">Top picks to apply</span>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={String(topNValue)}
                    onChange={(e) =>
                      setTopNValue(
                        Math.max(
                          1,
                          Math.min(50, parseInt(e.target.value || "5", 10)),
                        ),
                      )
                    }
                  />
                  <p className="hub-form__platform-disabled">
                    When the round closes, the top {topNValue} picks and
                    the top {topNValue} bans (by viewer votes) get written
                    back into your canonical Race Setup pool — the
                    settings the randomizer rolls from going forward.
                  </p>
                </label>
                <RadioGroup
                  name={`rec-mode-${gameSlug}`}
                  label="Mode"
                  orientation="vertical"
                  value={recMode}
                  onChange={(v) => setRecMode(v as RecommendationMode)}
                >
                  <Radio
                    value="recommend"
                    label="Recommend"
                    helperText="Show the top-N as a suggestion you confirm before applying."
                  />
                  <Radio
                    value="auto_apply"
                    label="Auto-apply on close"
                    helperText="Top-N writes directly into the canonical config when the round closes."
                  />
                </RadioGroup>
                <div className="hub-form__action-row">
                  <Button
                    variant="primary"
                    onClick={openRound}
                    disabled={pending}
                  >
                    Open round
                  </Button>
                </div>
              </div>
            )}

            {sessionLive && round && (
              <div className="hub-detail__panel-text">
                <Badge variant="success" size="small">
                  Round open
                </Badge>{" "}
                <strong>
                  {lockedCount} ballot{lockedCount === 1 ? "" : "s"} locked
                </strong>{" "}
                · {inProgressCount} in progress · top-N{" "}
                {round.recommendation_top_n} ·{" "}
                {round.recommendation_mode === "auto_apply"
                  ? "auto-apply on close"
                  : "manual review"}
                <div className="hub-form__action-row">
                  <Button
                    variant="primary"
                    onClick={closeRound}
                    disabled={pending}
                  >
                    Close round
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={cancelRound}
                    disabled={pending}
                  >
                    Cancel without applying
                  </Button>
                </div>
              </div>
            )}

            {sessionLive && !round && closedRound && aggregateClosed && (
              <ApplyEditor
                round={closedRound}
                results={aggregateClosed}
                topNValue={topNValue}
                setTopNValue={setTopNValue}
                pending={pending}
                onApply={(overrides) => {
                  setError(null);
                  startTransition(async () => {
                    const res = await applyPicksBansResultsAction(
                      sessionSlug,
                      closedRound.id,
                      { topN: topNValue, overrides },
                    );
                    if (!res.ok)
                      setError(res.error ?? "Failed to apply results.");
                  });
                }}
                onOpenNew={openRound}
              />
            )}

            {game && streamerTwitchId && round && (
              <PicksBansPicker
                sessionId={sessionId ?? ""}
                gameSlug={gameSlug}
                game={game}
                round={round}
                ballots={ballots}
                viewerTwitchUserId={streamerTwitchId}
                anonId={null}
                isAuthenticated={true}
                mode="ballot"
              />
            )}
          </Card>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ApplyEditor — closed-round review surface (carried over from the old
// PicksBansRoundPanel). Tile-based; each top-N item gets an Include /
// Skip toggle. Streamer hits Apply selected → top picks/bans land in
// the canonical RaceRandomizerConfig.
// ---------------------------------------------------------------------------

interface ApplyOverrides {
  tracks?: { picks?: string[]; bans?: string[] };
  rallies?: { picks?: string[]; bans?: string[] };
  itemModes?: { picks?: string[]; bans?: string[] };
  itemLiteral?: { picks?: string[]; bans?: string[] };
}

type ApplyPool = "tracks" | "rallies" | "itemModes" | "itemLiteral";

interface ApplyEditorProps {
  round: PicksBansRound;
  results: PicksBansResults;
  topNValue: number;
  setTopNValue: (n: number) => void;
  pending: boolean;
  onApply: (overrides: ApplyOverrides) => void;
  onOpenNew: () => void;
}

function ApplyEditor({
  round,
  results,
  topNValue,
  setTopNValue,
  pending,
  onApply,
  onOpenNew,
}: ApplyEditorProps) {
  const initialOverrides = useMemo<ApplyOverrides>(() => {
    const slice = (n: number) => ({
      tracks: topN(results.tracks, n),
      rallies: topN(results.rallies, n),
      itemModes: topN(results.itemModes, n),
      itemLiteral: topN(results.itemLiteral, n),
    });
    const t = slice(topNValue);
    return {
      tracks: { picks: [...t.tracks.picks], bans: [...t.tracks.bans] },
      rallies: { picks: [...t.rallies.picks], bans: [...t.rallies.bans] },
      itemModes: { picks: [...t.itemModes.picks], bans: [...t.itemModes.bans] },
      itemLiteral: {
        picks: [...t.itemLiteral.picks],
        bans: [...t.itemLiteral.bans],
      },
    };
  }, [results, topNValue]);

  const [overrides, setOverrides] = useState<ApplyOverrides>(initialOverrides);

  useEffect(() => {
    setOverrides(initialOverrides);
  }, [initialOverrides]);

  const toggle = (pool: ApplyPool, field: "picks" | "bans", id: string) => {
    setOverrides((o) => {
      const current = o[pool]?.[field] ?? [];
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      return {
        ...o,
        [pool]: { ...(o[pool] ?? {}), [field]: next },
      };
    });
  };

  const tracksTop = topN(results.tracks, topNValue);
  const ralliesTop = topN(results.rallies, topNValue);
  const modesTop = topN(results.itemModes, topNValue);
  const itemsTop = topN(results.itemLiteral, topNValue);

  // Build the info payload (description + items list with artwork)
  // for an item mode id. Used by the modes ApplyRow to show the same
  // (i) modal that viewers and streamers get in the picker.
  const resolveModeInfo = (
    id: string,
  ): TileInfoPayload | undefined => {
    const mode = getItemModeById(id);
    if (!mode) return undefined;
    const items = mode.items
      .map((itemId) => getItemById(itemId))
      .filter((i): i is NonNullable<typeof i> => !!i)
      .map((i) => ({ id: i.id, name: i.name, image: i.image }));
    return { description: mode.description, items };
  };

  return (
    <>
      <p className="hub-detail__panel-text">
        <Badge variant="default" size="small">
          Closed
        </Badge>{" "}
        Round wrapped up — review the top picks/bans below. Click any
        tile to toggle it in/out before applying.
      </p>
      <div className="picks-bans__results">
        <ApplyRow
          label="Top picked tracks"
          ids={tracksTop.picks}
          rows={results.tracks.topPicks}
          accepted={overrides.tracks?.picks ?? []}
          resolveName={(id) => getTrackById(id)?.name ?? id}
          resolveImage={(id) => getTrackById(id)?.image}
          variant="pick"
          onToggle={(id) => toggle("tracks", "picks", id)}
        />
        <ApplyRow
          label="Top banned tracks"
          ids={tracksTop.bans}
          rows={results.tracks.topBans}
          accepted={overrides.tracks?.bans ?? []}
          resolveName={(id) => getTrackById(id)?.name ?? id}
          resolveImage={(id) => getTrackById(id)?.image}
          variant="ban"
          onToggle={(id) => toggle("tracks", "bans", id)}
        />
        <ApplyRow
          label="Top picked rallies"
          ids={ralliesTop.picks}
          rows={results.rallies.topPicks}
          accepted={overrides.rallies?.picks ?? []}
          resolveName={(id) => getRallyById(id)?.name ?? id}
          resolveImage={(id) => getRallyById(id)?.image}
          variant="pick"
          onToggle={(id) => toggle("rallies", "picks", id)}
        />
        <ApplyRow
          label="Top banned rallies"
          ids={ralliesTop.bans}
          rows={results.rallies.topBans}
          accepted={overrides.rallies?.bans ?? []}
          resolveName={(id) => getRallyById(id)?.name ?? id}
          resolveImage={(id) => getRallyById(id)?.image}
          variant="ban"
          onToggle={(id) => toggle("rallies", "bans", id)}
        />
        <ApplyRow
          label="Top picked modes"
          ids={modesTop.picks}
          rows={results.itemModes.topPicks}
          accepted={overrides.itemModes?.picks ?? []}
          resolveName={(id) => getItemModeById(id)?.name ?? id}
          resolveInfo={resolveModeInfo}
          resolvePresentation={getModePresentation}
          variant="pick"
          onToggle={(id) => toggle("itemModes", "picks", id)}
        />
        <ApplyRow
          label="Top banned modes"
          ids={modesTop.bans}
          rows={results.itemModes.topBans}
          accepted={overrides.itemModes?.bans ?? []}
          resolveName={(id) => getItemModeById(id)?.name ?? id}
          resolveInfo={resolveModeInfo}
          resolvePresentation={getModePresentation}
          variant="ban"
          onToggle={(id) => toggle("itemModes", "bans", id)}
        />
        <ApplyRow
          label="Top picked items"
          ids={itemsTop.picks}
          rows={results.itemLiteral.topPicks}
          accepted={overrides.itemLiteral?.picks ?? []}
          resolveName={(id) => getItemById(id)?.name ?? id}
          resolveImage={(id) => getItemById(id)?.image}
          variant="pick"
          onToggle={(id) => toggle("itemLiteral", "picks", id)}
        />
        <ApplyRow
          label="Top banned items"
          ids={itemsTop.bans}
          rows={results.itemLiteral.topBans}
          accepted={overrides.itemLiteral?.bans ?? []}
          resolveName={(id) => getItemById(id)?.name ?? id}
          resolveImage={(id) => getItemById(id)?.image}
          variant="ban"
          onToggle={(id) => toggle("itemLiteral", "bans", id)}
        />
      </div>
      <div className="hub-form__field-stack">
        <label className="hub-form__field">
          <span className="hub-form__label">Apply top-N</span>
          <Input
            type="number"
            min={1}
            max={50}
            value={String(topNValue)}
            onChange={(e) =>
              setTopNValue(
                Math.max(
                  1,
                  Math.min(50, parseInt(e.target.value || "5", 10)),
                ),
              )
            }
          />
          <p className="hub-form__platform-disabled">
            Adjusting this rebuilds the proposed list — tile toggles
            reset.
          </p>
        </label>
        <div className="hub-form__action-row">
          <Button
            variant="primary"
            onClick={() => onApply(overrides)}
            disabled={pending}
          >
            Apply selected
          </Button>
          <Button variant="secondary" onClick={onOpenNew} disabled={pending}>
            Open new round
          </Button>
        </div>
      </div>
      <p className="hub-form__platform-disabled">
        Round id: <code>{round.id.slice(0, 8)}…</code>
      </p>
    </>
  );
}

interface TileInfoPayload {
  description?: string;
  items?: Array<{ id: string; name: string; image?: string }>;
}

function ApplyRow({
  label,
  ids,
  rows,
  accepted,
  resolveName,
  resolveImage,
  resolveInfo,
  resolvePresentation,
  variant,
  onToggle,
}: {
  label: string;
  ids: string[];
  rows: Array<{ id: string; count: number }>;
  accepted: string[];
  resolveName: (id: string) => string;
  resolveImage?: (id: string) => string | undefined;
  /** Optional info-modal payload resolver — applied to modes so the
   *  streamer can see what items make up each mode without rolling.
   *  Mirrors the affordance in the viewer-side picker. */
  resolveInfo?: (id: string) => TileInfoPayload | undefined;
  /** Optional Tabler icon + palette resolver. Used by modes so each
   *  tile shows its themed gradient + glyph (same lookup the viewer-
   *  side picker uses). */
  resolvePresentation?: (id: string) => ModePresentation | undefined;
  variant: "pick" | "ban";
  onToggle: (id: string) => void;
}) {
  const [infoOpen, setInfoOpen] = useState<{
    id: string;
    name: string;
    info: TileInfoPayload;
  } | null>(null);
  if (ids.length === 0) return null;
  const acceptedSet = new Set(accepted);
  const countsById = new Map(rows.map((r) => [r.id, r.count]));
  return (
    <div className="picks-bans__results-row">
      <span className="picks-bans__results-label">{label}:</span>
      <div className="live-pb__grid">
        {ids.map((id) => {
          const isAccepted = acceptedSet.has(id);
          const image = resolveImage?.(id);
          const info = resolveInfo?.(id);
          const presentation = resolvePresentation?.(id);
          const stateClass = isAccepted
            ? variant === "pick"
              ? " live-pb__tile--picked"
              : " live-pb__tile--banned"
            : "";
          const count = countsById.get(id) ?? 0;
          return (
            <div
              key={id}
              className={`live-pb__tile${stateClass}`}
              aria-label={`${resolveName(id)}, ${
                isAccepted ? "included in apply" : "skipped"
              }`}
            >
              {presentation ? (
                <div
                  className="live-pb__tile-img live-pb__tile-img--mode"
                  style={{
                    background: `linear-gradient(135deg, ${presentation.primary}, ${presentation.accent})`,
                    color: presentation.iconColor,
                  }}
                  aria-hidden
                >
                  <presentation.Icon size={48} stroke={2} />
                </div>
              ) : image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  className="live-pb__tile-img"
                  loading="lazy"
                />
              ) : (
                <div className="live-pb__tile-img live-pb__tile-img--placeholder" />
              )}
              <span className="live-pb__tile-name">{resolveName(id)}</span>
              {info && (
                <button
                  type="button"
                  className="race-pool__tile-info"
                  aria-label={`Show details for ${resolveName(id)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInfoOpen({ id, name: resolveName(id), info });
                  }}
                >
                  i
                </button>
              )}
              <div className="live-pb__tile-counts">
                <span
                  className={
                    variant === "pick"
                      ? "live-pb__tile-pick-count"
                      : "live-pb__tile-ban-count"
                  }
                  title={variant === "pick" ? "Picks" : "Bans"}
                >
                  {variant === "pick" ? "✓" : "✗"} {count}
                </span>
              </div>
              <div className="live-pb__tile-actions">
                <button
                  type="button"
                  className={`live-pb__tile-btn live-pb__tile-btn--${variant}${
                    isAccepted ? " live-pb__tile-btn--active" : ""
                  }`}
                  onClick={() => onToggle(id)}
                  aria-pressed={isAccepted}
                >
                  {isAccepted ? "Included" : "Skip"}
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
            {infoOpen.info.description && (
              <p className="race-pool__info-description">
                {infoOpen.info.description}
              </p>
            )}
            {infoOpen.info.items && infoOpen.info.items.length > 0 && (
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
    </div>
  );
}

// ---------------------------------------------------------------------------

interface PersistCallbacks {
  onStart: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

async function persistConfig(
  sessionSlug: string,
  gameSlug: string,
  config: RaceRandomizerConfig,
  cb: PersistCallbacks,
) {
  cb.onStart();
  try {
    const result = await updateRaceConfigAction(sessionSlug, {
      gameSlug,
      config: config as unknown as Record<string, unknown>,
    });
    if (!result.ok) {
      cb.onError(result.error ?? "Save failed.");
      return;
    }
    cb.onSuccess();
  } catch (err) {
    console.error("[RaceSetupSection] save failed", err);
    cb.onError("Save failed (network error).");
  }
}
