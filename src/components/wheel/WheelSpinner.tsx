"use client";

/**
 * WheelSpinner — the free, no-account wheel tool used on /wheel-spinner.
 *
 * Fully client-side: type options (one per line), spin, and the winner is
 * picked locally (uniform random) — no server, no overlay. Reuses the
 * shared `WheelGraphic` + geometry so it matches the Pro overlay wheel.
 *
 * The rotation is driven in JS (requestAnimationFrame) rather than a CSS
 * transition, which gives us two things: a subtle idle spin before the
 * first use, and a Wheel-of-Fortune "tick" each time the pointer crosses
 * into a new slice during a spin.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Switch, Textarea } from "@empac/cascadeds";
import { WheelGraphic } from "@/components/wheel/WheelGraphic";
import { WheelStylePicker } from "@/components/wheel/WheelStylePicker";
import { computeSlices, sliceIndexAtPointer } from "@/lib/wheel/geometry";
import {
  DEFAULT_FILL_STYLE,
  DEFAULT_THEME_ID,
  getFillStyle,
  getTheme,
  type FillStyle,
} from "@/lib/wheel/themes";

const SPIN_MS = 5000;
const SPINS = 5;
const MAX_OPTIONS = 50;
const IDLE_DEG_PER_MS = 9 / 1000; // ~9°/sec — subtle idle drift
const DEFAULT_TEXT = "Pizza\nTacos\nSushi\nBurgers\nRamen\nSalad";

function parseOptions(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_OPTIONS);
}

type AudioCtor = typeof AudioContext;
function getAudioCtor(): AudioCtor | undefined {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  );
}

export function WheelSpinner() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [hasSpun, setHasSpun] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [removeWinner, setRemoveWinner] = useState(false);
  const [sound, setSound] = useState(true);
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [fillStyle, setFillStyle] = useState<FillStyle>(DEFAULT_FILL_STYLE);

  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const lastTickIndexRef = useRef(-1);

  const options = useMemo(() => parseOptions(text), [text]);
  const segments = useMemo(() => options.map((label) => ({ label })), [options]);
  const canSpin = options.length >= 2 && !spinning;

  // Restore the last-used options + theme (deferred so it's not a sync
  // setState inside the effect).
  useEffect(() => {
    let savedText: string | null = null;
    let savedTheme: string | null = null;
    let savedFill: string | null = null;
    try {
      savedText = window.localStorage.getItem("gs-wheel-options");
      savedTheme = window.localStorage.getItem("gs-wheel-theme");
      savedFill = window.localStorage.getItem("gs-wheel-fill");
    } catch {
      /* ignore */
    }
    if (savedText == null && savedTheme == null && savedFill == null) return;
    const t = window.setTimeout(() => {
      if (savedText != null) setText(savedText);
      if (savedTheme != null) setThemeId(savedTheme);
      if (savedFill != null) setFillStyle(getFillStyle(savedFill));
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // Persist options + theme locally so they survive a refresh.
  useEffect(() => {
    try {
      window.localStorage.setItem("gs-wheel-options", text);
    } catch {
      /* ignore */
    }
  }, [text]);
  useEffect(() => {
    try {
      window.localStorage.setItem("gs-wheel-theme", themeId);
    } catch {
      /* ignore */
    }
  }, [themeId]);
  useEffect(() => {
    try {
      window.localStorage.setItem("gs-wheel-fill", fillStyle);
    } catch {
      /* ignore */
    }
  }, [fillStyle]);

  // Subtle idle spin — runs until the first spin, paused on hidden tabs and
  // disabled under reduced-motion.
  useEffect(() => {
    if (hasSpun || spinning) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = 0;
    const step = (t: number) => {
      if (!document.hidden && last) {
        const dt = t - last;
        setRotation((r) => r + dt * IDLE_DEG_PER_MS);
      }
      last = t;
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [hasSpun, spinning]);

  // Cancel any in-flight spin on unmount.
  useEffect(
    () => () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  function playTick() {
    const ctx = audioRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.025);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  const spin = () => {
    if (!canSpin) return;

    // Audio must be (re)started from this user gesture.
    if (sound) {
      if (!audioRef.current) {
        const Ctor = getAudioCtor();
        if (Ctor) audioRef.current = new Ctor();
      }
      void audioRef.current?.resume?.();
    }

    const index = Math.floor(Math.random() * options.length);
    const slices = computeSlices(segments);
    const mid = slices[index]?.mid ?? 0;
    const startAngle = rotation;
    const startMod = ((startAngle % 360) + 360) % 360;
    const targetMod = (((360 - mid) % 360) + 360) % 360;
    const delta = ((((targetMod - startMod) % 360) + 360) % 360) + 360 * SPINS;
    const finalAngle = startAngle + delta;

    setWinner(null);
    setHasSpun(true);

    const finish = () => {
      setRotation(finalAngle);
      setSpinning(false);
      setWinner(options[index]);
      if (removeWinner) setText(options.filter((_, i) => i !== index).join("\n"));
    };

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }

    setSpinning(true);
    lastTickIndexRef.current = sliceIndexAtPointer(slices, startAngle);
    const startTime = performance.now();

    const loop = (now: number) => {
      const t = Math.min(1, (now - startTime) / SPIN_MS);
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart
      const angle = startAngle + delta * eased;
      setRotation(angle);

      if (sound) {
        const idx = sliceIndexAtPointer(slices, angle);
        if (idx !== lastTickIndexRef.current) {
          lastTickIndexRef.current = idx;
          playTick();
        }
      }

      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(loop);
      } else {
        finish();
      }
    };
    rafRef.current = window.requestAnimationFrame(loop);
  };

  const shuffle = () => {
    const arr = [...options];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setText(arr.join("\n"));
  };

  return (
    <div className="wheel-tool">
      <div className="wheel-tool__stage">
        <button
          type="button"
          className="wheel-tool__wheel"
          onClick={spin}
          disabled={!canSpin}
          aria-label="Spin the wheel"
        >
          <WheelGraphic
            segments={segments.length ? segments : [{ label: "Add options →" }]}
            rotation={rotation}
            theme={getTheme(themeId)}
            fillStyle={fillStyle}
            svgClassName="wheel-tool__svg"
            rotorClassName="wheel-tool__rotor"
          />
        </button>

        <div className="wheel-tool__cta">
          <Button variant="primary" size="large" onClick={spin} disabled={!canSpin}>
            {spinning ? "Spinning…" : "Spin"}
          </Button>
        </div>

        {winner ? (
          <div className="wheel-tool__winner" role="status" aria-live="polite">
            <span className="wheel-tool__winner-label">Winner</span>
            <strong className="wheel-tool__winner-value">{winner}</strong>
          </div>
        ) : null}
      </div>

      <div className="wheel-tool__panel">
        <WheelStylePicker
          themeId={themeId}
          onThemeChange={setThemeId}
          fillStyle={fillStyle}
          onFillStyleChange={setFillStyle}
        />

        <div className="wheel-tool__options-head">
          <label className="wheel-tool__panel-label" htmlFor="wheel-options">
            Options — one per line
          </label>
          <span className="wheel-tool__opt-remaining">
            {Math.max(0, MAX_OPTIONS - options.length)} left
          </span>
        </div>
        <Textarea
          id="wheel-options"
          fullWidth
          value={text}
          rows={12}
          spellCheck={false}
          placeholder={"Option one\nOption two\nOption three"}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="wheel-tool__row">
          <Switch
            checked={removeWinner}
            onChange={(e) => setRemoveWinner(e.target.checked)}
            label="Remove the winner after each spin"
          />
        </div>
        <div className="wheel-tool__row">
          <Switch
            checked={sound}
            onChange={(e) => setSound(e.target.checked)}
            label="Tick sound"
          />
        </div>
        <div className="wheel-tool__row wheel-tool__row--actions">
          <Button variant="secondary" size="small" onClick={shuffle} disabled={options.length < 2}>
            Shuffle
          </Button>
          <Button variant="secondary" size="small" onClick={() => setText("")}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
