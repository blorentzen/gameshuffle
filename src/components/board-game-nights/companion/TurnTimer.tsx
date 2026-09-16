"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Radio, RadioGroup } from "@empac/cascadeds";
import { useLocalState } from "@/lib/board-game-nights/companion/useLocalState";
import { useRoster } from "@/lib/board-game-nights/companion/roster";
import { RosterEmpty } from "@/components/board-game-nights/companion/RosterEmpty";

/**
 * Turn timer / chess clock — tap the player whose turn it is and their clock
 * runs; tap the next player to pass. Count up as a stopwatch, or count down
 * from a per-player time bank. Optional per-turn limit flags anyone who runs
 * long. Players come from the shared roster; settings are saved on the device;
 * running times reset each session.
 */

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

interface Cfg { mode: "up" | "down"; perTurnSec: number; bankSec: number }
const DEFAULT_CFG: Cfg = { mode: "up", perTurnSec: 0, bankSec: 0 };

export function TurnTimer() {
  const { players } = useRoster();
  const [cfg, setCfg] = useLocalState<Cfg>("gs-bgn-turntimer-cfg", DEFAULT_CFG);
  const [elapsed, setElapsed] = useState<Record<string, number>>({}); // by player id, session-only
  const [turnElapsed, setTurnElapsed] = useState(0); // active player's current turn, ms
  const [active, setActive] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const lastRef = useRef(0);

  const bankMs = cfg.bankSec * 1000;
  const perTurnMs = cfg.perTurnSec * 1000;
  const accOf = (id: string) => elapsed[id] ?? 0;

  useEffect(() => {
    if (!running || active == null) return;
    lastRef.current = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastRef.current;
      lastRef.current = now;
      setElapsed((e) => {
        const nextVal = (e[active] ?? 0) + delta;
        // Count-down bank exhausted: clamp and stop the clock.
        if (cfg.mode === "down" && cfg.bankSec > 0 && nextVal >= bankMs) {
          setRunning(false);
          return { ...e, [active]: bankMs };
        }
        return { ...e, [active]: nextVal };
      });
      setTurnElapsed((t) => t + delta);
    }, 250);
    return () => window.clearInterval(id);
  }, [running, active, cfg.mode, cfg.bankSec, bankMs]);

  const passTo = (id: string) => {
    if (cfg.mode === "down" && cfg.bankSec > 0 && accOf(id) >= bankMs) return; // out of time
    setActive(id);
    setTurnElapsed(0);
    setRunning(true);
  };
  const resetTimes = () => { setElapsed({}); setTurnElapsed(0); setActive(null); setRunning(false); };

  const setMinutes = (key: "perTurnSec" | "bankSec", minutes: string) => {
    const n = Math.max(0, Math.round(Number(minutes) * 60)) || 0;
    setCfg((c) => ({ ...c, [key]: n }));
    resetTimes();
  };

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <Button variant="ghost" size="small" onClick={() => setRunning((r) => !r)} disabled={active == null}>
            {running ? "Pause" : "Resume"}
          </Button>
          <Button variant="ghost" size="small" onClick={resetTimes}>Reset times</Button>
        </div>
      </div>

      <div className="bgn-clock__settings">
        <RadioGroup
          name="turntimer-mode"
          value={cfg.mode}
          onChange={(v) => { setCfg((c) => ({ ...c, mode: v as "up" | "down" })); resetTimes(); }}
          orientation="horizontal"
          aria-label="Timer mode"
        >
          <Radio value="up" label="Count up" />
          <Radio value="down" label="Count down" />
        </RadioGroup>
        <label className="bgn-clock__limit">
          Per-turn limit
          <span className="bgn-clock__limitinput">
            <Input type="number" min={0} step={0.5} inputMode="decimal" value={cfg.perTurnSec ? cfg.perTurnSec / 60 : ""} placeholder="none" onChange={(e) => setMinutes("perTurnSec", e.target.value)} aria-label="Per-turn limit in minutes" />
          </span>
          <span>min</span>
        </label>
        {cfg.mode === "down" && (
          <label className="bgn-clock__limit">
            Time bank / player
            <span className="bgn-clock__limitinput">
              <Input type="number" min={0} step={1} inputMode="numeric" value={cfg.bankSec ? cfg.bankSec / 60 : ""} placeholder="none" onChange={(e) => setMinutes("bankSec", e.target.value)} aria-label="Time bank per player in minutes" />
            </span>
            <span>min</span>
          </label>
        )}
      </div>

      <p className="bgn-tools__hint">Tap a player to start their clock. Tap the next player to pass the turn.</p>

      <div className="bgn-clock__grid">
        {players.map((pl) => {
          const acc = accOf(pl.id);
          const isActive = active === pl.id;
          const remaining = bankMs - acc;
          const outOfTime = cfg.mode === "down" && cfg.bankSec > 0 && remaining <= 0;
          const display = cfg.mode === "down" && cfg.bankSec > 0 ? remaining : acc;
          const overTurn = isActive && cfg.perTurnSec > 0 && turnElapsed > perTurnMs;
          const cls = [
            "bgn-clock__card",
            isActive && running ? "bgn-clock__card--active" : "",
            outOfTime ? "bgn-clock__card--out" : "",
            overTurn ? "bgn-clock__card--over" : "",
          ].filter(Boolean).join(" ");
          return (
            <button key={pl.id} type="button" className={cls} onClick={() => passTo(pl.id)} disabled={outOfTime && !isActive}>
              <span className="bgn-clock__name">{pl.name}</span>
              <span className="bgn-clock__time">{fmt(display)}</span>
              {cfg.perTurnSec > 0 && (
                <span className="bgn-clock__turn">This turn {fmt(isActive ? turnElapsed : 0)} / {fmt(perTurnMs)}</span>
              )}
              <span className="bgn-clock__hint">
                {outOfTime ? "Out of time" : overTurn ? "Over the turn limit" : isActive ? (running ? "On the clock" : "Paused") : "Tap to take turn"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
