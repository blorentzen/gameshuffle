"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Radio, RadioGroup } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { RaceSelector } from "@/components/randomizer/RaceSelector";
import { RoundDirectiveView } from "@/components/tournament/TournamentRounds";
import { randomizerGameMeta } from "@/data/randomizer-games";
import type { TournamentRandomizerConfig, GeneratedRound, RandomizerCadence, LivePointer } from "@/lib/tournaments/randomizer";

/**
 * Organizer control for randomized rounds. Configure which dimensions to
 * randomize (tracks / combo / items), the cadence, and how many rounds, then
 * generate + reveal. Restrictions are inherited from the tournament's build
 * rules automatically. Live reveal is Circuit-gated (server-enforced).
 */

const DEFAULT: TournamentRandomizerConfig = {
  enabled: false,
  dimensions: { tracks: { count: 4, noDups: true, tourOnly: false } },
  cadence: "reveal_live",
  rounds: 4,
};

export function TournamentRandomizerCard({
  tournamentId,
  gameSlug,
  initialConfig,
  initialRounds,
  initialLive,
  syncedLive,
}: {
  tournamentId: string;
  gameSlug: string;
  initialConfig?: TournamentRandomizerConfig | null;
  initialRounds?: GeneratedRound[];
  initialLive?: LivePointer | null;
  /** Authoritative live pointer from the parent's realtime tournament state,
   *  so score-triggered auto-advances (which bypass this card) still reflect. */
  syncedLive?: LivePointer | null;
}) {
  const toast = useToast();
  const meta = randomizerGameMeta(gameSlug);
  const [config, setConfig] = useState<TournamentRandomizerConfig>(initialConfig ?? DEFAULT);
  const [rounds, setRounds] = useState<GeneratedRound[]>(initialRounds ?? []);
  const [live, setLive] = useState<LivePointer | null>(initialLive ?? null);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Auto-save: skip the initial mount, debounce user edits.
  const hydratedRef = useRef(false);
  const saveTimer = useRef<number | null>(null);

  // Keep the pointer in sync with the server (e.g. auto-advance on score).
  // Depend on the primitives, not the object, to avoid re-running on every
  // parent render (new object identity).
  useEffect(() => {
    setLive(syncedLive ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedLive?.round, syncedLive?.race]);

  const d = config.dimensions;
  const setDim = (patch: Partial<TournamentRandomizerConfig["dimensions"]>) =>
    setConfig((c) => ({ ...c, dimensions: { ...c.dimensions, ...patch } }));

  // Persist config to the server. Quiet (no toast) for auto-save; never echoes
  // the server config back into local state, so the auto-save effect can't loop.
  const persistConfig = async (next: TournamentRandomizerConfig) => {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/randomizer`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: next }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        if (!j.config.enabled) setRounds([]);
        setSaveState("saved");
      } else {
        setSaveState("error");
        toast.error("Couldn't save randomizer settings. Try again.");
      }
    } catch {
      setSaveState("error");
      toast.error("Network error saving randomizer settings.");
    }
  };

  // Auto-save config edits (debounced), like the rest of the tournament editor.
  useEffect(() => {
    if (!hydratedRef.current) { hydratedRef.current = true; return; }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void persistConfig(config); }, 700);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Ensure a pending debounced save lands before an action reads stored config.
  const flushConfig = async () => {
    if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; await persistConfig(config); }
  };

  const act = async (action: string, n?: number) => {
    setBusy(true);
    try {
      await flushConfig();
      const res = await fetch(`/api/tournament/${tournamentId}/randomizer`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, n }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        if (Array.isArray(j.rounds)) setRounds(j.rounds);
        setLive((j.live ?? null) as LivePointer | null);
        if (action === "reveal_next") toast.success("Round revealed to viewers.");
        if (action === "start_live" || action === "advance") toast.success("Now racing updated for viewers.");
      } else if (j?.error === "circuit_required") {
        toast.error("Live reveal requires a GS Circuit subscription.");
      } else if (j?.error === "randomizer_disabled") {
        toast.error("Turn on the randomizer and save first.");
      } else {
        toast.error("Couldn't do that. Try again.");
      }
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  };

  const revealedCount = rounds.filter((r) => r.revealed).length;

  return (
    <div className="comp-card" style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, marginBottom: "0.5rem" }}>Randomized rounds</h2>
      <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
        Everyone runs the same randomized tracks, combo, and/or items each round — generated from this tournament&rsquo;s
        build rules automatically. Live reveal to viewers requires GS Circuit.
      </p>

      <Checkbox
        checked={config.enabled}
        onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
        label="Enable randomized rounds"
      />

      {config.enabled && (
        <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Dimensions */}
          <div>
            <div className="account-card__label" style={{ marginBottom: "0.5rem" }}>What to randomize</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {(!meta || meta.tracks) && (
              <div>
                <Checkbox
                  checked={!!d.tracks}
                  onChange={(e) => setDim({ tracks: e.target.checked ? { count: 4, noDups: true, tourOnly: false } : undefined })}
                  label="Tracks — a shared set of randomized races"
                />
                {d.tracks && (
                  <div style={{ display: "flex", gap: "1.25rem", rowGap: "0.75rem", alignItems: "center", flexWrap: "wrap", margin: "0.5rem 0 0 1.75rem" }}>
                    <span style={{ flex: "none" }}>
                      <RaceSelector
                        value={d.tracks.count}
                        onChange={(n) => setDim({ tracks: { ...d.tracks!, count: n } })}
                        label="Races"
                        counts={[4, 6, 8, 12, 16, 24, 32]}
                      />
                    </span>
                    <span style={{ flex: "none" }}>
                      <Checkbox checked={d.tracks.noDups} onChange={(e) => setDim({ tracks: { ...d.tracks!, noDups: e.target.checked } })} label="No duplicates" />
                    </span>
                    {(!meta || meta.tourOnly) && (
                      <span style={{ flex: "none" }}>
                        <Checkbox checked={d.tracks.tourOnly} onChange={(e) => setDim({ tracks: { ...d.tracks!, tourOnly: e.target.checked } })} label="Tour tracks only" />
                      </span>
                    )}
                  </div>
                )}
              </div>
              )}
              {(!meta || meta.combo) && (
                <div>
                  <Checkbox checked={!!d.combo} onChange={(e) => setDim({ combo: e.target.checked ? true : undefined, comboPerPlayer: e.target.checked ? d.comboPerPlayer : undefined })} label="Combo — a kart build everyone runs" />
                  {d.combo && (
                    <div style={{ margin: "0.5rem 0 0 1.75rem" }}>
                      <Checkbox checked={!!d.comboPerPlayer} onChange={(e) => setDim({ comboPerPlayer: e.target.checked ? true : undefined })} label="A different combo per player" />
                    </div>
                  )}
                </div>
              )}
              {(!meta || meta.items) && (
              <div>
                <Checkbox
                  checked={!!d.items}
                  onChange={(e) => setDim({ items: e.target.checked ? { count: 5 } : undefined })}
                  label="Items — a randomized item set"
                />
                {d.items && (
                  <div style={{ margin: "0.5rem 0 0 1.75rem" }}>
                    <RaceSelector
                      value={d.items.count}
                      onChange={(n) => setDim({ items: { count: n } })}
                      label="Items"
                      counts={[3, 5, 8, 10, 15, 20, 30, 40]}
                    />
                  </div>
                )}
              </div>
              )}
            </div>
          </div>

          {/* Cadence + rounds */}
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div className="account-card__label" style={{ marginBottom: "0.5rem" }}>Cadence</div>
              <RadioGroup name="rand-cadence" value={config.cadence} onChange={(v) => setConfig((c) => ({ ...c, cadence: v as RandomizerCadence }))}>
                <Radio value="reveal_live" label="Reveal live, round by round" />
                <Radio value="pre_all" label="Generate all up front" />
                <Radio value="per_race" label="Per-race (fresh combo each race)" />
              </RadioGroup>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span className="account-card__label">Rounds</span>
              <RaceSelector
                value={config.rounds}
                onChange={(n) => setConfig((c) => ({ ...c, rounds: n }))}
                label="Rounds"
                counts={[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32]}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            {config.cadence === "pre_all" && <Button variant="secondary" size="small" onClick={() => act("generate_all")} disabled={busy}>Generate all rounds</Button>}
            <Button variant="secondary" size="small" onClick={() => act("reveal_next")} disabled={busy}>Reveal next round</Button>
            {rounds.length > 0 && <Button variant="ghost" size="small" onClick={() => { if (window.confirm("Clear all generated rounds?")) act("clear"); }} disabled={busy}>Clear</Button>}
            <span style={{ fontSize: "var(--font-size-12)", color: saveState === "error" ? "var(--error-600, #c11a10)" : "var(--text-tertiary)", marginLeft: "auto" }}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}
            </span>
          </div>

          {/* Live "Now racing" — pushes the current round/race to viewers live. */}
          {revealedCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", padding: "0.75rem 0", borderTop: "1px solid var(--border-subtle, var(--border-default))" }}>
              <span style={{ fontSize: "var(--font-size-14)", fontWeight: 600 }}>
                Now racing:{" "}
                {live ? <span style={{ color: "var(--bg-primary, var(--primary-600))" }}>Round {live.round}{live.race > 1 ? ` · Race ${live.race}` : ""}</span> : <span style={{ color: "var(--text-tertiary)" }}>not started</span>}
              </span>
              {!live
                ? <Button variant="primary" size="small" onClick={() => act("start_live")} disabled={busy}>Start live</Button>
                : <>
                    <Button variant="primary" size="small" onClick={() => act("advance")} disabled={busy}>Advance →</Button>
                    <Button variant="ghost" size="small" onClick={() => act("reset_live")} disabled={busy}>Reset live</Button>
                  </>}
            </div>
          )}

          {/* Generated rounds */}
          {rounds.length > 0 && (
            <div className="tr-rounds">
              <div style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "0.5rem" }}>{revealedCount} of {rounds.length} revealed</div>
              {rounds.map((r) => (
                <div key={r.n} className={`tr-round${r.revealed ? " tr-round--revealed" : " tr-round--draft"}`}>
                  <div className="tr-round__head">
                    Round {r.n}
                    <span className={`tr-round__status tr-round__status--${r.revealed ? "revealed" : "draft"}`}>{r.revealed ? "Revealed" : "Draft"}</span>
                    {r.rerolls ? <span className="tr-round__rerolls">rerolled {r.rerolls}×</span> : null}
                    {!r.revealed && <Button variant="ghost" size="small" onClick={() => act("reroll", r.n)} disabled={busy}>Re-roll</Button>}
                  </div>
                  <RoundDirectiveView directive={r.directive} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
