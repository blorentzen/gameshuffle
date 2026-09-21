"use client";

import { Button, Input } from "@empac/cascadeds";
import { useLocalState } from "@/lib/game-nights/companion/useLocalState";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { RosterEmpty } from "@/components/game-nights/companion/RosterEmpty";

/**
 * Life / resource counters — a per-player counter board for life totals, coins,
 * victory points, whatever the game needs. +/- by 1 or 5, per-player color.
 * Players come from the shared roster; values keyed by player id, saved on device.
 */

const COLORS = ["#4f46e5", "#c11a10", "#17a710", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9", "#111827"];

interface CState { start: number; values: Record<string, number>; colors: Record<string, string> }
const INITIAL: CState = { start: 20, values: {}, colors: {} };

export function Counters() {
  const { players } = useRoster();
  const [state, setState] = useLocalState<CState>("gs-bgn-counters", INITIAL);
  const start = state.start ?? 20;
  const values = state.values ?? {};
  const colors = state.colors ?? {};
  const valueOf = (id: string) => values[id] ?? start;
  const colorOf = (id: string, idx: number) => colors[id] ?? COLORS[idx % COLORS.length];

  const bump = (id: string, delta: number) =>
    setState((s) => ({ ...s, values: { ...(s.values ?? {}), [id]: valueOf(id) + delta } }));
  const setColor = (id: string, color: string) =>
    setState((s) => ({ ...s, colors: { ...(s.colors ?? {}), [id]: color } }));
  const resetAll = () =>
    setState((s) => ({ ...s, values: Object.fromEntries(players.map((p) => [p.id, s.start ?? 20])) }));

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <label className="bgn-sheet__toggle">
            Start at
            <span style={{ width: "4rem", display: "inline-block" }}>
              <Input type="number" value={start} onChange={(e) => setState((s) => ({ ...s, start: Number(e.target.value) || 0 }))} aria-label="Starting value" />
            </span>
          </label>
          <Button variant="ghost" size="small" onClick={resetAll}>Reset to start</Button>
        </div>
      </div>

      <div className="bgn-counters">
        {players.map((p, i) => {
          const color = colorOf(p.id, i);
          return (
            <div key={p.id} className="bgn-counter" style={{ borderTopColor: color }}>
              <div className="bgn-counter__head">
                <span className="bgn-counter__name">{p.name}</span>
              </div>
              <div className="bgn-counter__value" style={{ color }}>{valueOf(p.id)}</div>
              <div className="bgn-counter__btns">
                <Button variant="ghost" size="small" onClick={() => bump(p.id, -5)}>-5</Button>
                <Button variant="secondary" size="small" onClick={() => bump(p.id, -1)}>-1</Button>
                <Button variant="secondary" size="small" onClick={() => bump(p.id, 1)}>+1</Button>
                <Button variant="ghost" size="small" onClick={() => bump(p.id, 5)}>+5</Button>
              </div>
              <div className="bgn-counter__colors">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`bgn-counter__swatch${color === c ? " bgn-counter__swatch--on" : ""}`}
                    style={{ background: c }}
                    aria-label={`Set ${p.name} color`}
                    onClick={() => setColor(p.id, c)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
