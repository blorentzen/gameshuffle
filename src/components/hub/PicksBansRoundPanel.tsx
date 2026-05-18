"use client";

/**
 * Hub-side picks/bans round controls. Renders inside the per-game view
 * on the Modules tab (alongside RaceRandomizerSection) so the streamer
 * sees:
 *   - Round status (no round / round open / round closed-awaiting-apply)
 *   - Open round → live count + close + cancel buttons
 *   - Closed round → top picks/bans preview + apply (top-N) controls
 *
 * Polls every 4s for round + ballot state. Realtime is a follow-up.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
} from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import {
  openPicksBansRoundAction,
  closePicksBansRoundAction,
  applyPicksBansResultsAction,
  cancelPicksBansRoundAction,
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
  getItemModeById,
  getItemById,
  type RaceGame,
} from "@/lib/randomizers/race";
import { PicksBansPicker } from "@/components/picks-bans/PicksBansPicker";

interface Props {
  sessionId: string;
  sessionSlug: string;
  gameSlug: string;
  /** When false, the session isn't active — round controls render
   *  disabled with a hint. */
  sessionLive: boolean;
}

const POLL_INTERVAL_MS = 4000;

export function PicksBansRoundPanel({
  sessionId,
  sessionSlug,
  gameSlug,
  sessionLive,
}: Props) {
  const [round, setRound] = useState<PicksBansRound | null>(null);
  const [closedRound, setClosedRound] = useState<PicksBansRound | null>(null);
  const [ballots, setBallots] = useState<PicksBansBallot[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [topNValue, setTopNValue] = useState<number>(5);
  const [mode, setMode] = useState<RecommendationMode>("recommend");
  /** Streamer's Twitch numeric ID (`users.twitch_id`). Loaded once on
   *  mount; used by the embedded picker so the streamer's ballot is
   *  attached to their Twitch identity (same shape as a viewer ballot
   *  from the live page — they show up as just another voter in the
   *  aggregation). */
  const [streamerTwitchId, setStreamerTwitchId] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  // Poll round + ballots.
  useEffect(() => {
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

      // Also pull the most recent closed-but-not-applied round so the
      // streamer can apply results from the last round even if a new
      // one isn't open yet.
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
  }, [sessionId, gameSlug]);

  const aggregateClosed: PicksBansResults | null = closedRound?.results
    ? (closedRound.results as PicksBansResults)
    : null;

  const lockedCount = ballots.filter((b) => b.locked_at != null).length;
  const inProgressCount = ballots.length - lockedCount;

  const open = () => {
    setError(null);
    startTransition(async () => {
      const res = await openPicksBansRoundAction(sessionSlug, {
        gameSlug,
        recommendationTopN: topNValue,
        recommendationMode: mode,
      });
      if (!res.ok) setError(res.error ?? "Failed to open round.");
    });
  };
  const close = () => {
    if (!round) return;
    setError(null);
    startTransition(async () => {
      const res = await closePicksBansRoundAction(sessionSlug, round.id);
      if (!res.ok) setError(res.error ?? "Failed to close round.");
    });
  };
  const cancel = () => {
    if (!round) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelPicksBansRoundAction(sessionSlug, round.id);
      if (!res.ok) setError(res.error ?? "Failed to cancel round.");
    });
  };

  // Map kebab slug → RaceGame enum for the embedded picker. Only the
  // two race-randomizer games light up the streamer-side ballot UI;
  // for any other slug (GS Queue, future games without picks/bans
  // support) the picker stays hidden but round controls still render.
  const gameRace: RaceGame | null =
    gameSlug === "mario-kart-8-deluxe"
      ? "mk8dx"
      : gameSlug === "mario-kart-world"
        ? "mkworld"
        : null;

  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Picks & Bans round</h2>
      <Card variant="outlined" padding="medium">
        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {!sessionLive && (
          <Alert variant="info">
            Activate the session to open a picks/bans round. Once live,
            viewers can vote at <code>/live/[your-slug]</code>.
          </Alert>
        )}

        {/* Streamer's own ballot — same picker UI viewers see at
            /live/[slug]. Streamer votes alongside viewers; their
            ballot is rolled into the same aggregation. Only renders
            for race-randomizer games and when the session is live.
            When `streamerTwitchId` is null (account not Twitch-linked
            yet), we skip rendering rather than minting an anon UUID —
            the streamer should resolve via Account → Connections
            first. */}
        {sessionLive && gameRace && streamerTwitchId && (
          <PicksBansPicker
            sessionId={sessionId}
            gameSlug={gameSlug}
            game={gameRace}
            round={round}
            ballots={ballots}
            viewerTwitchUserId={streamerTwitchId}
            anonId={null}
            isAuthenticated={true}
          />
        )}

        {sessionLive && !round && !closedRound && (
          <>
            <p className="hub-detail__panel-text">
              No open round. Open one and viewers can pick/ban tracks +
              items at <code>/live/[your-slug]</code>. Their counts are
              visible to all viewers in real time.
            </p>
            <div className="hub-form__field-stack">
              <label className="hub-form__field">
                <span className="hub-form__label">Top-N to apply</span>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={String(topNValue)}
                  onChange={(e) =>
                    setTopNValue(
                      Math.max(
                        1,
                        Math.min(50, parseInt(e.target.value || "5", 10))
                      )
                    )
                  }
                />
                <p className="hub-form__platform-disabled">
                  When the round closes, the top {topNValue} picks (and
                  bans) get the spotlight. <code>Recommend</code> shows
                  them as a suggestion you confirm; <code>Auto-apply</code>{" "}
                  writes them directly into the active config.
                </p>
              </label>
              <div className="hub-form__field">
                <span className="hub-form__label">Mode</span>
                <div className="hub-form__action-row">
                  <Button
                    variant={mode === "recommend" ? "primary" : "secondary"}
                    onClick={() => setMode("recommend")}
                  >
                    Recommend
                  </Button>
                  <Button
                    variant={mode === "auto_apply" ? "primary" : "secondary"}
                    onClick={() => setMode("auto_apply")}
                  >
                    Auto-apply on close
                  </Button>
                </div>
              </div>
              <div className="hub-form__action-row">
                <Button variant="primary" onClick={open} disabled={pending}>
                  Open round
                </Button>
              </div>
            </div>
          </>
        )}

        {sessionLive && round && (
          <>
            <p className="hub-detail__panel-text">
              <Badge variant="success" size="small">Open</Badge>{" "}
              <strong>{lockedCount} ballot{lockedCount === 1 ? "" : "s"} locked</strong>{" "}
              · {inProgressCount} in progress · top-N {round.recommendation_top_n} ·{" "}
              {round.recommendation_mode === "auto_apply"
                ? "auto-apply on close"
                : "manual review"}
            </p>
            <div className="hub-form__action-row">
              <Button variant="primary" onClick={close} disabled={pending}>
                Close round
              </Button>
              <Button variant="secondary" onClick={cancel} disabled={pending}>
                Cancel without applying
              </Button>
            </div>
          </>
        )}

        {sessionLive && !round && closedRound && (
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
                  { topN: topNValue, overrides }
                );
                if (!res.ok) setError(res.error ?? "Failed to apply results.");
              });
            }}
            onOpenNew={open}
          />
        )}
      </Card>
    </section>
  );
}

// ApplyEditor — closed-round review surface. Streamer sees the
// auto-derived top-N list and can deselect any chip before clicking
// Apply. Selected chips become the override; unselected ones drop out.
interface ApplyEditorProps {
  round: PicksBansRound;
  results: PicksBansResults | null;
  topNValue: number;
  setTopNValue: (n: number) => void;
  pending: boolean;
  onApply: (overrides: ApplyOverrides) => void;
  onOpenNew: () => void;
}

interface ApplyOverrides {
  tracks?: { picks?: string[]; bans?: string[] };
  itemModes?: { picks?: string[]; bans?: string[] };
  itemLiteral?: { picks?: string[]; bans?: string[] };
}

type Pool = "tracks" | "itemModes" | "itemLiteral";

function ApplyEditor({
  round,
  results,
  topNValue,
  setTopNValue,
  pending,
  onApply,
  onOpenNew,
}: ApplyEditorProps) {
  // Streamer-curated overrides — start with everything selected (the
  // raw top-N). Clicking a chip toggles it out / back in.
  const initialOverrides = useMemo<ApplyOverrides>(() => {
    if (!results) return {};
    const slice = (n: number) => topNFromResults(results, n);
    const t = slice(topNValue);
    return {
      tracks: { picks: [...t.tracks.picks], bans: [...t.tracks.bans] },
      itemModes: {
        picks: [...t.itemModes.picks],
        bans: [...t.itemModes.bans],
      },
      itemLiteral: {
        picks: [...t.itemLiteral.picks],
        bans: [...t.itemLiteral.bans],
      },
    };
  }, [results, topNValue]);

  const [overrides, setOverrides] = useState<ApplyOverrides>(initialOverrides);

  // Reset overrides when the streamer changes top-N or the round
  // changes — the auto-derived list shifts under them.
  useEffect(() => {
    setOverrides(initialOverrides);
  }, [initialOverrides]);

  const toggle = (
    pool: Pool,
    field: "picks" | "bans",
    id: string
  ) => {
    setOverrides((o) => {
      const current = o[pool]?.[field] ?? [];
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      return {
        ...o,
        [pool]: {
          ...(o[pool] ?? {}),
          [field]: next,
        },
      };
    });
  };

  return (
    <>
      <p className="hub-detail__panel-text">
        <Badge variant="default" size="small">Closed</Badge> Round
        wrapped up — review the top picks/bans below. Click any chip to
        toggle it in/out before applying.
      </p>
      {results && (
        <EditableResultsPreview
          results={results}
          topNValue={topNValue}
          overrides={overrides}
          onToggle={toggle}
        />
      )}
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
                  Math.min(50, parseInt(e.target.value || "5", 10))
                )
              )
            }
          />
          <p className="hub-form__platform-disabled">
            Adjusting this rebuilds the proposed list — chip toggles
            reset. Only chips you leave selected here actually land in
            the active config.
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

function topNFromResults(
  results: PicksBansResults,
  n: number
): Record<Pool, { picks: string[]; bans: string[] }> {
  return {
    tracks: topN(results.tracks, n),
    itemModes: topN(results.itemModes, n),
    itemLiteral: topN(results.itemLiteral, n),
  };
}

interface EditableResultsPreviewProps {
  results: PicksBansResults;
  topNValue: number;
  overrides: ApplyOverrides;
  onToggle: (pool: Pool, field: "picks" | "bans", id: string) => void;
}

function EditableResultsPreview({
  results,
  topNValue,
  overrides,
  onToggle,
}: EditableResultsPreviewProps) {
  const tracksTop = topN(results.tracks, topNValue);
  const modesTop = topN(results.itemModes, topNValue);
  const itemsTop = topN(results.itemLiteral, topNValue);

  return (
    <div className="picks-bans__results">
      <EditableRow
        label="Top picked tracks"
        ids={tracksTop.picks}
        rows={results.tracks.topPicks}
        accepted={overrides.tracks?.picks ?? []}
        resolveName={(id) => getTrackById(id)?.name ?? id}
        resolveImage={(id) => getTrackById(id)?.image}
        variant="pick"
        onToggle={(id) => onToggle("tracks", "picks", id)}
      />
      <EditableRow
        label="Top banned tracks"
        ids={tracksTop.bans}
        rows={results.tracks.topBans}
        accepted={overrides.tracks?.bans ?? []}
        resolveName={(id) => getTrackById(id)?.name ?? id}
        resolveImage={(id) => getTrackById(id)?.image}
        variant="ban"
        onToggle={(id) => onToggle("tracks", "bans", id)}
      />
      <EditableRow
        label="Top picked modes"
        ids={modesTop.picks}
        rows={results.itemModes.topPicks}
        accepted={overrides.itemModes?.picks ?? []}
        resolveName={(id) => getItemModeById(id)?.name ?? id}
        variant="pick"
        onToggle={(id) => onToggle("itemModes", "picks", id)}
      />
      <EditableRow
        label="Top banned modes"
        ids={modesTop.bans}
        rows={results.itemModes.topBans}
        accepted={overrides.itemModes?.bans ?? []}
        resolveName={(id) => getItemModeById(id)?.name ?? id}
        variant="ban"
        onToggle={(id) => onToggle("itemModes", "bans", id)}
      />
      <EditableRow
        label="Top picked items"
        ids={itemsTop.picks}
        rows={results.itemLiteral.topPicks}
        accepted={overrides.itemLiteral?.picks ?? []}
        resolveName={(id) => getItemById(id)?.name ?? id}
        resolveImage={(id) => getItemById(id)?.image}
        variant="pick"
        onToggle={(id) => onToggle("itemLiteral", "picks", id)}
      />
      <EditableRow
        label="Top banned items"
        ids={itemsTop.bans}
        rows={results.itemLiteral.topBans}
        accepted={overrides.itemLiteral?.bans ?? []}
        resolveName={(id) => getItemById(id)?.name ?? id}
        resolveImage={(id) => getItemById(id)?.image}
        variant="ban"
        onToggle={(id) => onToggle("itemLiteral", "bans", id)}
      />
    </div>
  );
}

function EditableRow({
  label,
  ids,
  rows,
  accepted,
  resolveName,
  resolveImage,
  variant,
  onToggle,
}: {
  label: string;
  ids: string[];
  rows: Array<{ id: string; count: number }>;
  accepted: string[];
  resolveName: (id: string) => string;
  /** Optional artwork URL resolver per id. Pools without images
   *  (modes) just don't pass this prop — tile renders the placeholder. */
  resolveImage?: (id: string) => string | undefined;
  variant: "pick" | "ban";
  onToggle: (id: string) => void;
}) {
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
              {image ? (
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
                  title={
                    isAccepted
                      ? "Click to drop from apply"
                      : "Click to include in apply"
                  }
                >
                  {isAccepted ? "Included" : "Skip"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

