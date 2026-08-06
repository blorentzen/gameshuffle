"use client";

/**
 * Tournament sandbox — a public, no-login interactive demo of the tournament
 * modes for marketing. Runs the REAL engines (bracket.ts + scoring.ts) and the
 * real BracketView on local sample data, so visitors can click through a
 * bracket or simulate races and watch it work, then create their own. Ephemeral
 * client state; no database.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Container, Button } from "@empac/cascadeds";
import {
  generateSingleElim,
  generateDoubleElim,
  reportWinner,
  bracketChampion,
  type Bracket,
} from "@/lib/tournaments/bracket";
import { computeStandings, DEFAULT_SCORING_TABLE, type TournamentRace } from "@/lib/tournaments/scoring";
import { BracketView } from "@/components/tournament/BracketView";

const PLAYERS = ["Aria", "Bolt", "Cypher", "Dash", "Echo", "Fjord", "Gizmo", "Halo"];

type Mode = "single_elim" | "double_elim" | "points";

const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: "single_elim", label: "Single Elimination", blurb: "One loss and you're out. Click a player to advance them." },
  { id: "double_elim", label: "Double Elimination", blurb: "A losers bracket + grand-final reset. Click winners to play it out." },
  { id: "points", label: "Points / Standings", blurb: "Race-by-race scoring. Simulate races and watch the standings move." },
];

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function TournamentSandboxPage() {
  const [mode, setMode] = useState<Mode>("single_elim");
  const [bracket, setBracket] = useState<Bracket>(() => generateSingleElim(PLAYERS));
  const [races, setRaces] = useState<TournamentRace[]>([]);

  const nameOf = (id: string | null) => id ?? "TBD";

  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === "single_elim") setBracket(generateSingleElim(PLAYERS));
    else if (m === "double_elim") setBracket(generateDoubleElim(PLAYERS));
    setRaces([]);
  };

  const resetBracket = () =>
    setBracket(mode === "double_elim" ? generateDoubleElim(PLAYERS) : generateSingleElim(PLAYERS));

  // Resolve every currently-playable match with a random winner, repeatedly,
  // until the bracket is decided.
  const autoPlay = () => {
    let b = bracket;
    for (let guard = 0; guard < 200; guard++) {
      const playable = b.matches.find((m) => m.a && m.b && !m.winner);
      if (!playable) break;
      const winner = Math.random() < 0.5 ? playable.a! : playable.b!;
      b = reportWinner(b, playable.id, winner);
    }
    setBracket(b);
  };

  const simulateRace = () => {
    const order = shuffle(PLAYERS);
    const placements: Record<string, number> = {};
    order.forEach((p, i) => (placements[p] = i + 1));
    setRaces((prev) => [...prev, { id: `race-${prev.length + 1}`, race_number: prev.length + 1, placements }]);
  };

  const standings = useMemo(
    () =>
      computeStandings(
        PLAYERS.map((p) => ({ id: p, display_name: p, team: null })),
        races,
        DEFAULT_SCORING_TABLE,
      ),
    [races],
  );

  const champ = mode !== "points" ? bracketChampion(bracket) : null;
  const activeMode = MODES.find((m) => m.id === mode)!;

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <span className="marketing-eyebrow">Interactive demo</span>
          <h1 style={{ fontSize: "var(--font-size-32)", fontWeight: 700, margin: "0.5rem 0 0.75rem" }}>
            Tournament sandbox
          </h1>
          <p style={{ fontSize: "var(--font-size-16)", color: "var(--text-secondary)", maxWidth: 640, marginBottom: "1.75rem" }}>
            Try the real thing — no account needed. Pick a format and play it out with a sample field of eight.
            This runs the exact bracket and scoring engine GameShuffle uses.
          </p>

          {/* Mode switcher */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            {MODES.map((m) => (
              <Button key={m.id} variant={mode === m.id ? "primary" : "secondary"} size="small" onClick={() => switchMode(m.id)}>
                {m.label}
              </Button>
            ))}
          </div>
          <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "1.5rem" }}>{activeMode.blurb}</p>

          {/* Stage */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            {mode === "points" ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                  <h2 style={{ fontSize: "var(--font-size-18)", margin: 0 }}>
                    {races.length === 0 ? "Standings" : `Standings · ${races.length} race${races.length === 1 ? "" : "s"}`}
                  </h2>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button variant="primary" size="small" onClick={simulateRace}>Simulate a race</Button>
                    {races.length > 0 && <Button variant="ghost" size="small" onClick={() => setRaces([])}>Reset</Button>}
                  </div>
                </div>
                {races.length === 0 ? (
                  <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>
                    Hit <strong>Simulate a race</strong> to score a 12-point-style GP and watch the standings build.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {standings.filter((s) => s.racesPlayed > 0).map((s, i) => (
                      <div key={s.participantId} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.4rem 0.65rem", borderRadius: "0.4rem", background: i < 3 ? "var(--surface-raised, var(--surface-default))" : "transparent", border: "1px solid var(--border-subtle, var(--border-default))" }}>
                        <span style={{ width: 28, textAlign: "center", fontWeight: 800 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>{s.name}</span>
                        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{s.wins}W · avg {s.avgPosition?.toFixed(1)}</span>
                        <span style={{ fontWeight: 700, fontSize: "var(--font-size-14)", minWidth: 52, textAlign: "right" }}>{s.points} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                  <h2 style={{ fontSize: "var(--font-size-18)", margin: 0 }}>
                    {champ ? <>Champion: 🏆 {nameOf(champ)}</> : "Click a player to advance them"}
                  </h2>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button variant="secondary" size="small" onClick={autoPlay}>Auto-play</Button>
                    <Button variant="ghost" size="small" onClick={resetBracket}>Reset</Button>
                  </div>
                </div>
                <BracketView bracket={bracket} nameOf={nameOf} onReport={(matchId, winnerId) => setBracket((b) => reportWinner(b, matchId, winnerId))} />
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="comp-card" style={{ textAlign: "center", padding: "2rem 1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, marginBottom: "0.5rem" }}>Like what you see?</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", maxWidth: 520, marginInline: "auto" }}>
              Run the real thing for Mario Kart 8 Deluxe or Mario Kart World — invite players (or add guests), score it live, and share a public bracket.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/tournament/create"><Button variant="primary">Create your tournament</Button></Link>
              <Link href="/tournament"><Button variant="secondary">Browse tournaments</Button></Link>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
