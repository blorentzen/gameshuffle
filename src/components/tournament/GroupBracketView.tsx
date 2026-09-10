"use client";

/**
 * Shared run/results view for the Group Knockout format — the lobby-based
 * equivalent of BracketView / HeatMainsView. Renders lobbies grouped by
 * Winners / Losers / Grand Final, lets the organizer report a finishing order
 * per lobby (reorder + Record), and shows byes + advancement. Read-only mode
 * (no handlers) powers the public + results surfaces.
 *
 * Used by /tournament/sandbox, the manage page, and the public tournament page.
 */

import { useState, type CSSProperties } from "react";
import { isBye, lobbyLabel, type GroupBracket, type Lobby } from "@/lib/tournaments/groups";

// Grounded, elevated surface (matches the manage stat-card pattern) so lobby
// cards read clearly instead of blending into a same-color page background.
const card: CSSProperties = { border: "1px solid var(--border-default)", borderRadius: 10, padding: "0.6rem 0.7rem", background: "var(--surface-raised, var(--surface-default))" };
const arrow: CSSProperties = { border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-secondary)", borderRadius: 6, width: 22, height: 22, cursor: "pointer", fontSize: 11, lineHeight: 1, padding: 0 };
const link: CSSProperties = { border: "none", background: "none", color: "var(--bg-primary, var(--primary-600))", cursor: "pointer", fontSize: "var(--font-size-13)", padding: 0, fontWeight: 600 };
const heading: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 6 };

function LobbyCard({
  lobby,
  gb,
  nameOf,
  onReport,
  onClear,
  readOnly,
}: {
  lobby: Lobby;
  gb: GroupBracket;
  nameOf: (id: string | null) => string;
  onReport?: (id: string, order: string[]) => void;
  onClear?: (id: string) => void;
  readOnly?: boolean;
}) {
  const adv = Math.max(1, Math.min(gb.rules.advance, lobby.entrants.length - 1));
  const [order, setOrder] = useState<string[]>(lobby.entrants);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  if (isBye(lobby)) {
    return (
      <div style={card}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Bye</span>
        <div style={{ fontWeight: 600 }}>{nameOf(lobby.entrants[0])} advances</div>
      </div>
    );
  }

  if (lobby.results) {
    return (
      <div style={card}>
        <ol style={{ margin: 0, paddingLeft: "1.3rem", fontSize: 14 }}>
          {lobby.results.map((id, i) => (
            <li key={id} style={{ color: i < adv ? "var(--text-primary)" : "var(--text-tertiary)", fontWeight: i < adv ? 700 : 400 }}>
              {nameOf(id)} {i < adv && <span style={{ color: "var(--bg-primary)", fontSize: 11 }}>▲</span>}
            </li>
          ))}
        </ol>
        {!readOnly && onClear && <button onClick={() => onClear(lobby.id)} style={{ ...link, marginTop: 6 }}>Edit</button>}
      </div>
    );
  }

  if (readOnly) {
    return (
      <div style={{ ...card, opacity: 0.7 }}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Not played</span>
        <div style={{ fontSize: 13 }}>{lobby.entrants.map((id) => nameOf(id)).join(", ")}</div>
      </div>
    );
  }

  return (
    <div style={card}>
      {order.map((id, i) => (
        <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
          <span style={{ width: 14, color: i < adv ? "var(--bg-primary)" : "var(--text-tertiary)", fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
          <span style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(id)}</span>
          <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...arrow, opacity: i === 0 ? 0.4 : 1 }}>▲</button>
          <button onClick={() => move(i, 1)} disabled={i === order.length - 1} style={{ ...arrow, opacity: i === order.length - 1 ? 0.4 : 1 }}>▼</button>
        </div>
      ))}
      {onReport && <button onClick={() => onReport(lobby.id, order)} style={{ ...link, marginTop: 8, fontWeight: 700 }}>Record result</button>}
    </div>
  );
}

export function GroupBracketView({
  gb,
  nameOf,
  onReport,
  onClear,
  readOnly,
}: {
  gb: GroupBracket;
  nameOf: (id: string | null) => string;
  onReport?: (id: string, order: string[]) => void;
  onClear?: (id: string) => void;
  readOnly?: boolean;
}) {
  const groups: { key: string; label: string; lobbies: Lobby[] }[] = [];
  for (const l of gb.lobbies) {
    const key = `${l.bracket}-${l.round}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: lobbyLabel(gb, l), lobbies: [] };
      groups.push(g);
    }
    g.lobbies.push(l);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
      {groups.map((g) => (
        <section key={g.key}>
          <div style={heading}>{g.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.6rem" }}>
            {g.lobbies.map((l) => (
              <LobbyCard
                key={`${l.id}|${l.entrants.join(",")}`}
                lobby={l}
                gb={gb}
                nameOf={nameOf}
                onReport={onReport}
                onClear={onClear}
                readOnly={readOnly}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
