"use client";

import { useState } from "react";
import { Button, Checkbox, Select } from "@empac/cascadeds";
import { useRoster } from "@/lib/board-game-nights/companion/roster";
import { RosterEmpty } from "@/components/board-game-nights/companion/RosterEmpty";

/**
 * Werewolf / Mafia moderator — deal secret roles by passing the phone, then run
 * the night/day phases. Players come from the shared roster; roles are dealt in
 * memory and never persisted, so no one can peek by reloading.
 */

type Phase = "setup" | "deal" | "play";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Werewolf() {
  const { players: roster } = useRoster();
  const players = roster.map((p) => p.name);
  const [phase, setPhase] = useState<Phase>("setup");
  const [werewolves, setWerewolves] = useState(1);
  const [seer, setSeer] = useState(true);
  const [doctor, setDoctor] = useState(false);

  const [roles, setRoles] = useState<string[]>([]);
  const [revealIdx, setRevealIdx] = useState(0);
  const [showing, setShowing] = useState(false);

  const [round, setRound] = useState(1);
  const [dayNight, setDayNight] = useState<"night" | "day">("night");
  const [alive, setAlive] = useState<boolean[]>([]);

  const special = werewolves + (seer ? 1 : 0) + (doctor ? 1 : 0);
  const villagers = players.length - special;
  const enoughPlayers = players.length >= 3;

  if (roster.length === 0) return <RosterEmpty>Add players above to deal Werewolf roles. Everyone at the table is shared across every tool.</RosterEmpty>;

  const startDeal = () => {
    const deck: string[] = [
      ...Array(werewolves).fill("Werewolf"),
      ...(seer ? ["Seer"] : []),
      ...(doctor ? ["Doctor"] : []),
      ...Array(Math.max(0, villagers)).fill("Villager"),
    ];
    setRoles(shuffle(deck));
    setRevealIdx(0);
    setShowing(false);
    setPhase("deal");
  };

  const nextReveal = () => {
    if (revealIdx + 1 >= players.length) {
      setAlive(players.map(() => true));
      setRound(1);
      setDayNight("night");
      setPhase("play");
    } else {
      setRevealIdx((i) => i + 1);
      setShowing(false);
    }
  };

  const advancePhase = () => {
    if (dayNight === "night") setDayNight("day");
    else { setDayNight("night"); setRound((r) => r + 1); }
  };

  // ── Setup ──────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="account-card">
        <h2>Roles</h2>
        <div className="bgn-wolf__roles">
          <label className="bgn-wolf__rolefield">Werewolves
            <Select
              value={String(werewolves)}
              onChange={(v) => setWerewolves(Number(v))}
              size="small"
              options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </label>
          <Checkbox checked={seer} onChange={(e) => setSeer(e.target.checked)} label="Seer" />
          <Checkbox checked={doctor} onChange={(e) => setDoctor(e.target.checked)} label="Doctor" />
        </div>
        <p className="bgn-tools__hint">
          {villagers >= 0
            ? `${players.length} players: ${werewolves} werewolf${werewolves === 1 ? "" : "s"}, ${seer ? "1 seer, " : ""}${doctor ? "1 doctor, " : ""}${villagers} villager${villagers === 1 ? "" : "s"}.`
            : "Too many special roles for this many players."}
        </p>

        <h2 style={{ marginTop: "var(--spacing-24)" }}>Players</h2>
        <p className="bgn-tools__hint">Playing with everyone on the roster above. Add or remove players there.</p>
        <div className="bgn-wolf__namelist">
          {players.map((name, i) => (
            <span key={i} className="bgn-wolf__nametag">{name}</span>
          ))}
        </div>
        {!enoughPlayers && <p className="bgn-tools__hint">Add at least 3 players to deal roles.</p>}
        <div style={{ marginTop: "var(--spacing-16)" }}>
          <Button variant="primary" onClick={startDeal} disabled={villagers < 0 || !enoughPlayers}>Deal roles</Button>
        </div>
      </div>
    );
  }

  // ── Deal (pass the phone) ──────────────────────────────────────────────
  if (phase === "deal") {
    const name = players[revealIdx];
    const role = roles[revealIdx];
    return (
      <div className="account-card bgn-wolf__deal">
        <p className="bgn-tools__hint">Pass the phone to this player, then tap to reveal their secret role.</p>
        <div className="bgn-wolf__dealcard">
          <span className="bgn-wolf__dealname">{name}</span>
          {showing ? (
            <>
              <span className={`bgn-wolf__role bgn-wolf__role--${role.toLowerCase()}`}>{role}</span>
              <Button variant="primary" onClick={nextReveal}>{revealIdx + 1 >= players.length ? "Done — start the game" : "Hide & pass on"}</Button>
            </>
          ) : (
            <Button variant="primary" size="large" onClick={() => setShowing(true)}>Reveal my role</Button>
          )}
        </div>
        <p className="bgn-tools__hint">{revealIdx + 1} of {players.length}</p>
      </div>
    );
  }

  // ── Play (moderator tracker) ───────────────────────────────────────────
  return (
    <div className="account-card">
      <div className="bgn-wolf__phasebar">
        <span className={`bgn-wolf__phase bgn-wolf__phase--${dayNight}`}>{dayNight === "night" ? "🌙 Night" : "☀️ Day"} · Round {round}</span>
        <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
          <Button variant="primary" size="small" onClick={advancePhase}>{dayNight === "night" ? "Go to day" : "Next night"}</Button>
          <Button variant="ghost" size="small" onClick={() => setPhase("setup")}>New game</Button>
        </div>
      </div>
      <p className="bgn-tools__hint">Moderator view — roles are visible to you only. Tap a player to mark them out.</p>
      <div className="bgn-wolf__roster">
        {players.map((name, i) => (
          <button
            key={i}
            type="button"
            className={`bgn-wolf__rosteritem${alive[i] ? "" : " bgn-wolf__rosteritem--dead"}`}
            onClick={() => setAlive((a) => a.map((v, idx) => (idx === i ? !v : v)))}
          >
            <span className="bgn-wolf__rostername">{name}</span>
            <span className={`bgn-wolf__role bgn-wolf__role--${roles[i]?.toLowerCase()}`}>{roles[i]}</span>
            {!alive[i] && <span className="bgn-wolf__out">OUT</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
