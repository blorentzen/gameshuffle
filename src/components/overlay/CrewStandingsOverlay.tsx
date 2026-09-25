"use client";

/**
 * Crew standings overlay — a persistent scoreboard (ttlMs null) the tournament
 * run flow broadcasts as results come in, so a multi-crew battle shows live on
 * stream. Stays until replaced; a `cleared` payload (fewer than 2 crews) renders
 * nothing. Self-contained styling so it needs no overlay.css additions.
 */

import type { CSSProperties } from "react";
import { IconFlagCheck } from "@tabler/icons-react";
import { PlaceMedal } from "@/components/tournament/PlaceMedal";

export interface CrewStandingsOverlayCrew {
  name: string;
  points: number;
  memberCount: number;
}

export interface CrewStandingsOverlayPayload {
  tournamentTitle?: string | null;
  crews?: CrewStandingsOverlayCrew[];
  cleared?: boolean;
}



export function CrewStandingsOverlay({
  payload,
  style,
}: {
  payload: CrewStandingsOverlayPayload;
  style?: CSSProperties;
}) {
  const crews = payload.crews ?? [];
  if (payload.cleared || crews.length < 2) return null;
  // Overlay real estate is small — cap the board.
  const rows = crews.slice(0, 6);

  return (
    <div style={style}>
      <div
        style={{
          minWidth: 220,
          maxWidth: 300,
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(12,16,28,0.82)",
          backdropFilter: "blur(6px)",
          boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>
          <IconFlagCheck size={16} stroke={2} aria-hidden /> Crew Standings
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 20, textAlign: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                <PlaceMedal rank={i + 1} />
              </span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                {c.points}
              </span>
            </div>
          ))}
        </div>
        {payload.tournamentTitle ? (
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {payload.tournamentTitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
