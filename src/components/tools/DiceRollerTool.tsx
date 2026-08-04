"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox, Tabs } from "@empac/cascadeds";
import { DicePips } from "@/components/companion/DicePips";
import type DiceBox from "@3d-dice/dice-box";

const COUNTS = [1, 2, 3, 4, 5, 6];
const STAGE_ID = "dice-tool-stage";
const THROW_MS = 1150;
const HISTORY_MAX = 8;

const MODE_KEY = "gs-dice-mode";
const ANIM_KEY = "gs-dice-animate";
const FACE_KEY = "gs-dice-face";
const PIP_KEY = "gs-dice-pip";
const HISTORY_KEY = "gs-dice-history";

const DEFAULT_FACE = "#eef1f6";
const DEFAULT_PIP = "#1b2740";
const FACE_PRESETS = ["#eef1f6", "#e23b3b", "#2f6fd6", "#2e9e57", "#e0b020", "#9b5cc8", "#20242c"];
const PIP_PRESETS = ["#1b2740", "#ffffff", "#e23b3b", "#f5c542"];

type Mode = "custom" | "physics";
type Reveal = "idle" | "animated" | "instant";
interface HistoryEntry {
  id: number;
  mode: Mode;
  values: number[];
  total: number;
}

// A d6's six faces placed on a CSS 3D cube (opposite faces sum to 7).
const CUBE_FACES: { value: number; transform: string }[] = [
  { value: 1, transform: "rotateY(0deg) translateZ(var(--die-half))" },
  { value: 6, transform: "rotateY(180deg) translateZ(var(--die-half))" },
  { value: 3, transform: "rotateY(90deg) translateZ(var(--die-half))" },
  { value: 4, transform: "rotateY(-90deg) translateZ(var(--die-half))" },
  { value: 2, transform: "rotateX(90deg) translateZ(var(--die-half))" },
  { value: 5, transform: "rotateX(-90deg) translateZ(var(--die-half))" },
];

// Cube rotation (x,y degrees) that brings a given value's face to the front.
const FACE_ROT: Record<number, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  3: [0, -90],
  4: [0, 90],
  2: [-90, 0],
  5: [90, 0],
};

// Per-die perspective (not on the container) so every die is viewed head-on
// regardless of where it sits in the row — otherwise off-center dice show a
// side face even when the correct face is forward.
const PERSP = "perspective(640px)";
const IDLE_POSE = `${PERSP} rotateX(-20deg) rotateY(0deg)`;

function rollValues(n: number): number[] {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * One CSS 3D die driven by the Web Animations API. Idle → continuous spin.
 * "animated" → tumbles from its last pose to the face that shows `value`
 * (WAAPI always animates, so it works on the very first roll too). "instant" →
 * snaps. Explicit rotate() keyframes preserve the multi-turn tumble (a matrix
 * interpolation would collapse whole turns).
 */
function CustomDie({
  value,
  index,
  reveal,
  spins,
}: {
  value: number | null;
  index: number;
  reveal: Reveal;
  spins: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  const poseRef = useRef<string>(IDLE_POSE);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Idle: hand back to the CSS keyframe spin.
    if (value == null || reveal === "idle") {
      animRef.current?.cancel();
      animRef.current = null;
      el.style.animation = "";
      el.style.transform = "";
      poseRef.current = IDLE_POSE;
      return;
    }

    const [bx, by] = FACE_ROT[value];
    el.style.animation = "none"; // stop the idle keyframe

    if (reveal === "instant") {
      animRef.current?.cancel();
      animRef.current = null;
      const pose = `${PERSP} rotateX(${bx}deg) rotateY(${by}deg)`;
      el.style.transform = pose;
      poseRef.current = pose;
      return;
    }

    // Animated throw: tumble from the last pose to the landed value.
    const from = poseRef.current;
    const target = `${PERSP} rotateX(${bx + 720}deg) rotateY(${by + 360 * (spins * 3 + index + 2)}deg)`;
    animRef.current?.cancel();
    el.style.transform = target; // resting pose after the animation ends
    animRef.current = el.animate([{ transform: from }, { transform: target }], {
      duration: THROW_MS,
      easing: "cubic-bezier(0.2, 0.72, 0.3, 1)",
    });
    poseRef.current = target;
  }, [value, reveal, spins, index]);

  useEffect(() => () => animRef.current?.cancel(), []);

  return (
    <span ref={ref} className="dice-cube">
      {CUBE_FACES.map((f) => (
        <span key={f.value} className="dice-cube__face" style={{ transform: f.transform }}>
          <DicePips value={f.value} />
        </span>
      ))}
    </span>
  );
}

function IdleCubes({ count }: { count: number }) {
  return (
    <div className="dice-custom-stage__row">
      {Array.from({ length: count }).map((_, i) => (
        <CustomDie key={i} index={i} value={null} reveal="idle" spins={0} />
      ))}
    </div>
  );
}

export function DiceRollerTool() {
  const [mode, setMode] = useState<Mode>("custom");
  const [count, setCount] = useState(2);
  const [animate, setAnimate] = useState(true);
  const [faceColor, setFaceColor] = useState(DEFAULT_FACE);
  const [pipColor, setPipColor] = useState(DEFAULT_PIP);

  const [values, setValues] = useState<number[]>([]);
  const [reveal, setReveal] = useState<Reveal>("idle");
  const [total, setTotal] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const spinsRef = useRef(0);
  const historyId = useRef(0);
  const throwTimer = useRef<number | null>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const initRef = useRef<Promise<DiceBox | null> | null>(null);

  // Load persisted prefs + history.
  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === "physics" || m === "custom") setMode(m);
      const a = localStorage.getItem(ANIM_KEY);
      if (a != null) setAnimate(a === "1");
      const f = localStorage.getItem(FACE_KEY);
      if (f) setFaceColor(f);
      const p = localStorage.getItem(PIP_KEY);
      if (p) setPipColor(p);
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) {
        const parsed = JSON.parse(h) as HistoryEntry[];
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, HISTORY_MAX));
          historyId.current = (parsed[0]?.id ?? 0) + 1;
        }
      }
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(ANIM_KEY, animate ? "1" : "0");
      localStorage.setItem(FACE_KEY, faceColor);
      localStorage.setItem(PIP_KEY, pipColor);
    } catch {
      // ignore
    }
  }, [mode, animate, faceColor, pipColor]);

  useEffect(
    () => () => {
      if (throwTimer.current) window.clearTimeout(throwTimer.current);
    },
    [],
  );

  const pushHistory = useCallback((entry: Omit<HistoryEntry, "id">) => {
    setHistory((prev) => {
      const next = [{ ...entry, id: historyId.current++ }, ...prev].slice(0, HISTORY_MAX);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Every mode switch starts from square one (idle, no result). The physics box
  // is torn down so it re-inits fresh into the newly-mounted tab panel.
  const changeMode = useCallback((next: Mode) => {
    setMode(next);
    setValues([]);
    setReveal("idle");
    setTotal(null);
    setRolling(false);
    spinsRef.current = 0;
    if (throwTimer.current) window.clearTimeout(throwTimer.current);
    boxRef.current = null;
    initRef.current = null;
  }, []);

  // ---- Physics (dice-box) path -------------------------------------------
  const ensureBox = useCallback((): Promise<DiceBox | null> => {
    if (boxRef.current) return Promise.resolve(boxRef.current);
    if (!initRef.current) {
      initRef.current = (async () => {
        const DiceBoxCtor = (await import("@3d-dice/dice-box")).default;
        const box = new DiceBoxCtor({
          id: "dice-tool-canvas",
          container: `#${STAGE_ID}`,
          assetPath: "/assets/dice-box/",
          theme: "default",
          themeColor: "#2f6fd6",
          scale: 6,
          gravity: 2,
        });
        await box.init();
        boxRef.current = box;
        return box;
      })().catch(() => null);
    }
    return initRef.current;
  }, []);

  // ---- Roll --------------------------------------------------------------
  const roll = useCallback(async () => {
    if (rolling) return;
    const v = rollValues(count);
    const sum = v.reduce((a, b) => a + b, 0);
    const instant = !animate || prefersReducedMotion();

    if (mode === "physics") {
      if (instant) {
        setValues(v);
        setReveal("instant");
        setTotal(sum);
        pushHistory({ mode, values: v, total: sum });
        return;
      }
      setRolling(true);
      setReveal("animated");
      try {
        const box = await ensureBox();
        if (!box) {
          setValues(v);
          setReveal("instant");
          setTotal(sum);
          pushHistory({ mode, values: v, total: sum });
          return;
        }
        const results = await box.roll(`${count}d6`);
        const vals = results.map((r) => r.value ?? 0);
        const t = vals.reduce((s, x) => s + x, 0);
        setTotal(t);
        pushHistory({ mode, values: vals, total: t });
      } catch {
        setValues(v);
        setReveal("instant");
        setTotal(sum);
        pushHistory({ mode, values: v, total: sum });
      } finally {
        setRolling(false);
      }
      return;
    }

    // Custom (CSS cube) path.
    setValues(v);
    setTotal(null);
    if (instant) {
      setReveal("instant");
      setTotal(sum);
      pushHistory({ mode, values: v, total: sum });
      return;
    }
    spinsRef.current += 1;
    setReveal("animated");
    setRolling(true);
    if (throwTimer.current) window.clearTimeout(throwTimer.current);
    throwTimer.current = window.setTimeout(() => {
      setRolling(false);
      setTotal(sum);
      pushHistory({ mode, values: v, total: sum });
    }, THROW_MS);
  }, [animate, count, ensureBox, mode, pushHistory, rolling]);

  const physicsRolled = rolling || total != null || reveal !== "idle";
  const showTotal = total != null && count > 1 && !rolling;

  const customStage = (
    <div
      className="dice-custom-stage"
      style={{ "--die-face": faceColor, "--pip-color": pipColor } as React.CSSProperties}
    >
      <div className="dice-custom-stage__row">
        {Array.from({ length: count }).map((_, i) => (
          <CustomDie
            key={i}
            index={i}
            value={values[i] ?? null}
            reveal={values.length === 0 ? "idle" : reveal}
            spins={spinsRef.current}
          />
        ))}
      </div>
      {values.length === 0 && <p className="dice-idle__hint">Tap Roll to throw</p>}
    </div>
  );

  const physicsStage = (
    <div className="dice-tool__stage-wrap">
      <div id={STAGE_ID} className="dice-tool__stage" aria-hidden="true" />
      {!physicsRolled && (
        <div
          className="dice-idle"
          aria-hidden="true"
          style={{ "--die-face": DEFAULT_FACE, "--pip-color": DEFAULT_PIP } as React.CSSProperties}
        >
          <IdleCubes count={count} />
          <p className="dice-idle__hint">Tap Roll to throw</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="tool-panel dice-tool">
      <Tabs
        className="dice-tabs"
        variant="pills"
        activeTab={mode}
        onChange={(id) => changeMode(id as Mode)}
        tabs={[
          { id: "custom", label: "Custom dice", content: customStage },
          { id: "physics", label: "Realistic physics", content: physicsStage },
        ]}
      />

      <div className="dice-tool__controls">
        <span className="dice-tool__count" role="group" aria-label="Number of dice">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`dice-tool__count-btn${count === n ? " is-active" : ""}`}
              onClick={() => setCount(n)}
              aria-pressed={count === n}
            >
              {n}
            </button>
          ))}
        </span>
        <Button variant="primary" onClick={roll} disabled={rolling}>
          {rolling ? "Rolling…" : "Roll"}
        </Button>
      </div>

      {mode === "custom" && (
        <div className="dice-custom__opts">
          <div className="dice-swatch-group">
            <span className="dice-swatch-group__label">Dice</span>
            {FACE_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`dice-swatch${faceColor === c ? " is-active" : ""}`}
                style={{ background: c }}
                aria-label={`Dice color ${c}`}
                onClick={() => setFaceColor(c)}
              />
            ))}
            <label className="dice-swatch dice-swatch--custom" aria-label="Custom dice color">
              <input type="color" value={faceColor} onChange={(e) => setFaceColor(e.target.value)} />
            </label>
          </div>
          <div className="dice-swatch-group">
            <span className="dice-swatch-group__label">Pips</span>
            {PIP_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`dice-swatch${pipColor === c ? " is-active" : ""}`}
                style={{ background: c }}
                aria-label={`Pip color ${c}`}
                onClick={() => setPipColor(c)}
              />
            ))}
            <label className="dice-swatch dice-swatch--custom" aria-label="Custom pip color">
              <input type="color" value={pipColor} onChange={(e) => setPipColor(e.target.value)} />
            </label>
          </div>
        </div>
      )}

      <div className="dice-tool__opts">
        <Checkbox
          label="Animate rolls"
          checked={animate}
          onChange={(e) => setAnimate(e.target.checked)}
        />
      </div>

      {showTotal && (
        <p className="dice-tool__total" aria-live="polite">
          Total: <strong>{total}</strong>
        </p>
      )}

      {history.length > 0 && (
        <section className="dice-history">
          <h2 className="dice-history__head">Recent rolls</h2>
          <ul className="dice-history__list">
            {history.map((h) => (
              <li key={h.id} className="dice-history__row">
                <span className="dice-history__dice">
                  {h.values.map((val, i) => (
                    <span key={i} className="dice-history__die">
                      <DicePips value={val} />
                    </span>
                  ))}
                </span>
                <span className="dice-history__total">{h.total}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
