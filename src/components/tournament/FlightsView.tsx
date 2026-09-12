"use client";

/**
 * Run/results view for the Flights (multi-flight points) format. Renders each
 * round's flights; per flight the organizer taps players in finishing order to
 * record a race. Read-only mode powers the public + results surfaces.
 *
 * Used by the manage page (and the public tournament page in read-only mode).
 */

import { useState, type CSSProperties } from "react";
import type { FlightsState, Flight, RacePlacements } from "@/lib/tournaments/flights";

const card: CSSProperties = { border: "1px solid var(--border-default)", borderRadius: 10, padding: "0.7rem 0.8rem", background: "var(--surface-raised, var(--surface-default))" };
const link: CSSProperties = { border: "none", background: "none", color: "var(--bg-primary, var(--primary-600))", cursor: "pointer", fontSize: "var(--font-size-14)", padding: 0, fontWeight: 600 };
const heading: CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 8 };

function FlightCard({
  flight,
  racesPerRound,
  nameOf,
  onReportRace,
  onFillRaces,
  onClearRace,
  readOnly,
}: {
  flight: Flight;
  racesPerRound: number;
  nameOf: (id: string | null) => string;
  onReportRace?: (flightId: string, placements: RacePlacements) => void;
  onFillRaces?: (flightId: string, placements: RacePlacements) => void;
  onClearRace?: (flightId: string, raceIdx: number) => void;
  readOnly?: boolean;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const done = flight.races.length >= racesPerRound;
  const remaining = racesPerRound - flight.races.length;
  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const placementsFromPicked = (): RacePlacements => {
    const placements: RacePlacements = {};
    picked.forEach((id, i) => { placements[id] = i + 1; });
    return placements;
  };
  const record = () => {
    if (!onReportRace || picked.length === 0) return;
    onReportRace(flight.id, placementsFromPicked());
    setPicked([]);
  };
  const recordAll = () => {
    if (!onFillRaces || picked.length === 0) return;
    onFillRaces(flight.id, placementsFromPicked());
    setPicked([]);
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Flight {flight.slot + 1}</span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{flight.races.length}/{racesPerRound} races · {flight.players.length} players</span>
      </div>

      {/* Reported races */}
      {flight.races.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
          {flight.races.map((race, ri) => {
            const order = Object.entries(race).sort((a, b) => a[1] - b[1]).map(([id]) => id);
            return (
              <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: "var(--text-tertiary)", minWidth: 46 }}>Race {ri + 1}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                  {order.map((id) => nameOf(id)).join(" › ")}
                </span>
                {!readOnly && onClearRace && (
                  <button onClick={() => onClearRace(flight.id, ri)} aria-label={`Remove race ${ri + 1}`} style={{ ...link, color: "var(--text-tertiary)", fontWeight: 700 }}>×</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tap the next race in finishing order. */}
      {!readOnly && !done && onReportRace && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 5 }}>Tap players in finishing order — race {flight.races.length + 1}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {flight.players.map((id) => {
              const pos = picked.indexOf(id);
              const on = pos >= 0;
              return (
                <button key={id} type="button" onClick={() => toggle(id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", minWidth: 0,
                    padding: "0.35rem 0.5rem", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${on ? "var(--primary-500)" : "var(--border-default)"}`,
                    background: on ? "var(--surface-selected, var(--primary-100))" : "var(--surface-default)", color: "var(--text-primary)" }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", fontSize: 11, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: on ? "var(--primary-500)" : "var(--background-secondary)",
                    color: on ? "var(--text-on-primary, #fff)" : "var(--text-tertiary)" }}>{on ? pos + 1 : ""}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(id)}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={record} disabled={picked.length === 0}
              style={{ ...link, opacity: picked.length ? 1 : 0.45, cursor: picked.length ? "pointer" : "default" }}>
              Save race {flight.races.length + 1} ({picked.length} placed)
            </button>
            {onFillRaces && remaining > 1 && (
              <button onClick={recordAll} disabled={picked.length === 0}
                style={{ ...link, opacity: picked.length ? 1 : 0.45, cursor: picked.length ? "pointer" : "default" }}>
                Record all {remaining} races
              </button>
            )}
          </div>
        </div>
      )}

      {!readOnly && done && <div style={{ fontSize: 12, color: "var(--success-700, var(--bg-primary))", fontWeight: 600 }}>✓ Round races complete</div>}
    </div>
  );
}

export function FlightsView({
  state,
  nameOf,
  onReportRace,
  onFillRaces,
  onClearRace,
  readOnly,
}: {
  state: FlightsState;
  nameOf: (id: string | null) => string;
  onReportRace?: (flightId: string, placements: RacePlacements) => void;
  onFillRaces?: (flightId: string, placements: RacePlacements) => void;
  onClearRace?: (flightId: string, raceIdx: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
      {state.rounds.map((flights, r) => (
        <section key={r}>
          <div style={heading}>Round {r + 1}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0.6rem" }}>
            {flights.map((f) => (
              <FlightCard
                key={f.id}
                flight={f}
                racesPerRound={state.rules.racesPerRound}
                nameOf={nameOf}
                onReportRace={onReportRace}
                onFillRaces={onFillRaces}
                onClearRace={onClearRace}
                readOnly={readOnly}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
