"use client";

/**
 * The free dice roller (/dice-roller): dice rolled onto a table (item 10),
 * natural pip dice in the chosen color (item 11), GS Pro materials (11b), and
 * the account's saved dice look (item 13). Two ways to roll: physics (the
 * dice-box 3D engine, loaded on the first roll) or the simple CSS cubes the
 * stream overlay also draws (item 14).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Switch } from "@empac/cascadeds";
import type DiceBox from "@3d-dice/dice-box";
import { DicePips } from "@/components/companion/DicePips";
import { ToolLayout, ToolSetting } from "@/components/tools/ToolLayout";
import { DiceRow, DICE_THROW_MS, type DiceReveal } from "@/components/tools/dice/DiceCube";
import { DiceTable } from "@/components/tools/dice/DiceTable";
import { DiceLookFields } from "@/components/tools/dice/DiceLookFields";
import { ChoiceChips } from "@/components/tools/looks/LookControls";
import { useToolLook } from "@/components/tools/looks/useToolLook";
import { diceDrawn } from "@/lib/tools/looks";

const COUNTS = [1, 2, 3, 4, 5, 6];
const STAGE_ID = "dice-tool-stage";
const HISTORY_MAX = 8;

const MODE_KEY = "gs-dice-mode";
const ANIM_KEY = "gs-dice-animate";
const HISTORY_KEY = "gs-dice-history";

type Mode = "simple" | "physics";
interface HistoryEntry {
  id: number;
  mode: Mode;
  values: number[];
  total: number;
}

function rollValues(n: number): number[] {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DiceRollerTool() {
  const { look, setLook, pro, brand } = useToolLook("dice", { toast: "Dice look saved" });
  const drawn = diceDrawn(look, { pro, brand });
  const count = look.defaultCount;

  const [mode, setMode] = useState<Mode>("physics");
  const [animate, setAnimate] = useState(true);
  const [values, setValues] = useState<number[]>([]);
  const [reveal, setReveal] = useState<DiceReveal>("idle");
  const [total, setTotal] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [physicsShown, setPhysicsShown] = useState(false);
  // This browser's settings are read before they're written back.
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const spinsRef = useRef(0);
  const historyId = useRef(0);
  const throwTimer = useRef<number | null>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const initRef = useRef<Promise<DiceBox | null> | null>(null);

  // This browser's roll style, animation switch and recent rolls.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const m = localStorage.getItem(MODE_KEY);
        if (m === "physics" || m === "simple") setMode(m);
        else if (m === "custom") setMode("simple");
        const a = localStorage.getItem(ANIM_KEY);
        if (a != null) setAnimate(a === "1");
        const h = localStorage.getItem(HISTORY_KEY);
        if (h) {
          const parsed = JSON.parse(h) as HistoryEntry[];
          if (Array.isArray(parsed)) {
            setHistory(parsed.slice(0, HISTORY_MAX).map((e) => ({ ...e, mode: e.mode === "physics" ? "physics" : "simple" })));
            historyId.current = (parsed[0]?.id ?? 0) + 1;
          }
        }
      } catch {
        // Storage refused: defaults stand.
      }
      setPrefsLoaded(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(ANIM_KEY, animate ? "1" : "0");
    } catch {
      // Not remembered in this browser.
    }
  }, [prefsLoaded, mode, animate]);

  useEffect(() => () => { if (throwTimer.current) window.clearTimeout(throwTimer.current); }, []);

  const pushHistory = useCallback((entry: Omit<HistoryEntry, "id">) => {
    setHistory((prev) => {
      const next = [{ ...entry, id: historyId.current++ }, ...prev].slice(0, HISTORY_MAX);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Not remembered in this browser.
      }
      return next;
    });
  }, []);

  // Switching roll style starts from square one. The physics canvas leaves
  // with its stage, so the engine starts fresh next time.
  const changeMode = useCallback((next: Mode) => {
    setMode(next);
    setValues([]);
    setReveal("idle");
    setTotal(null);
    setRolling(false);
    setPhysicsShown(false);
    spinsRef.current = 0;
    if (throwTimer.current) window.clearTimeout(throwTimer.current);
    boxRef.current = null;
    initRef.current = null;
  }, []);

  const ensureBox = useCallback((): Promise<DiceBox | null> => {
    if (boxRef.current) return Promise.resolve(boxRef.current);
    if (!initRef.current) {
      const mat = drawn.material;
      initRef.current = (async () => {
        const DiceBoxCtor = (await import("@3d-dice/dice-box")).default;
        // Dice size follows the canvas, so phones get a bigger scale to keep the dice readable.
        const width = document.getElementById(STAGE_ID)?.clientWidth ?? 600;
        const box = new DiceBoxCtor({
          id: "dice-tool-canvas",
          container: `#${STAGE_ID}`,
          assetPath: "/assets/dice-box/",
          theme: mat.theme,
          // dice-box throws without a theme color, even for untinted materials.
          themeColor: drawn.dieColor,
          scale: width < 500 ? 9 : 7,
          gravity: 2,
        });
        await box.init();
        boxRef.current = box;
        return box;
      })().catch(() => null);
    }
    return initRef.current;
  }, [drawn.material, drawn.dieColor]);

  const settle = useCallback((vals: number[]) => {
    const sum = vals.reduce((a, b) => a + b, 0);
    setValues(vals);
    setTotal(sum);
    pushHistory({ mode, values: vals, total: sum });
  }, [mode, pushHistory]);

  const roll = useCallback(async () => {
    if (rolling) return;
    window.plausible?.("Tool Used", { props: { tool: "dice", mode, count } });
    const v = rollValues(count);
    const instant = !animate || prefersReducedMotion();

    if (mode === "physics") {
      if (instant) {
        setReveal("instant");
        settle(v);
        return;
      }
      setRolling(true);
      setReveal("animated");
      setPhysicsShown(true);
      try {
        const box = await ensureBox();
        if (!box) {
          setPhysicsShown(false);
          setReveal("instant");
          settle(v);
          return;
        }
        const mat = drawn.material;
        const results = await box.roll(`${count}${mat.die}`, { theme: mat.theme, themeColor: drawn.dieColor });
        settle(results.map((r) => r.value ?? 0));
      } catch {
        setPhysicsShown(false);
        setReveal("instant");
        settle(v);
      } finally {
        setRolling(false);
      }
      return;
    }

    setValues(v);
    setTotal(null);
    if (instant) {
      setReveal("instant");
      settle(v);
      return;
    }
    spinsRef.current += 1;
    setReveal("animated");
    setRolling(true);
    if (throwTimer.current) window.clearTimeout(throwTimer.current);
    throwTimer.current = window.setTimeout(() => {
      setRolling(false);
      settle(v);
    }, DICE_THROW_MS);
  }, [animate, count, drawn.material, drawn.dieColor, ensureBox, mode, rolling, settle]);

  const showTotal = total != null && count > 1 && !rolling;
  // The cubes sit on the table until the physics dice are thrown (and stand
  // in for them when the engine can't run or motion is reduced).
  const cubesOnTable = mode === "simple" || !physicsShown;

  const stage = (
    <>
      <DiceTable table={look.table} className="dice-tool__table">
        {mode === "physics" && <div id={STAGE_ID} className="dice-table__canvas" aria-hidden="true" />}
        {cubesOnTable && (
          <div className="dice-table__cubes" aria-hidden="true">
            <DiceRow
              count={count}
              values={values}
              reveal={values.length ? reveal : "idle"}
              spins={spinsRef.current}
              dieColor={drawn.dieColor}
              pipColor={drawn.pipColor}
            />
          </div>
        )}
      </DiceTable>
      <div className="tool-stage__action">
        <Button variant="primary" size="large" fullWidth onClick={roll} disabled={rolling}>
          {rolling ? "Rolling…" : count === 1 ? "Roll the die" : `Roll ${count} dice`}
        </Button>
        <p className="tool-stage__result" aria-live="polite">
          {showTotal ? <>Total <strong>{total}</strong> <span className="dice-tool__parts">({values.join(" + ")})</span></> : total != null && !rolling ? <>Rolled <strong>{total}</strong></> : " "}
        </p>
      </div>
      {history.length > 0 && (
        <section className="dice-history" aria-labelledby="dice-history-head">
          <h2 className="dice-history__head" id="dice-history-head">Recent rolls</h2>
          <ul className="dice-history__list">
            {history.map((h) => (
              <li key={h.id} className="dice-history__row">
                <span className="dice-history__dice">
                  {h.values.map((val, i) => (
                    <span key={i} className="dice-history__die"><DicePips value={val} /></span>
                  ))}
                </span>
                <span className="dice-history__total">{h.total}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  const settings = (
    <>
      <ToolSetting label="Dice">
        <ChoiceChips choices={COUNTS.map((n) => ({ value: n, label: String(n) }))} value={count} onChange={(n) => setLook({ ...look, defaultCount: n })} />
      </ToolSetting>
      <ToolSetting label="Roll">
        <ChoiceChips choices={[{ value: "physics" as Mode, label: "Physics" }, { value: "simple" as Mode, label: "Simple" }]} value={mode} onChange={changeMode} />
      </ToolSetting>
      <DiceLookFields look={look} onChange={setLook} pro={pro} brand={brand} from="dice-page" />
      <Switch label="Animate rolls" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
    </>
  );

  return <ToolLayout className="dice-tool" stage={stage} settings={settings} settingsLabel="Dice settings" />;
}
