"use client";

import { useState } from "react";
import { Button, Chip, Input, Select } from "@empac/cascadeds";
import { useRoster } from "@/lib/game-nights/companion/roster";

/**
 * Game-night player tools — decide turn order and split into teams. Reads the
 * shared roster, so players added here show up on every score sheet and tool
 * (and vice versa). Handy at the table on a phone.
 */

/** Fisher-Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function GameNightTools() {
  const { players: roster, addMany, remove, clear } = useRoster();
  const players = roster.map((p) => p.name);
  const [input, setInput] = useState("");
  const [order, setOrder] = useState<string[] | null>(null);
  const [teamCount, setTeamCount] = useState(2);
  const [teams, setTeams] = useState<string[][] | null>(null);

  const addPlayers = (raw: string) => {
    addMany(raw);
    setInput("");
    setOrder(null);
    setTeams(null);
  };

  const removePlayer = (id: string) => {
    remove(id);
    setOrder(null);
    setTeams(null);
  };

  const clearAll = () => {
    clear();
    setOrder(null);
    setTeams(null);
  };

  const rollOrder = () => {
    if (players.length < 2) return;
    setOrder(shuffle(players));
    setTeams(null);
  };

  const splitTeams = () => {
    if (players.length < teamCount) return;
    const shuffled = shuffle(players);
    const result: string[][] = Array.from({ length: teamCount }, () => []);
    shuffled.forEach((p, i) => result[i % teamCount].push(p));
    setTeams(result);
    setOrder(null);
  };

  return (
    <div className="bgn-tools">
      <div className="account-card bgn-tools__players">
        <h2>Players</h2>
        {players.length === 0 && (
          <p style={{ margin: "0 0 var(--spacing-12)", fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>
            Add everyone at the table to get started.
          </p>
        )}
        <div className="bgn-roster__add">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPlayers(input); } }}
            placeholder="Add a player — or paste a comma-separated list"
            aria-label="Add a player"
          />
          <Button variant="secondary" onClick={() => addPlayers(input)} disabled={!input.trim()}>Add</Button>
        </div>

        {players.length > 0 && (
          <>
            <div className="bgn-tools__roster">
              {roster.map((p) => (
                <Chip key={p.id} label={p.name} removable onRemove={() => removePlayer(p.id)} />
              ))}
            </div>
            <div style={{ marginTop: "var(--spacing-12)" }}>
              <Button variant="ghost" size="small" onClick={clearAll}>Clear all</Button>
              <span style={{ marginLeft: "var(--spacing-12)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                {players.length} player{players.length === 1 ? "" : "s"}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="account-card bgn-tools__turn">
        <h2>Turn order</h2>
        <p className="bgn-tools__hint">Randomly decide who goes first, and the order after that.</p>
        <Button variant="primary" onClick={rollOrder} disabled={players.length < 2}>Roll turn order</Button>
        {order && (
          <ol className="bgn-tools__order">
            {order.map((p, i) => (
              <li key={p}><span className="bgn-tools__seat">{i + 1}</span>{p}</li>
            ))}
          </ol>
        )}
      </div>

      <div className="account-card bgn-tools__teamscard">
        <h2>Teams</h2>
        <p className="bgn-tools__hint">Split everyone into balanced random teams.</p>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", marginBottom: "var(--spacing-12)" }}>
          <label htmlFor="team-count" style={{ fontSize: "var(--font-size-14)" }}>Teams</label>
          <Select
            id="team-count"
            value={String(teamCount)}
            onChange={(v) => { setTeamCount(Number(v)); setTeams(null); }}
            size="small"
            options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>
        <Button variant="primary" onClick={splitTeams} disabled={players.length < teamCount}>Split into teams</Button>
        {teams && (
          <div className="bgn-tools__teams">
            {teams.map((t, i) => (
              <div key={i} className="bgn-tools__team">
                <span className="bgn-tools__team-name">Team {i + 1}</span>
                <ul>{t.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
