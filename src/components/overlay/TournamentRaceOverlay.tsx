"use client";

/**
 * Tournament "current race" overlay card — a persistent event (ttlMs null) the
 * organizer pins via the manage page or `!gs-race`. Stays until replaced; a
 * `cleared` payload renders nothing. Self-contained styling so it needs no
 * overlay.css additions.
 */

import type { CSSProperties } from "react";

export interface TournamentRaceOverlayPayload {
  tournamentTitle?: string | null;
  label?: string | null;
  name?: string | null;
  img?: string | null;
  index?: number;
  total?: number;
  cleared?: boolean;
}

export function TournamentRaceOverlay({
  payload,
  style,
}: {
  payload: TournamentRaceOverlayPayload;
  style?: CSSProperties;
}) {
  if (payload.cleared) return null;
  const idx = (payload.index ?? 0) + 1;
  const total = payload.total ?? 0;

  return (
    <div style={style}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          borderRadius: 12,
          background: "rgba(12,16,28,0.82)",
          backdropFilter: "blur(6px)",
          boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
          color: "#fff",
          maxWidth: 380,
        }}
      >
        {payload.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={payload.img} alt="" style={{ width: 60, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
        ) : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
            🏁 {total ? `Race ${idx} / ${total}` : "Now racing"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {payload.name || payload.label || "—"}
          </div>
          {payload.tournamentTitle ? (
            <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {payload.tournamentTitle}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
