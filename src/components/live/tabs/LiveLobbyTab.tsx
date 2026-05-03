"use client";

/**
 * Lobby tab — live combo cards for every participant currently in the
 * session lobby. Reads from `useLiveState().participants` (kept fresh
 * by the live-participants-{id} realtime channel) so combos animate in
 * as viewers `!gs-shuffle` from chat.
 *
 * Visual-first: each viewer gets a 4-slot card (character + vehicle +
 * wheels + glider) so the lobby reads as a wall of identities, not a
 * roster of names. Broadcaster is auto-seated and surfaces with an
 * accent badge so viewers can spot the streamer's combo at a glance.
 */

import { useMemo } from "react";
import Image from "next/image";
import { Badge } from "@empac/cascadeds";
import { getImagePath } from "@/lib/images";
import type { ParticipantRow } from "@/lib/sessions/queries";
import { useLiveState } from "../RealtimeLiveView";

interface KartComboShape {
  character?: { name?: string; img?: string };
  vehicle?: { name?: string; img?: string };
  wheels?: { name?: string; img?: string };
  glider?: { name?: string; img?: string };
}

export function LiveLobbyTab() {
  const live = useLiveState();
  const ordered = useMemo(() => orderParticipants(live.participants), [
    live.participants,
  ]);

  if (ordered.length === 0) {
    return (
      <div className="live-lobby__empty">
        <p className="live-lobby__empty-headline">No one&rsquo;s in the lobby yet.</p>
        <p className="live-lobby__empty-sub">
          Viewers join from chat with <code>!gs-join</code>; the streamer is
          auto-seated when the session activates.
        </p>
      </div>
    );
  }

  return (
    <div className="live-lobby">
      <p className="live-lobby__intro">
        {ordered.length} {ordered.length === 1 ? "viewer" : "viewers"} in the
        lobby. Each viewer&rsquo;s current combo updates the moment they
        <code>!gs-shuffle</code> in chat.
      </p>
      <ul className="live-lobby__grid">
        {ordered.map((p) => (
          <li key={p.id}>
            <ParticipantCard participant={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function orderParticipants(rows: ParticipantRow[]): ParticipantRow[] {
  // Broadcaster first, then by join order — gives the streamer's
  // combo top placement so viewers can spot it instantly.
  return [...rows].sort((a, b) => {
    if (a.is_broadcaster !== b.is_broadcaster) {
      return a.is_broadcaster ? -1 : 1;
    }
    return a.joined_at.localeCompare(b.joined_at);
  });
}

function ParticipantCard({ participant }: { participant: ParticipantRow }) {
  const combo = (participant.current_combo as KartComboShape | null) ?? null;
  const name = participant.display_name ?? participant.platform_user_id;
  const slots = [
    { label: "Character", piece: combo?.character },
    { label: "Vehicle", piece: combo?.vehicle },
    { label: "Wheels", piece: combo?.wheels },
    { label: "Glider", piece: combo?.glider },
  ];

  return (
    <article
      className={`live-lobby__card${
        participant.is_broadcaster ? " live-lobby__card--broadcaster" : ""
      }`}
    >
      <header className="live-lobby__card-header">
        <h3 className="live-lobby__card-name">{name}</h3>
        {participant.is_broadcaster && (
          <Badge variant="info" size="small">
            Streamer
          </Badge>
        )}
      </header>
      {combo ? (
        <div className="live-lobby__card-slots">
          {slots.map((slot) => (
            <ComboSlot
              key={slot.label}
              label={slot.label}
              piece={slot.piece}
            />
          ))}
        </div>
      ) : (
        <p className="live-lobby__card-empty">
          No combo yet — type <code>!gs-shuffle</code> in chat to roll one.
        </p>
      )}
    </article>
  );
}

function ComboSlot({
  label,
  piece,
}: {
  label: string;
  piece: { name?: string; img?: string } | undefined;
}) {
  if (!piece || !piece.img) {
    return (
      <div className="live-lobby__slot live-lobby__slot--empty">
        <span className="live-lobby__slot-label">{label}</span>
      </div>
    );
  }
  return (
    <div className="live-lobby__slot">
      <div className="live-lobby__slot-img">
        <Image
          src={getImagePath(piece.img)}
          alt={piece.name ?? label}
          width={72}
          height={72}
          unoptimized
        />
      </div>
      <span className="live-lobby__slot-name">{piece.name ?? "—"}</span>
      <span className="live-lobby__slot-label">{label}</span>
    </div>
  );
}
