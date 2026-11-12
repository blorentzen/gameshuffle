"use client";

/**
 * A run (client): the game canvas full screen over the page (above the nav),
 * the HUD (hearts, score, the level's progress, your weapon, pause, mute, full
 * screen), the controls, and the pause, Level cleared and run over cards
 * (CascadeDS). The engine (engine/engine.ts, three.js) is loaded with a dynamic
 * import when the run opens; this wires it to the page and keeps your best score.
 *
 * Controls on a phone: the left half flies (the Fly button marks the spot) and
 * the right half is a floating fire stick (press to fire, drag to aim; the
 * resting ring marks the spot). Both thumbs work at once. With a mouse: it aims
 * (a crosshair follows it) and the left button fires. The Fly button and the
 * fire stick are game controls with no CascadeDS counterpart.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge, Button, Card, IconButton, Progress } from "@empac/cascadeds";
import {
  IconArrowLeft,
  IconBolt,
  IconFlag,
  IconHeart,
  IconHeartFilled,
  IconMaximize,
  IconMinimize,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconTarget,
  IconTrophy,
  IconVolume,
  IconVolume3,
  IconArrowsSplit2,
  IconCrosshair,
  IconRocket,
} from "@tabler/icons-react";
import { COURSE_NAME, GAME_NAME, WEAPON_NAMES, type WeaponKind } from "@/lib/airtime/content";
import type { LevelStats, Run } from "@/lib/airtime/sim";
import { TUNING } from "@/lib/airtime/tuning";
import { Sound } from "./engine/audio";
import type { OwnAvatar } from "./engine/avatar";
import type { AirtimeEngine, EngineHooks, Quality, Status } from "./engine/engine";
import { GAME_KEYS, STICK } from "./engine/input";
import { keepScore, writeSaves } from "./saves";

const noop = () => () => {};
const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
const portraitNow = () => typeof window !== "undefined" && window.matchMedia("(orientation: portrait)").matches;
function subscribeOrientation(cb: () => void) {
  const m = window.matchMedia("(orientation: portrait)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

const WEAPON_ICON: Record<WeaponKind, typeof IconTarget> = { blaster: IconTarget, spread: IconArrowsSplit2, rapid: IconBolt };

function clock(ticks: number): string {
  const s = Math.round(ticks / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const n = (v: number) => v.toLocaleString("en-US");

interface Ended {
  kind: "over" | "banked";
  score: number;
  levels: number;
  meters: number;
  enemies: number;
  newBest: boolean;
  previous: number;
}

export function AirtimeRun({
  seed,
  own,
  muted,
  best,
  debug,
  autopilot = false,
  quality = "auto",
  startLevel = 1,
  onExit,
  onAgain,
}: {
  seed: number;
  own: OwnAvatar;
  muted: boolean;
  best: number;
  debug: boolean;
  /** Development only: the autopilot plays. */
  autopilot?: boolean;
  quality?: Quality;
  /** Development only: start further in. */
  startLevel?: number;
  onExit: () => void;
  onAgain: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const popsRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLParagraphElement>(null);
  const engineRef = useRef<AirtimeEngine | null>(null);
  const cardRef = useRef<HTMLHeadingElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const crossRef = useRef<HTMLDivElement>(null);
  /** Which control each finger is on. */
  const roles = useRef(new Map<number, "fly" | "stick" | "mouse">());

  const touch = useSyncExternalStore(noop, coarse, () => false);
  const portrait = useSyncExternalStore(subscribeOrientation, portraitNow, () => false);
  const [phase, setPhase] = useState<"loading" | "playing" | "cleared" | "ended" | "error">("loading");
  const [status, setStatus] = useState<Status>({ hearts: TUNING.hearts, weapon: "blaster", weaponSecs: 0, level: startLevel, progress: 0 });
  const [paused, setPaused] = useState(false);
  const [cleared, setCleared] = useState<{ stats: LevelStats; score: number } | null>(null);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: string; n: number } | null>(null);
  const [isMuted, setMuted] = useState(muted);
  const [hint, setHint] = useState(true);
  const [full, setFull] = useState(false);
  const [said, setSaid] = useState("");
  const [hurtN, setHurtN] = useState(0);

  const pause = useCallback(() => engineRef.current?.pause(), []);
  const resume = useCallback(() => {
    engineRef.current?.resume();
    rootRef.current?.focus();
  }, []);

  // Build the engine, size it, and start.
  useEffect(() => {
    let live = true;
    const canvas = viewRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ro: ResizeObserver | null = null;
    const finish = (run: Run, kind: Ended["kind"]) => {
      const levels = run.cleared.length;
      const kept = keepScore(run.score, levels);
      setEnded({ kind, score: run.score, levels, meters: Math.round(run.meters), enemies: run.cleared.reduce((s, c) => s + c.enemies, 0) + (kind === "over" ? run.stats.enemies : 0), ...kept });
      setPhase("ended");
    };
    const hooks: EngineHooks = {
      onStatus: (s) => setStatus(s),
      onCleared: (stats, run) => {
        setCleared({ stats, score: run.score });
        setPhase("cleared");
      },
      onOver: (run) => finish(run, "over"),
      onPause: (p) => setPaused(p),
      onSay: (t) => setSaid(t),
      onBanner: (text, tone) => setBanner((b) => ({ text, tone, n: (b?.n ?? 0) + 1 })),
      onHurt: () => setHurtN((k) => k + 1),
      // Development (autopilot): show its inputs on the on-screen controls and the crosshair.
      onInput: (input) => {
        flyRef.current?.classList.toggle("airtime-fly--on", input.hold);
        const r = STICK.reach * 0.8;
        const a = (input.aim * Math.PI) / 180;
        stickRef.current?.classList.toggle("airtime-stick--on", input.fire);
        if (knobRef.current) knobRef.current.style.transform = input.fire ? `translate(${Math.cos(a) * r}px, ${-Math.sin(a) * r}px)` : "";
        const gun = engineRef.current?.gunOnScreen();
        const cross = crossRef.current;
        if (cross && gun) {
          cross.style.transform = `translate(${gun.x + Math.cos(a) * 190}px, ${gun.y - Math.sin(a) * 190}px)`;
          cross.classList.add("airtime-cross--on");
        }
      },
    };
    const build = async () => {
      const { AirtimeEngine } = await import("./engine/engine");
      if (!live) return;
      const engine = await AirtimeEngine.create({
        canvas,
        pops: popsRef.current,
        hud: { score: scoreRef.current, debug: debugRef.current },
        seed,
        startLevel,
        own,
        muted,
        reducedMotion: reduced,
        touch: window.matchMedia("(pointer: coarse)").matches,
        quality,
        autopilot,
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
      setPhase("playing");
      engine.start();
      // Development: what the check and screenshot scripts read.
      if (debug || autopilot) (window as unknown as { __airtime?: unknown }).__airtime = { state: () => engine.devState(), freeze: (ms: number) => engine.freeze(ms) };
    };
    build().catch(() => {
      if (live) setPhase("error");
    });
    return () => {
      live = false;
      ro?.disconnect();
      engineRef.current?.destroy();
      engineRef.current = null;
      delete (window as unknown as { __airtime?: unknown }).__airtime;
    };
    // A run is built once per mount (Play again remounts it).
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
      if (target && target.closest("button, a") && (e.code === "Space" || e.code === "Enter")) return;
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) Sound.prime();
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

  // The start hint goes after a few seconds.
  useEffect(() => {
    if (phase !== "playing") return;
    const t = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner((b) => (b && b.n === banner.n ? null : b)), 1500);
    return () => clearTimeout(t);
  }, [banner]);
  useEffect(() => {
    if (cleared || ended) cardRef.current?.focus();
  }, [cleared, ended]);
  useEffect(() => {
    if (paused) rootRef.current?.querySelector<HTMLButtonElement>(".airtime-resume")?.focus();
  }, [paused]);

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
  const goOn = () => {
    setCleared(null);
    setPhase("playing");
    engineRef.current?.continueRun();
    rootRef.current?.focus();
  };
  const bankIt = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.bankScore();
    const run = eng.state;
    const kept = keepScore(run.score, run.cleared.length);
    setCleared(null);
    setEnded({ kind: "banked", score: run.score, levels: run.cleared.length, meters: Math.round(run.meters), enemies: run.cleared.reduce((s, c) => s + c.enemies, 0), ...kept });
    setPhase("ended");
  };

  // Touch: the left half flies, the right half is the fire stick. Mouse: aims, the left button fires.
  const at = (e: React.PointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  const placeStick = (x: number, y: number, w: number, h: number) => {
    const el = stickRef.current;
    if (!el) return;
    // Keep the ring on screen and below the top HUD.
    const half = el.offsetWidth / 2;
    const cx = Math.max(w / 2 + half, Math.min(w - half - 4, x));
    const cy = Math.max(half + 96, Math.min(h - half - 4, y));
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.classList.add("airtime-stick--on", "airtime-stick--float");
    return { cx, cy };
  };
  const restStick = () => {
    const el = stickRef.current;
    if (!el) return;
    el.style.left = "";
    el.style.top = "";
    el.classList.remove("airtime-stick--on", "airtime-stick--float");
    if (knobRef.current) knobRef.current.style.transform = "";
  };
  const letGo = (id: number) => {
    const role = roles.current.get(id);
    roles.current.delete(id);
    const c = engineRef.current?.controls;
    if (!c) return;
    if (role === "fly") {
      c.fly(id, false);
      if (![...roles.current.values()].includes("fly")) flyRef.current?.classList.remove("airtime-fly--on");
    } else if (role === "stick") {
      c.stickEnd(id);
      restStick();
    } else if (role === "mouse") c.mouseFire(false);
  };
  const press = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      const c = engineRef.current?.controls;
      if (!c) return;
      Sound.prime();
      const p = at(e);
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        roles.current.set(e.pointerId, "mouse");
        c.mouseMove(p.x, p.y);
        c.mouseFire(true);
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      if (p.x < p.w / 2 || c.stick) {
        roles.current.set(e.pointerId, "fly");
        c.fly(e.pointerId, true);
        flyRef.current?.classList.add("airtime-fly--on");
      } else {
        roles.current.set(e.pointerId, "stick");
        const spot = placeStick(p.x, p.y, p.w, p.h) ?? { cx: p.x, cy: p.y };
        c.stickStart(e.pointerId, spot.cx, spot.cy);
      }
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const c = engineRef.current?.controls;
      if (!c) return;
      const p = at(e);
      if (e.pointerType === "mouse") {
        c.mouseMove(p.x, p.y);
        const cross = crossRef.current;
        if (cross) {
          cross.style.transform = `translate(${p.x}px, ${p.y}px)`;
          cross.classList.add("airtime-cross--on");
        }
        return;
      }
      if (roles.current.get(e.pointerId) !== "stick") return;
      const k = c.stickMove(e.pointerId, p.x, p.y);
      if (knobRef.current) knobRef.current.style.transform = `translate(${k.x}px, ${k.y}px)`;
    },
    onPointerLeave: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && !roles.current.has(e.pointerId)) crossRef.current?.classList.remove("airtime-cross--on");
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => letGo(e.pointerId),
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => letGo(e.pointerId),
    onLostPointerCapture: (e: React.PointerEvent<HTMLDivElement>) => letGo(e.pointerId),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const canFull = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const WeaponIcon = WEAPON_ICON[status.weapon];
  const showHint = hint && phase === "playing" && !paused;
  const showTurn = touch && portrait && phase === "playing" && !paused;

  return (
    <div ref={rootRef} className={`airtime-run${touch ? " airtime-run--touch" : ""}${portrait ? " airtime-run--portrait" : ""}`} role="region" aria-label={`${GAME_NAME} run`} tabIndex={-1}>
      <canvas ref={viewRef} className="airtime-run__view" aria-hidden />
      {phase === "playing" && !paused && <div className={`airtime-run__press${touch ? "" : " airtime-run__press--mouse"}`} aria-hidden {...press} />}
      {touch && phase === "playing" && !paused && (
        <div className="airtime-controls" aria-hidden>
          <div ref={flyRef} className="airtime-fly">
            <IconRocket size={30} />
            <span>Fly</span>
          </div>
          <div ref={stickRef} className="airtime-stick">
            <div ref={knobRef} className={`airtime-stick__knob airtime-stick__knob--${status.weapon}`}>
              <IconCrosshair size={26} />
            </div>
            <span className="airtime-stick__label">Fire</span>
          </div>
        </div>
      )}
      {!touch && phase === "playing" && !paused && <div ref={crossRef} className={`airtime-cross airtime-cross--${status.weapon}`} aria-hidden />}
      <div ref={popsRef} className="airtime-pops" aria-hidden />
      {hurtN > 0 && <div key={hurtN} className="airtime-flash" aria-hidden />}

      <div className="airtime-hud">
        <div className="airtime-hud__left">
          <p className="airtime-hud__hearts" role="img" aria-label={`${status.hearts} of ${TUNING.hearts} hearts`}>
            {Array.from({ length: TUNING.hearts }, (_, i) =>
              i < status.hearts ? <IconHeartFilled key={i} size={26} className="airtime-heart" aria-hidden /> : <IconHeart key={i} size={26} className="airtime-heart airtime-heart--empty" aria-hidden />,
            )}
          </p>
          <p className={`airtime-hud__weapon airtime-hud__weapon--${status.weapon}`}>
            <WeaponIcon size={18} aria-hidden />
            <span>{WEAPON_NAMES[status.weapon]}</span>
            {status.weaponSecs > 0 && <span className="airtime-hud__secs">{status.weaponSecs} s</span>}
          </p>
        </div>

        <div className="airtime-hud__mid">
          <p className="airtime-hud__level">Level {status.level}</p>
          <div className="airtime-hud__bar">
            <Progress value={status.progress} max={100} size="small" label="Level progress" className="airtime-progress" />
            <IconFlag size={18} aria-hidden className="airtime-hud__flag" />
          </div>
        </div>

        <div className="airtime-hud__right">
          <div className="airtime-hud__score">
            <span ref={scoreRef} className="airtime-hud__points">
              0
            </span>
            <span className="airtime-hud__best">Best {n(Math.max(best, 0))}</span>
          </div>
          <div className="airtime-hud__buttons">
            <IconButton variant="secondary" size="medium" aria-label={isMuted ? "Turn sound on" : "Mute sound"} aria-pressed={isMuted} onClick={toggleMute}>
              {isMuted ? <IconVolume3 size={22} aria-hidden /> : <IconVolume size={22} aria-hidden />}
            </IconButton>
            {canFull && (
              <IconButton variant="secondary" size="medium" aria-label={full ? "Leave full screen" : "Full screen"} onClick={toggleFull}>
                {full ? <IconMinimize size={22} aria-hidden /> : <IconMaximize size={22} aria-hidden />}
              </IconButton>
            )}
            <IconButton variant="secondary" size="medium" aria-label="Pause" onClick={pause} disabled={phase !== "playing"}>
              <IconPlayerPause size={22} aria-hidden />
            </IconButton>
          </div>
        </div>

        {banner && (
          <p key={banner.n} className={`airtime-banner airtime-banner--${banner.tone}`} aria-hidden>
            {banner.text}
          </p>
        )}

        {(showHint || showTurn) && (
          <div className="airtime-hud__tips">
            {showHint && (
              <p className="airtime-hud__hint">
                {touch ? "Hold the left side to fly. Press and drag on the right to aim and fire." : "Hold Space, W or Up to fly. Aim with the mouse and hold the left button to fire. Escape pauses."}
              </p>
            )}
            {showTurn && <p className="airtime-hud__hint airtime-hud__hint--turn">Turn your phone sideways for a wider view.</p>}
          </div>
        )}
        {debug && <p ref={debugRef} className="airtime-hud__debug" />}
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
      </div>

      {phase === "loading" && (
        <div className="airtime-run__cover">
          <p className="airtime-run__loading">Getting the rooftops ready</p>
        </div>
      )}

      {phase === "error" && (
        <div className="airtime-run__cover">
          <Card variant="elevated" padding="large" className="airtime-card">
            <h2 className="airtime-card__title">This browser can&apos;t draw the game</h2>
            <p className="airtime-card__line">{GAME_NAME} needs WebGL, which is turned off or not available here. Try another browser.</p>
            <div className="airtime-card__actions">
              <Button variant="primary" onClick={onExit}>
                Back
              </Button>
            </div>
          </Card>
        </div>
      )}

      {paused && phase === "playing" && (
        <div className="airtime-run__cover">
          <Card variant="elevated" padding="large" className="airtime-card" aria-label="Paused">
            <h2 className="airtime-card__title">Paused</h2>
            <div className="airtime-card__actions airtime-card__actions--stack">
              <Button variant="primary" className="airtime-resume" iconBefore={IconPlayerPlay} onClick={resume} fullWidth>
                Resume
              </Button>
              <Button variant="secondary" iconBefore={IconRefresh} onClick={onAgain} fullWidth>
                Start a new run
              </Button>
              <Button variant="ghost" iconBefore={IconArrowLeft} onClick={onExit} fullWidth>
                Back to the start
              </Button>
            </div>
          </Card>
        </div>
      )}

      {cleared && phase === "cleared" && (
        <div className="airtime-run__cover">
          <Card variant="elevated" padding="large" className="airtime-card airtime-cleared">
            <div className="airtime-cleared__main">
              <h2 ref={cardRef} tabIndex={-1} className="airtime-card__title">
                Level {cleared.stats.level} cleared
              </h2>
              <p className="airtime-card__line">
                {COURSE_NAME} · {clock(cleared.stats.ticks)}
              </p>
              <dl className="airtime-stats">
                <div>
                  <dt>Distance</dt>
                  <dd>{n(Math.round(cleared.stats.meters))} m</dd>
                </div>
                <div>
                  <dt>Enemies</dt>
                  <dd>{cleared.stats.enemies}</dd>
                </div>
                <div>
                  <dt>Pickups</dt>
                  <dd>{cleared.stats.pickups}</dd>
                </div>
                <div>
                  <dt>Stars</dt>
                  <dd>{cleared.stats.stars}</dd>
                </div>
                <div>
                  <dt>Level bonus</dt>
                  <dd>+{n(cleared.stats.clearBonus)}</dd>
                </div>
                <div>
                  <dt>No-hit bonus</dt>
                  <dd>{cleared.stats.noHitBonus ? `+${n(cleared.stats.noHitBonus)}` : `Hit ${cleared.stats.hits} ${cleared.stats.hits === 1 ? "time" : "times"}`}</dd>
                </div>
              </dl>
            </div>
            <div className="airtime-cleared__side">
              <p className="airtime-cleared__score">
                <span>Score</span> {n(cleared.score)}
              </p>
              <p className="airtime-cleared__level">+{n(cleared.stats.levelScore)} this level</p>
              <p className="airtime-card__line">Level {cleared.stats.level + 1} is a little faster and busier, and you get a heart back.</p>
              <div className="airtime-card__actions">
                <Button variant="primary" iconBefore={IconPlayerPlay} onClick={goOn}>
                  Continue
                </Button>
                <Button variant="secondary" iconBefore={IconTrophy} onClick={bankIt}>
                  Bank my score
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {ended && phase === "ended" && (
        <div className="airtime-run__cover">
          <Card variant="elevated" padding="large" className="airtime-card airtime-ended">
            <div>
              <div className="airtime-ended__head">
                <h2 ref={cardRef} tabIndex={-1} className="airtime-card__title">
                  {ended.kind === "banked" ? "Score banked" : "Run over"}
                </h2>
                {ended.newBest && ended.score > 0 && <Badge variant="success">New best</Badge>}
              </div>
              <p className="airtime-ended__score">{n(ended.score)}</p>
              <p className="airtime-card__line">
                {ended.levels === 0 ? "No levels cleared" : `${ended.levels} ${ended.levels === 1 ? "level" : "levels"} cleared`} · {n(ended.meters)} m · {ended.enemies} {ended.enemies === 1 ? "enemy" : "enemies"}
              </p>
              <p className="airtime-card__line">
                {ended.newBest ? (ended.previous ? `Your old best was ${n(ended.previous)}.` : "Your first score here.") : `Your best: ${n(ended.previous)}.`}
              </p>
              <div className="airtime-card__actions">
                <Button variant="primary" iconBefore={IconRefresh} onClick={onAgain}>
                  Play again
                </Button>
                <Button variant="ghost" iconBefore={IconArrowLeft} onClick={onExit}>
                  Back to the start
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
