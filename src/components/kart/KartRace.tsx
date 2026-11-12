"use client";

/**
 * The race screen (client): the game canvas full screen over the page (above
 * the nav), the HUD, touch controls on phones, and the pause and results
 * cards (CascadeDS). The engine (engine/engine.ts, three.js) runs the race and
 * is loaded with a dynamic import when the race opens; this wires it to the
 * page and keeps the best run.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge, Button, Card, IconButton } from "@empac/cascadeds";
import { IconFlag, IconMaximize, IconMinimize, IconPlayerPause, IconPlayerPlay, IconRefresh, IconArrowsShuffle, IconVolume, IconVolume3 } from "@tabler/icons-react";
import { formatDelta, formatTime } from "@/lib/kart/race";
import type { GhostData } from "@/lib/kart/ghost";
import { rollKey, type Roll } from "@/lib/kart/roll";
import { trackKey as keyFor } from "@/lib/kart/track";
import { TRACKS, type RideId } from "@/lib/kart/content";
import { Sound } from "./engine/audio";
import type { EngineHooks, KartEngine, Quality, RaceResult } from "./engine/engine";
import { GAME_KEYS } from "./engine/input";
import type { OwnAvatar } from "./engine/avatars";
import type { CharacterLook } from "@/components/games3d/character/types";
import { keepResult, writeSaves, type TrackBest } from "./saves";

const noop = () => () => {};
const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
const portraitNow = () => typeof window !== "undefined" && window.matchMedia("(orientation: portrait)").matches;
function subscribeOrientation(cb: () => void) {
  const m = window.matchMedia("(orientation: portrait)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

interface Finished extends RaceResult {
  newBest: boolean;
  newBestLap: boolean;
  previous: TrackBest | null;
}

export function KartRace({
  roll,
  own,
  ghost,
  muted,
  debug,
  autopilot = false,
  quality = "auto",
  ride = null,
  look = null,
  bestLapMs,
  onExit,
  onAgain,
  onNewRoll,
}: {
  roll: Roll;
  own: OwnAvatar;
  ghost: GhostData | null;
  muted: boolean;
  debug: boolean;
  /** Development only: the autopilot drives. */
  autopilot?: boolean;
  /** "auto" picks from how the first seconds run; ?quality=low|high pins it. */
  quality?: Quality;
  /** Development only: another ride's model (looks only). */
  ride?: RideId | null;
  /** Development only: the drivers as 3D characters in this look. */
  look?: CharacterLook | null;
  bestLapMs: number | null;
  onExit: () => void;
  onAgain: () => void;
  onNewRoll: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const lapRef = useRef<HTMLSpanElement>(null);
  const debugRef = useRef<HTMLParagraphElement>(null);
  const engineRef = useRef<KartEngine | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const touch = useSyncExternalStore(noop, coarse, () => false);
  const portrait = useSyncExternalStore(subscribeOrientation, portraitNow, () => false);
  const [phase, setPhase] = useState<"loading" | "ready" | "racing" | "done" | "error">("loading");
  const [count, setCount] = useState<number | null>(null);
  const [lap, setLap] = useState(1);
  const [paused, setPaused] = useState(false);
  const [wrongWay, setWrongWay] = useState(false);
  const [split, setSplit] = useState<{ ms: number; n: number } | null>(null);
  const [result, setResult] = useState<Finished | null>(null);
  const [isMuted, setMuted] = useState(muted);
  const [hint, setHint] = useState(true);
  const [full, setFull] = useState(false);
  const [said, setSaid] = useState("");
  const [lapBest, setLapBest] = useState<number | null>(bestLapMs);

  const laps = TRACKS[roll.track]?.laps ?? 3;
  const trackKey = keyFor(roll.track, roll.twist === "mirror");

  // The engine reports pausing back through onPause, whatever started it.
  const pause = useCallback(() => engineRef.current?.pause(), []);
  const resume = useCallback(() => {
    engineRef.current?.resume();
    rootRef.current?.focus();
  }, []);

  // Build the engine, size it, and start the countdown.
  useEffect(() => {
    let live = true;
    const canvas = viewRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ro: ResizeObserver | null = null;
    const hooks: EngineHooks = {
      onCountdown: (n) => {
        setCount(n);
        if (n === 0) {
          setPhase("racing");
          setSaid("Go!");
          setTimeout(() => setCount((c) => (c === 0 ? null : c)), 800);
          setTimeout(() => setHint(false), 2500);
        } else setSaid(String(n));
      },
      onLap: (n, ms) => {
        setLapBest((b) => (b === null || ms < b ? ms : b));
        if (n < laps) {
          setLap(n + 1);
          setSaid(`Lap ${n + 1} of ${laps}`);
        }
      },
      onSplit: (ms) => setSplit((s) => ({ ms, n: (s?.n ?? 0) + 1 })),
      onWrongWay: (on) => setWrongWay(on),
      onPause: (p) => setPaused(p),
      onFinish: (r) => {
        const kept = keepResult(trackKey, r.totalMs, r.lapMs, rollKey(roll), r.ghost);
        setResult({ ...r, ...kept });
        setPhase("done");
        setSaid(`Finished in ${formatTime(r.totalMs)}`);
      },
    };
    const build = async () => {
      // three.js and the engine load only now, when a race opens.
      const { KartEngine } = await import("./engine/engine");
      if (!live) return;
      const engine = await KartEngine.create({
        canvas,
        minimap: mapRef.current,
        roll,
        own,
        ghost,
        hud: { total: totalRef.current, lap: lapRef.current, debug: debugRef.current },
        muted,
        reducedMotion: reduced,
        touch: window.matchMedia("(pointer: coarse)").matches,
        quality,
        ride,
        autopilot,
        look,
        hooks,
      });
      if (!live) {
        engine?.destroy();
        return;
      }
      if (!engine) {
        setPhase("error");
        return;
      }
      engineRef.current = engine;
      const fit = () => {
        const r = root.getBoundingClientRect();
        engine.resize(r.width, r.height, window.devicePixelRatio || 1);
      };
      fit();
      ro = new ResizeObserver(fit);
      ro.observe(root);
      setPhase("ready");
      engine.start();
    };
    build().catch(() => {
      if (live) setPhase("error");
    });
    return () => {
      live = false;
      ro?.disconnect();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    // The race is built once per mount (Race again remounts it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard, tab hidden, page scroll lock.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        if (eng.isPaused) resume();
        else pause();
        e.preventDefault();
        return;
      }
      const target = e.target as HTMLElement | null;
      // Let buttons work with Space and Enter.
      if (target && target.closest("button") && (e.code === "Space" || e.code === "Enter")) return;
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        eng.controls.keyDown(e.code);
      }
    };
    const up = (e: KeyboardEvent) => engineRef.current?.controls.keyUp(e.code);
    const hidden = () => {
      if (document.hidden) pause();
    };
    const blur = () => engineRef.current?.controls.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    const fs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("fullscreenchange", fs);
      document.body.style.overflow = before;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [pause, resume]);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);
  useEffect(() => {
    if (paused) rootRef.current?.querySelector<HTMLButtonElement>(".kart-resume")?.focus();
  }, [paused]);
  useEffect(() => {
    if (!split) return;
    const t = setTimeout(() => setSplit(null), 2200);
    return () => clearTimeout(t);
  }, [split]);

  const toggleMute = () => {
    const next = !isMuted;
    setMuted(next);
    engineRef.current?.setMuted(next);
    writeSaves((s) => ({ ...s, muted: next }));
  };

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  // Touch: hold either half of the screen to steer.
  const halves = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse") return;
      Sound.prime();
      e.currentTarget.setPointerCapture(e.pointerId);
      engineRef.current?.controls.touch(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
      engineRef.current?.controls.touch(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => engineRef.current?.controls.touch(e.pointerId, null),
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => engineRef.current?.controls.touch(e.pointerId, null),
  };
  const driftProps = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      engineRef.current?.controls.drift(true);
    },
    onPointerUp: () => engineRef.current?.controls.drift(false),
    onPointerCancel: () => engineRef.current?.controls.drift(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const canFull = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const lapShown = Math.min(lap, laps);

  return (
    <div ref={rootRef} className={`kart-race${touch ? " kart-race--touch" : ""}`} role="region" aria-label="Shuffle Kart race" tabIndex={-1}>
      <canvas ref={viewRef} className="kart-race__view" aria-hidden />
      {touch && phase !== "done" && <div className="kart-race__halves" aria-hidden {...halves} />}

      <div className="kart-hud">
        <div className="kart-hud__times">
          <p className="kart-hud__lap">
            Lap {lapShown} of {laps}
          </p>
          <p className="kart-hud__total">
            <span ref={totalRef}>0:00.00</span>
          </p>
          <p className="kart-hud__small">
            This lap <span ref={lapRef}>0:00.00</span>
          </p>
          {lapBest !== null && <p className="kart-hud__small">Best lap {formatTime(lapBest)}</p>}
        </div>
        <div className="kart-hud__side">
          <div className="kart-hud__buttons">
            <IconButton variant="secondary" size="medium" aria-label={isMuted ? "Turn sound on" : "Mute sound"} aria-pressed={isMuted} onClick={toggleMute}>
              {isMuted ? <IconVolume3 size={22} aria-hidden /> : <IconVolume size={22} aria-hidden />}
            </IconButton>
            {canFull && (
              <IconButton variant="secondary" size="medium" aria-label={full ? "Leave full screen" : "Full screen"} onClick={toggleFull}>
                {full ? <IconMinimize size={22} aria-hidden /> : <IconMaximize size={22} aria-hidden />}
              </IconButton>
            )}
            <IconButton variant="secondary" size="medium" aria-label="Pause" onClick={pause} disabled={phase === "done" || phase === "loading"}>
              <IconPlayerPause size={22} aria-hidden />
            </IconButton>
          </div>
          <canvas ref={mapRef} className="kart-hud__map" width={120} height={120} aria-hidden />
        </div>

        {count !== null && (
          <p className={`kart-hud__count${count === 0 ? " kart-hud__count--go" : ""}`} aria-hidden>
            {count === 0 ? "GO!" : count}
          </p>
        )}
        {wrongWay && <p className="kart-hud__banner kart-hud__banner--warn">Wrong way</p>}
        {split && (
          <p key={split.n} className={`kart-hud__banner ${split.ms <= 0 ? "kart-hud__banner--ahead" : "kart-hud__banner--behind"}`}>
            {formatDelta(split.ms)} on your ghost
          </p>
        )}
        {hint && phase !== "done" && (
          <div className="kart-hud__hint">
            {touch ? <p>Hold the left or right side to steer. Hold Drift with your other thumb through a bend, then let go to boost.</p> : <p>Up or W to drive, left and right to steer, Space to drift. Escape pauses.</p>}
            {touch && portrait && <p>Turn your phone sideways for a wider view.</p>}
          </div>
        )}
        {debug && <p ref={debugRef} className="kart-hud__debug" />}
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
      </div>

      {touch && phase !== "done" && (
        <>
          <Button variant="secondary" size="large" className="kart-drift kart-drift--left" {...driftProps}>
            Drift
          </Button>
          <Button variant="secondary" size="large" className="kart-drift kart-drift--right" {...driftProps}>
            Drift
          </Button>
        </>
      )}

      {phase === "loading" && (
        <div className="kart-race__cover">
          <p className="kart-race__loading">Getting the track ready</p>
        </div>
      )}

      {phase === "error" && (
        <div className="kart-race__cover">
          <Card variant="elevated" padding="large" className="kart-card">
            <h2 className="kart-card__title">This browser can&apos;t draw the race</h2>
            <p className="kart-card__line">Shuffle Kart needs WebGL 2, which is turned off or not available here. Try another browser.</p>
            <div className="kart-card__actions">
              <Button variant="primary" onClick={onExit}>
                Back
              </Button>
            </div>
          </Card>
        </div>
      )}

      {paused && phase !== "done" && (
        <div className="kart-race__cover">
          <Card variant="elevated" padding="large" className="kart-card" aria-label="Paused">
            <h2 className="kart-card__title">Paused</h2>
            <div className="kart-card__actions kart-card__actions--stack">
              <Button variant="primary" className="kart-resume" iconBefore={IconPlayerPlay} onClick={resume} fullWidth>
                Resume
              </Button>
              <Button variant="secondary" iconBefore={IconRefresh} onClick={onAgain} fullWidth>
                Restart the race
              </Button>
              <Button variant="ghost" onClick={onExit} fullWidth>
                Back to the roll
              </Button>
            </div>
          </Card>
        </div>
      )}

      {result && (
        <div className="kart-race__cover">
          <Card variant="elevated" padding="large" className="kart-card kart-results">
            <div className="kart-results__head">
              <h2 ref={resultRef} tabIndex={-1} className="kart-card__title">
                Finished
              </h2>
              {result.newBest && <Badge variant="success">New best</Badge>}
            </div>
            <p className="kart-results__time">{formatTime(result.totalMs)}</p>
            <p className="kart-card__line">
              {result.previous && !result.newBest
                ? `${formatDelta(result.totalMs - result.previous.totalMs)} on your best (${formatTime(result.previous.totalMs)}).`
                : result.previous
                  ? `${formatDelta(result.totalMs - result.previous.totalMs)} on your old best. This run is your ghost now.`
                  : "Your first time here. This run is your ghost now."}
            </p>
            <ol className="kart-results__laps">
              {result.lapMs.map((ms, i) => {
                const fastest = i === result.lapMs.indexOf(Math.min(...result.lapMs));
                return (
                  <li key={i} className={fastest ? "kart-results__lap--best" : undefined}>
                    <span>Lap {i + 1}</span>
                    <span>
                      {formatTime(ms)}
                      {fastest ? (result.newBestLap ? " (best lap yet)" : " (fastest)") : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="kart-card__actions">
              <Button variant="primary" iconBefore={IconFlag} onClick={onAgain}>
                Race again
              </Button>
              <Button variant="secondary" iconBefore={IconArrowsShuffle} onClick={onNewRoll}>
                New roll
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
