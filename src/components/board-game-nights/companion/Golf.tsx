"use client";

import { Button, IconButton } from "@empac/cascadeds";
import { useLocalState } from "@/lib/board-game-nights/companion/useLocalState";
import { useRoster } from "@/lib/board-game-nights/companion/roster";
import { RosterEmpty } from "@/components/board-game-nights/companion/RosterEmpty";

/**
 * Golf (card game) scorecard — low score wins. Add a hole each round and enter
 * everyone's total; the running totals + leader update as you go. Players come
 * from the shared roster; scores keyed by player id, saved on the device.
 */

interface GState { holes: Record<string, number>[] }
const INITIAL: GState = { holes: [] };

export function Golf() {
  const { players } = useRoster();
  const [state, setState] = useLocalState<GState>("gs-bgn-golf", INITIAL);
  const holes: Record<string, number>[] = (state.holes ?? []).map((h) => (h && !Array.isArray(h) && typeof h === "object" ? h : {}));

  const addHole = () => setState(() => ({ holes: [...holes, {}] }));
  const removeHole = (r: number) => setState(() => ({ holes: holes.filter((_, i) => i !== r) }));
  const setCell = (r: number, id: string, v: number) =>
    setState(() => ({ holes: holes.map((row, ri) => (ri === r ? { ...row, [id]: v } : row)) }));
  const reset = () => { if (window.confirm("Clear the golf card?")) setState({ holes: [] }); };

  const totals = players.map((pl) => holes.reduce((sum, row) => sum + (row[pl.id] ?? 0), 0));
  const played = holes.length > 0 && players.length > 0;
  const low = played ? Math.min(...totals) : null;

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <Button variant="secondary" size="small" onClick={addHole}>Add hole</Button>
          <Button variant="ghost" size="small" onClick={reset}>Reset</Button>
        </div>
      </div>
      <p className="bgn-tools__hint">Lowest total wins. Add a hole each round and enter everyone&apos;s score.</p>

      <div className="bgn-sheet__scroll">
        <table className="bgn-sheet">
          <thead>
            <tr>
              <th className="bgn-sheet__rowlabel">Hole</th>
              {players.map((pl) => (
                <th key={pl.id}>{pl.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holes.length === 0 ? (
              <tr><td className="bgn-sheet__empty" colSpan={players.length + 1}>No holes yet. Add a hole to start scoring.</td></tr>
            ) : (
              holes.map((row, r) => (
                <tr key={r}>
                  <td className="bgn-sheet__rowlabel">
                    <span className="bgn-sheet__roundnum">{r + 1}</span>
                    <IconButton variant="tertiary" size="small" className="bgn-sheet__x" aria-label={`Remove hole ${r + 1}`} onClick={() => removeHole(r)}>×</IconButton>
                  </td>
                  {players.map((pl) => (
                    <td key={pl.id}>
                      <input className="bgn-sheet__cell" type="number" inputMode="numeric" value={row[pl.id] ?? 0}
                        onChange={(e) => setCell(r, pl.id, e.target.value === "" ? 0 : Number(e.target.value))} aria-label={`Hole ${r + 1}, ${pl.name}`} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="bgn-sheet__rowlabel">Total</td>
              {totals.map((t, p) => (
                <td key={players[p].id} className={`bgn-sheet__total${played && t === low ? " bgn-sheet__total--best" : ""}`}>
                  {t}{played && t === low && <span className="bgn-sheet__crown"> 👑</span>}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
