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
import {
  aggregateBallots,
  topN,
} from "@/lib/picks-bans/aggregate";
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
} from "@/lib/randomizers/race";

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

  const aggregateLive: PicksBansResults | null = round
    ? aggregateBallots(ballots, { lockedOnly: false })
    : null;
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
  const apply = () => {
    if (!closedRound) return;
    setError(null);
    startTransition(async () => {
      const res = await applyPicksBansResultsAction(
        sessionSlug,
        closedRound.id,
        { topN: topNValue }
      );
      if (!res.ok) setError(res.error ?? "Failed to apply results.");
    });
  };

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
            {aggregateLive && <ResultsPreview results={aggregateLive} />}
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
        variant="pick"
        onToggle={(id) => onToggle("tracks", "picks", id)}
      />
      <EditableRow
        label="Top banned tracks"
        ids={tracksTop.bans}
        rows={results.tracks.topBans}
        accepted={overrides.tracks?.bans ?? []}
        resolveName={(id) => getTrackById(id)?.name ?? id}
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
        variant="pick"
        onToggle={(id) => onToggle("itemLiteral", "picks", id)}
      />
      <EditableRow
        label="Top banned items"
        ids={itemsTop.bans}
        rows={results.itemLiteral.topBans}
        accepted={overrides.itemLiteral?.bans ?? []}
        resolveName={(id) => getItemById(id)?.name ?? id}
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
  variant,
  onToggle,
}: {
  label: string;
  ids: string[];
  rows: Array<{ id: string; count: number }>;
  accepted: string[];
  resolveName: (id: string) => string;
  variant: "pick" | "ban";
  onToggle: (id: string) => void;
}) {
  if (ids.length === 0) return null;
  const acceptedSet = new Set(accepted);
  const countsById = new Map(rows.map((r) => [r.id, r.count]));
  return (
    <div className="picks-bans__results-row">
      <span className="picks-bans__results-label">{label}:</span>
      <span className="picks-bans__results-chips">
        {ids.map((id) => {
          const isAccepted = acceptedSet.has(id);
          return (
            <button
              key={id}
              type="button"
              className={`picks-bans__result-chip picks-bans__result-chip--${variant}${
                isAccepted ? "" : " picks-bans__result-chip--rejected"
              }`}
              onClick={() => onToggle(id)}
              aria-pressed={isAccepted}
              title={
                isAccepted ? "Click to drop from apply" : "Click to include in apply"
              }
            >
              {resolveName(id)}{" "}
              <span className="picks-bans__result-chip-count">
                {countsById.get(id) ?? 0}
              </span>
            </button>
          );
        })}
      </span>
    </div>
  );
}

function ResultsPreview({ results }: { results: PicksBansResults }) {
  const tracksTop = topN(results.tracks, 5);
  const modesTop = topN(results.itemModes, 5);
  const itemsTop = topN(results.itemLiteral, 5);

  return (
    <div className="picks-bans__results">
      <ResultsRow
        label="Top picked tracks"
        ids={tracksTop.picks}
        rows={results.tracks.topPicks}
        resolveName={(id) => getTrackById(id)?.name ?? id}
        variant="pick"
      />
      <ResultsRow
        label="Top banned tracks"
        ids={tracksTop.bans}
        rows={results.tracks.topBans}
        resolveName={(id) => getTrackById(id)?.name ?? id}
        variant="ban"
      />
      <ResultsRow
        label="Top picked modes"
        ids={modesTop.picks}
        rows={results.itemModes.topPicks}
        resolveName={(id) => getItemModeById(id)?.name ?? id}
        variant="pick"
      />
      <ResultsRow
        label="Top banned modes"
        ids={modesTop.bans}
        rows={results.itemModes.topBans}
        resolveName={(id) => getItemModeById(id)?.name ?? id}
        variant="ban"
      />
      <ResultsRow
        label="Top picked items"
        ids={itemsTop.picks}
        rows={results.itemLiteral.topPicks}
        resolveName={(id) => getItemById(id)?.name ?? id}
        variant="pick"
      />
      <ResultsRow
        label="Top banned items"
        ids={itemsTop.bans}
        rows={results.itemLiteral.topBans}
        resolveName={(id) => getItemById(id)?.name ?? id}
        variant="ban"
      />
    </div>
  );
}

function ResultsRow({
  label,
  ids,
  rows,
  resolveName,
  variant,
}: {
  label: string;
  ids: string[];
  rows: Array<{ id: string; count: number }>;
  resolveName: (id: string) => string;
  variant: "pick" | "ban";
}) {
  if (ids.length === 0) return null;
  const countsById = new Map(rows.map((r) => [r.id, r.count]));
  return (
    <div className="picks-bans__results-row">
      <span className="picks-bans__results-label">{label}:</span>
      <span className="picks-bans__results-chips">
        {ids.map((id) => (
          <span
            key={id}
            className={`picks-bans__result-chip picks-bans__result-chip--${variant}`}
          >
            {resolveName(id)}{" "}
            <span className="picks-bans__result-chip-count">
              {countsById.get(id) ?? 0}
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}
