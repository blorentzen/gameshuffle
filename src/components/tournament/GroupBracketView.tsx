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
import { isBye, lobbyLabel, finalLobbies, type GroupBracket, type Lobby } from "@/lib/tournaments/groups";

// Grounded, elevated surface (matches the manage stat-card pattern) so lobby
// cards read clearly instead of blending into a same-color page background.
const card: CSSProperties = { border: "1px solid var(--border-default)", borderRadius: 10, padding: "0.6rem 0.7rem", background: "var(--surface-raised, var(--surface-default))" };
const link: CSSProperties = { border: "none", background: "none", color: "var(--bg-primary, var(--primary-600))", cursor: "pointer", fontSize: "var(--font-size-14)", padding: 0, fontWeight: 600 };
const heading: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 6 };

function LobbyCard({
  lobby,
  gb,
  nameOf,
  onReport,
  onClear,
  readOnly,
  isFinal,
}: {
  lobby: Lobby;
  gb: GroupBracket;
  nameOf: (id: string | null) => string;
  onReport?: (id: string, order: string[]) => void;
  onClear?: (id: string) => void;
  readOnly?: boolean;
  isFinal?: boolean;
}) {
  const adv = Math.max(1, Math.min(gb.rules.advance, lobby.entrants.length - 1));
  // Tap model. Non-final lobbies: tap the players moving on (order among them
  // doesn't matter). The final lobby: tap in finishing order for the podium.
  const [picked, setPicked] = useState<string[]>([]);
  const cap = isFinal ? lobby.entrants.length : adv;
  const ready = picked.length === cap;
  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= cap) return prev; // non-final: can't exceed the advance count
      return [...prev, id];
    });
  };
  const record = () => {
    if (!onReport || !ready) return;
    const order = isFinal ? picked : [...picked, ...lobby.entrants.filter((e) => !picked.includes(e))];
    onReport(lobby.id, order);
  };

  if (isBye(lobby)) {
    return (
      <div style={card}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Bye</span>
        <div style={{ fontWeight: 600 }}>{nameOf(lobby.entrants[0])} advances</div>
      </div>
    );
  }

  // Already reported.
  if (lobby.results) {
    return (
      <div style={card}>
        {lobby.results.map((id, i) => {
          const advancing = i < adv;
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
              <span style={{ width: 16, fontSize: 12, fontWeight: 700, color: isFinal ? "var(--text-primary)" : advancing ? "var(--bg-primary, var(--primary-600))" : "var(--text-tertiary)", textAlign: "center" }}>
                {isFinal ? i + 1 : advancing ? "▲" : "·"}
              </span>
              <span style={{ flex: 1, fontSize: 14, color: advancing || isFinal ? "var(--text-primary)" : "var(--text-tertiary)", fontWeight: advancing ? 700 : 400 }}>{nameOf(id)}</span>
              {!isFinal && <span style={{ fontSize: 11, color: advancing ? "var(--success-700, var(--bg-primary))" : "var(--text-tertiary)" }}>{advancing ? "moves on" : "out"}</span>}
            </div>
          );
        })}
        {!readOnly && onClear && <button onClick={() => onClear(lobby.id)} style={{ ...link, marginTop: 6 }}>Edit</button>}
      </div>
    );
  }

  // Not yet played, read-only surface (public / results).
  if (readOnly) {
    return (
      <div style={{ ...card, opacity: 0.7 }}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Not played</span>
        <div style={{ fontSize: 13 }}>{lobby.entrants.map((id) => nameOf(id)).join(", ")}</div>
      </div>
    );
  }

  // Editable — the tap flow.
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>
        {isFinal ? "Tap players in finishing order" : `Tap the ${adv} ${adv === 1 ? "player" : "players"} moving on`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {lobby.entrants.map((id) => {
          const pos = picked.indexOf(id);
          const on = pos >= 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                padding: "0.4rem 0.5rem", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${on ? "var(--primary-500)" : "var(--border-default)"}`,
                background: on ? "var(--surface-selected, var(--primary-100))" : "var(--surface-default)",
                color: "var(--text-primary)",
              }}
            >
              <span style={{
                flexShrink: 0, width: 22, height: 22, borderRadius: "50%", fontSize: 11, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: on ? "var(--primary-500)" : "var(--background-secondary)",
                color: on ? "var(--text-on-primary, #fff)" : "var(--text-tertiary)",
              }}>
                {on ? (isFinal ? pos + 1 : "✓") : ""}
              </span>
              <span style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(id)}</span>
            </button>
          );
        })}
      </div>
      {onReport && (
        <button onClick={record} disabled={!ready} style={{ ...link, marginTop: 8, fontWeight: 700, opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "default" }}>
          {isFinal ? `Record placements (${picked.length}/${cap})` : `Record (${picked.length}/${adv})`}
        </button>
      )}
    </div>
  );
}

export function GroupBracketView({
  gb,
  nameOf,
  onReport,
  onClear,
  readOnly,
  placementMode,
}: {
  gb: GroupBracket;
  nameOf: (id: string | null) => string;
  onReport?: (id: string, order: string[]) => void;
  onClear?: (id: string) => void;
  readOnly?: boolean;
  /** When true, every lobby is tapped in full finishing order (for points /
   *  standings), not just "who moves on". */
  placementMode?: boolean;
}) {
  const finalIds = new Set(finalLobbies(gb).map((l) => l.id));
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
                isFinal={placementMode || finalIds.has(l.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
