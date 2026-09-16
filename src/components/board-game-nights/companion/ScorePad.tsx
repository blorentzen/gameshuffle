"use client";

import { Button, Checkbox, IconButton, Radio, RadioGroup } from "@empac/cascadeds";
import { useLocalState } from "@/lib/board-game-nights/companion/useLocalState";
import { useRoster } from "@/lib/board-game-nights/companion/roster";
import { RosterEmpty } from "@/components/board-game-nights/companion/RosterEmpty";

interface ScorePadState {
  rounds: Record<string, number>[]; // rounds[r][playerId]
  lowWins: boolean;
  mode?: "points" | "tally"; // points = number entry; tally = tap to check, total counts checks
}

const INITIAL: ScorePadState = { rounds: [], lowWins: false, mode: "points" };

export function ScorePad() {
  const { players } = useRoster();
  const [state, setState] = useLocalState<ScorePadState>("gs-bgn-scorepad", INITIAL);
  const { lowWins } = state;
  const mode = state.mode ?? "points";
  const tally = mode === "tally";
  // Tolerate pre-shared-roster saves (rounds were index arrays): drop old shape.
  const rounds: Record<string, number>[] = (state.rounds ?? []).map((r) => (r && !Array.isArray(r) && typeof r === "object" ? r : {}));

  const addRound = () => setState((s) => ({ ...s, rounds: [...rounds, {}] }));
  const removeRound = (r: number) => setState((s) => ({ ...s, rounds: rounds.filter((_, i) => i !== r) }));
  const setCell = (r: number, id: string, value: number) =>
    setState((s) => ({ ...s, rounds: rounds.map((row, ri) => (ri === r ? { ...row, [id]: value } : row)) }));
  const reset = () => { if (window.confirm("Clear the score pad?")) setState(INITIAL); };

  const totals = players.map((pl) => rounds.reduce((sum, row) => sum + (row[pl.id] ?? 0), 0));
  const hasScores = rounds.length > 0 && players.length > 0;
  const best = !hasScores ? null : lowWins && !tally ? Math.min(...totals) : Math.max(...totals);

  if (players.length === 0) return <RosterEmpty />;

  return (
    <div className="account-card">
      <div className="bgn-sheet__head">
        <div className="bgn-sheet__actions">
          <Button variant="secondary" size="small" onClick={addRound}>Add round</Button>
          <RadioGroup
            name="scorepad-mode"
            value={mode}
            onChange={(v) => setState((s) => ({ ...s, mode: v as "points" | "tally" }))}
            orientation="horizontal"
            aria-label="Scoring mode"
          >
            <Radio value="points" label="Points" />
            <Radio value="tally" label="Tally" />
          </RadioGroup>
          {!tally && (
            <Checkbox
              checked={lowWins}
              onChange={(e) => setState((s) => ({ ...s, lowWins: e.target.checked }))}
              label="Lowest score wins"
            />
          )}
          <Button variant="ghost" size="small" onClick={reset}>Reset</Button>
        </div>
      </div>

      <div className="bgn-sheet__scroll">
        <table className="bgn-sheet">
          <thead>
            <tr>
              <th className="bgn-sheet__rowlabel">Round</th>
              {players.map((pl) => (
                <th key={pl.id}>{pl.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.length === 0 ? (
              <tr><td className="bgn-sheet__empty" colSpan={players.length + 1}>No rounds yet. Add a round to start scoring.</td></tr>
            ) : (
              rounds.map((row, r) => (
                <tr key={r}>
                  <td className="bgn-sheet__rowlabel">
                    <span className="bgn-sheet__roundnum">{r + 1}</span>
                    <IconButton variant="tertiary" size="small" className="bgn-sheet__x" aria-label={`Remove round ${r + 1}`} onClick={() => removeRound(r)}>×</IconButton>
                  </td>
                  {players.map((pl) => (
                    <td key={pl.id}>
                      {tally ? (
                        <Button
                          variant="ghost"
                          size="small"
                          className="bgn-sheet__fixed"
                          onClick={() => setCell(r, pl.id, (row[pl.id] ?? 0) > 0 ? 0 : 1)}
                          aria-label={`Round ${r + 1}, ${pl.name}: ${(row[pl.id] ?? 0) > 0 ? "checked" : "unchecked"}`}
                        >
                          <span style={{ color: (row[pl.id] ?? 0) > 0 ? "var(--success-600, #0f7a0a)" : undefined }}>{(row[pl.id] ?? 0) > 0 ? "✓" : " "}</span>
                        </Button>
                      ) : (
                        <input
                          className="bgn-sheet__cell"
                          type="number"
                          inputMode="numeric"
                          value={row[pl.id] ?? 0}
                          onChange={(e) => setCell(r, pl.id, e.target.value === "" ? 0 : Number(e.target.value))}
                          aria-label={`Round ${r + 1}, ${pl.name} score`}
                        />
                      )}
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
                <td key={players[p].id} className={`bgn-sheet__total${hasScores && t === best ? " bgn-sheet__total--best" : ""}`}>
                  {t}{hasScores && t === best && <span className="bgn-sheet__crown"> 👑</span>}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
