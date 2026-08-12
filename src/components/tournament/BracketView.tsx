"use client";

/**
 * Visual bracket. Single elim = one set of round columns. Double elim =
 * Winners + Losers sections plus the Grand Final. Each match is a two-player
 * card; read-only by default, or pass `onReport` (organizer) to click a player
 * as the winner. Pass `allowScores` to also enter a match score (higher
 * advances) — the analog of entering results for a race. Shared by manage +
 * public pages.
 */

import { useState } from "react";
import { roundLabel, lbRoundLabel, type Bracket, type BracketGroup, type BracketMatch } from "@/lib/tournaments/bracket";

export function BracketView({
  bracket,
  nameOf,
  onReport,
  allowScores,
}: {
  bracket: Bracket;
  nameOf: (id: string | null) => string;
  onReport?: (matchId: string, winnerId: string) => void;
  allowScores?: boolean;
}) {
  const columnsFor = (group: BracketGroup, roundCount: number, labeler: (r: number) => string) => {
    const rounds = Array.from({ length: roundCount }, (_, r) =>
      bracket.matches.filter((m) => m.group === group && m.round === r).sort((a, b) => a.slot - b.slot),
    ).filter((col) => col.length > 0);
    return (
      <div style={{ display: "flex", gap: "var(--spacing-20)", overflowX: "auto", paddingBottom: "var(--spacing-8)" }}>
        {rounds.map((matches, r) => (
          <div key={r} style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", gap: "var(--spacing-12)", minWidth: 180, flex: "0 0 auto" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", textAlign: "center" }}>
              {labeler(r)}
            </div>
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} nameOf={nameOf} onReport={onReport} allowScores={allowScores} />
            ))}
          </div>
        ))}
      </div>
    );
  };

  if (bracket.kind !== "double_elim") {
    return columnsFor("wb", bracket.rounds, (r) => roundLabel(r, bracket.rounds));
  }

  const gf = bracket.matches.filter((m) => m.group === "gf").sort((a, b) => a.round - b.round);
  const sectionHeading = (t: string) => (
    <h3 style={{ fontSize: "12px", fontWeight: 700, margin: "0 0 var(--spacing-8)", color: "var(--text-secondary)" }}>{t}</h3>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
      <div>
        {sectionHeading("Winners Bracket")}
        {columnsFor("wb", bracket.rounds, (r) => roundLabel(r, bracket.rounds))}
      </div>
      <div>
        {sectionHeading("Losers Bracket")}
        {columnsFor("lb", bracket.lbRounds ?? 0, (r) => lbRoundLabel(r, bracket.lbRounds ?? 0))}
      </div>
      <div>
        {sectionHeading("Grand Final")}
        <div style={{ display: "flex", gap: "var(--spacing-20)" }}>
          {gf.map((m) => (
            <div key={m.id} style={{ minWidth: 180 }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", textAlign: "center", marginBottom: "var(--spacing-8)" }}>
                {m.round === 0 ? "Grand Final" : "Reset"}
              </div>
              <MatchCard match={m} nameOf={nameOf} onReport={onReport} allowScores={allowScores} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  nameOf,
  onReport,
  allowScores,
}: {
  match: BracketMatch;
  nameOf: (id: string | null) => string;
  onReport?: (matchId: string, winnerId: string) => void;
  allowScores?: boolean;
}) {
  const canReport = !!onReport && !!match.a && !!match.b;
  const [scores, setScores] = useState<{ a: string; b: string }>({ a: "", b: "" });
  const scoring = !!allowScores && canReport && !match.winner;
  const reportByScore = () => {
    const a = Number(scores.a), b = Number(scores.b);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return;
    onReport!(match.id, a > b ? match.a! : match.b!);
  };

  const row = (side: "a" | "b") => {
    const pid = match[side];
    const isWinner = match.winner != null && match.winner === pid;
    const isLoser = match.winner != null && !!pid && match.winner !== pid;
    // A null slot only means "Bye" in a round-0 winners match (a real seed with
    // no opponent); elsewhere it's "TBD" (waiting on a feeding match).
    const label = pid
      ? nameOf(pid)
      : match.group === "wb" && match.round === 0 && side === "b" && match.a
        ? "Bye"
        : "TBD";
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-8)",
          padding: "var(--spacing-6) var(--spacing-10)",
          borderBottom: side === "a" ? "1px solid var(--border-subtle, var(--border-default))" : "none",
          background: isWinner ? "color-mix(in srgb, var(--bg-primary, #2f6fd6) 18%, transparent)" : "transparent",
        }}
      >
        <span
          role={canReport && pid ? "button" : undefined}
          onClick={() => canReport && pid && !match.winner && onReport!(match.id, pid)}
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: isLoser ? "var(--text-tertiary)" : "var(--text-primary)",
            fontWeight: isWinner ? 700 : 500,
            fontSize: "12px",
            cursor: canReport && pid && !match.winner ? "pointer" : "default",
          }}
        >
          {label}
        </span>
        {scoring && pid && (
          <input
            type="number"
            min={0}
            value={scores[side]}
            onChange={(e) => setScores((s) => ({ ...s, [side]: e.target.value }))}
            aria-label={`Score for ${label}`}
            style={{ width: 40, height: 24, borderRadius: 4, border: "1px solid var(--border-default)", padding: "0 4px", textAlign: "center", fontSize: "12px", background: "var(--surface-default)", color: "var(--text-primary)" }}
          />
        )}
        {isWinner && <span aria-hidden>✓</span>}
      </div>
    );
  };

  const canSubmit = scoring && scores.a !== "" && scores.b !== "" && Number(scores.a) !== Number(scores.b);
  return (
    <div style={{ borderRadius: "0.5rem", border: "1px solid var(--border-default)", background: "var(--surface-default)", overflow: "hidden" }}>
      {row("a")}
      {row("b")}
      {canSubmit && (
        <button
          type="button"
          onClick={reportByScore}
          style={{ width: "100%", border: "none", borderTop: "1px solid var(--border-subtle, var(--border-default))", background: "var(--surface-raised, var(--surface-default))", color: "var(--bg-primary, var(--primary-500))", fontWeight: 700, fontSize: "12px", padding: "var(--spacing-4)", cursor: "pointer" }}
        >
          {Number(scores.a) > Number(scores.b) ? nameOf(match.a) : nameOf(match.b)} advances →
        </button>
      )}
    </div>
  );
}
