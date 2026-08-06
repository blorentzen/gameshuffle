"use client";

/**
 * Visual single-elimination bracket. Rounds render as columns; each match is a
 * two-player card. Read-only by default; pass `onReport` (organizer) to make
 * players clickable to set the winner. Shared by the manage + public pages.
 */

import { roundLabel, type Bracket, type BracketMatch } from "@/lib/tournaments/bracket";

export function BracketView({
  bracket,
  nameOf,
  onReport,
}: {
  bracket: Bracket;
  nameOf: (id: string | null) => string;
  onReport?: (matchId: string, winnerId: string) => void;
}) {
  const rounds = Array.from({ length: bracket.rounds }, (_, r) =>
    bracket.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot),
  );

  return (
    <div style={{ display: "flex", gap: "1.25rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
      {rounds.map((matches, r) => (
        <div
          key={r}
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            gap: "0.75rem",
            minWidth: 180,
            flex: "0 0 auto",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", textAlign: "center" }}>
            {roundLabel(r, bracket.rounds)}
          </div>
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} nameOf={nameOf} onReport={onReport} />
          ))}
        </div>
      ))}
    </div>
  );
}

function MatchCard({
  match,
  nameOf,
  onReport,
}: {
  match: BracketMatch;
  nameOf: (id: string | null) => string;
  onReport?: (matchId: string, winnerId: string) => void;
}) {
  const canReport = !!onReport && !!match.a && !!match.b;
  const row = (side: "a" | "b") => {
    const pid = match[side];
    const isWinner = match.winner != null && match.winner === pid;
    const isLoser = match.winner != null && !!pid && match.winner !== pid;
    // A null slot only means "Bye" in round 0 (a real seed with no opponent);
    // in later rounds it's "TBD" (waiting on a feeding match).
    const label = pid
      ? nameOf(pid)
      : match.round === 0 && side === "b" && match.a
        ? "Bye"
        : "TBD";
    return (
      <button
        type="button"
        disabled={!canReport || !pid}
        onClick={() => canReport && pid && onReport!(match.id, pid)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          width: "100%",
          padding: "0.4rem 0.6rem",
          border: "none",
          borderBottom: side === "a" ? "1px solid var(--border-subtle, var(--border-default))" : "none",
          background: isWinner ? "color-mix(in srgb, var(--bg-primary, #2f6fd6) 18%, transparent)" : "transparent",
          color: isLoser ? "var(--text-tertiary)" : "var(--text-primary)",
          fontWeight: isWinner ? 700 : 500,
          fontSize: "13px",
          textAlign: "left",
          cursor: canReport && pid ? "pointer" : "default",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {isWinner && <span aria-hidden>✓</span>}
      </button>
    );
  };
  return (
    <div
      style={{
        borderRadius: "0.5rem",
        border: "1px solid var(--border-default)",
        background: "var(--surface-default)",
        overflow: "hidden",
      }}
    >
      {row("a")}
      {row("b")}
    </div>
  );
}
