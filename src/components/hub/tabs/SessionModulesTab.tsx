"use client";

/**
 * Modules tab — multi-game configuration surface.
 *
 * Carousel of horizontal "category chips" — GS Queue (always first)
 * followed by every configured game in play order. Click a chip to
 * swap which slice the streamer is editing.
 *
 * Each per-game view renders that game's module configurators (race
 * randomizer + the picks/bans / kart-randomizer module list). GS Queue's
 * view is queue-only — no per-game modules apply, since GS Queue is the
 * universal floor for unsupported categories.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Input } from "@empac/cascadeds";
import { CommandList } from "../CommandList";
import { GameCarousel } from "../GameCarousel";
import { PicksBansRoundPanel } from "../PicksBansRoundPanel";
import { RaceRandomizerSection } from "../RaceRandomizerSection";
import { GameArtwork } from "../GameArtwork";
import { GS_DEFAULT_SLUG, isSupportedGame } from "@/lib/games/artwork";
import { updateQueueConfigAction } from "@/app/hub/sessions/[slug]/actions";
import type { RaceRandomizerConfig } from "@/lib/modules/types";
import type { RaceGame } from "@/lib/randomizers/race";

interface Props {
  sessionId: string;
  /** Session slug (for the queue-config server action). */
  sessionSlug: string;
  configuredGames: string[];
  /** Raw `session_modules.config` blob for race_randomizer (or null). */
  rawRaceConfig: Record<string, unknown> | null;
  initialQueueCap: number;
  initialQueueRotation: "fifo" | "random";
  raceSessionLive: boolean;
}

export function SessionModulesTab({
  sessionId,
  sessionSlug,
  configuredGames,
  rawRaceConfig,
  initialQueueCap,
  initialQueueRotation,
  raceSessionLive,
}: Props) {
  // Default selection: GS Queue when nothing is configured yet, else
  // the first declared game. The streamer can swap via the carousel.
  const initialSelected =
    configuredGames[0] ?? GS_DEFAULT_SLUG;
  const [selectedSlug, setSelectedSlug] = useState<string>(initialSelected);

  const sliceForSelected = useMemo(
    () => sliceRaceConfig(rawRaceConfig, selectedSlug, configuredGames[0]),
    [rawRaceConfig, selectedSlug, configuredGames]
  );

  const isQueueSelected = selectedSlug === GS_DEFAULT_SLUG;
  const raceGame: RaceGame | null = isSupportedGame(selectedSlug)
    ? slugToRaceGame(selectedSlug)
    : null;

  return (
    <div className="hub-detail__section-stack">
      {configuredGames.length === 0 && (
        <Alert variant="info">
          No games declared yet. Set the GS Queue defaults below for
          unsupported categories, then head to the <strong>Settings</strong>{" "}
          tab to declare which games you plan to host.
        </Alert>
      )}

      <GameCarousel
        configuredGames={configuredGames}
        selectedSlug={selectedSlug}
        onSelect={setSelectedSlug}
      />

      {isQueueSelected ? (
        <>
          <GsQueueModule
            sessionSlug={sessionSlug}
            initialCap={initialQueueCap}
            initialRotation={initialQueueRotation}
          />
          <CommandList gameSlug={GS_DEFAULT_SLUG} />
        </>
      ) : (
        <PerGameModules
          key={selectedSlug}
          sessionId={sessionId}
          sessionSlug={sessionSlug}
          gameSlug={selectedSlug}
          raceGame={raceGame}
          raceConfig={sliceForSelected}
          raceSessionLive={raceSessionLive}
        />
      )}
    </div>
  );
}

// ---------- GS Queue module ----------

interface GsQueueModuleProps {
  sessionSlug: string;
  initialCap: number;
  initialRotation: "fifo" | "random";
}

const SAVE_DEBOUNCE_MS = 500;

function GsQueueModule({
  sessionSlug,
  initialCap,
  initialRotation,
}: GsQueueModuleProps) {
  const [cap, setCap] = useState<number>(initialCap);
  const [rotation, setRotation] = useState<"fifo" | "random">(initialRotation);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const initialMounted = useRef(false);

  useEffect(() => {
    // Skip the initial mount — only save on actual user edits, not on
    // hydration of the server-passed initial values.
    if (!initialMounted.current) {
      initialMounted.current = true;
      return;
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      setSaving(true);
      setError(null);
      const result = await updateQueueConfigAction(sessionSlug, {
        cap,
        rotation,
      });
      setSaving(false);
      if (!result.ok) {
        setError(result.error ?? "Save failed.");
        return;
      }
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [cap, rotation, sessionSlug]);

  return (
    <section className="hub-detail__section">
      <div className="hub-detail__section-title hub-detail__queue-title">
        <GameArtwork slug={GS_DEFAULT_SLUG} size="thumb" />
        <span>GS Queue</span>
      </div>

      <Card variant="outlined" padding="medium">
        <p className="hub-detail__panel-text">
          The universal queue. Always available. When Twitch reports a
          category that isn&rsquo;t one of your configured games, GS
          falls back here so viewers can still <code>!gs-join</code>{" "}
          and ride along.
        </p>

        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {savedFlash && !saving && !error && (
          <Alert variant="success">Saved.</Alert>
        )}

        <div className="hub-form__field-stack">
          <label className="hub-form__field">
            <span className="hub-form__label">Queue cap</span>
            <Input
              type="number"
              min={1}
              max={200}
              value={String(cap)}
              onChange={(e) =>
                setCap(
                  Math.max(
                    1,
                    Math.min(200, parseInt(e.target.value || "20", 10))
                  )
                )
              }
            />
            <p className="hub-form__platform-disabled">
              Max viewers (plus the streamer) in the queue at once. Default
              20 — bump up for larger parties, down for smaller groups.
            </p>
          </label>

          <div className="hub-form__field">
            <span className="hub-form__label">Rotation</span>
            <div className="hub-form__action-row">
              <Button
                variant={rotation === "fifo" ? "primary" : "secondary"}
                onClick={() => setRotation("fifo")}
              >
                First in, first out
              </Button>
              <Button
                variant={rotation === "random" ? "primary" : "secondary"}
                onClick={() => setRotation("random")}
              >
                Random pull
              </Button>
            </div>
            <p className="hub-form__platform-disabled">
              FIFO honors join order. Random shuffles every pull — feels
              like a raffle.
            </p>
          </div>

          {saving && (
            <span className="hub-form__platform-disabled">Saving…</span>
          )}
        </div>
      </Card>
    </section>
  );
}

// ---------- Per-game module surface ----------

interface PerGameModulesProps {
  sessionId: string;
  sessionSlug: string;
  gameSlug: string;
  raceGame: RaceGame | null;
  raceConfig: RaceRandomizerConfig | null;
  raceSessionLive: boolean;
}

function PerGameModules({
  sessionId,
  sessionSlug,
  gameSlug,
  raceGame,
  raceConfig,
  raceSessionLive,
}: PerGameModulesProps) {
  // Per-game module configurators are the canonical surface — picks /
  // bans / mode toggles live inside each module's own card. We don't
  // render a separate "Modules" toggle list here; the streamer just
  // toggles `enabled` on the module card itself.
  return (
    <>
      <PicksBansRoundPanel
        sessionId={sessionId}
        sessionSlug={sessionSlug}
        gameSlug={gameSlug}
        sessionLive={raceSessionLive}
      />
      <RaceRandomizerSection
        sessionId={raceSessionLive ? sessionId : null}
        sessionSlug={sessionSlug}
        game={raceGame}
        gameSlug={gameSlug}
        initial={raceConfig}
      />
      <CommandList gameSlug={gameSlug} />
    </>
  );
}

// ---------- helpers ----------

function sliceRaceConfig(
  raw: Record<string, unknown> | null,
  selectedSlug: string,
  legacyDefaultSlug: string | undefined
): RaceRandomizerConfig | null {
  if (!raw) return null;
  if (
    typeof raw.per_game === "object" &&
    raw.per_game !== null &&
    !Array.isArray(raw.per_game)
  ) {
    const perGame = raw.per_game as Record<string, unknown>;
    const slice = perGame[selectedSlug];
    if (slice) return slice as RaceRandomizerConfig;
    return null;
  }
  if (legacyDefaultSlug && selectedSlug === legacyDefaultSlug) {
    return raw as unknown as RaceRandomizerConfig;
  }
  return null;
}

function slugToRaceGame(slug: string): RaceGame | null {
  if (slug === "mario-kart-8-deluxe") return "mk8dx";
  if (slug === "mario-kart-world") return "mkworld";
  return null;
}
