"use client";

/**
 * Lobby tab — live combo cards for every participant currently in the
 * session lobby. Reads from `useLiveState().participants` (kept fresh
 * by the live-participants-{id} realtime channel) so combos animate in
 * as viewers `!gs-shuffle` from chat.
 *
 * Visual-first: each viewer's card shows their roll for the current game
 * (a kart combo, a fighter, a hero, a weapon kit, a rider and machine) so the
 * lobby reads as a wall of identities, not a roster of names. Broadcaster is auto-seated and surfaces with an
 * accent badge so viewers can spot the streamer's combo at a glance.
 */

import { useMemo } from "react";
import { Badge } from "@empac/cascadeds";
import { RollSlotArt } from "@/components/twitch/RollSlotArt";
import { rollSlots, type RollSlot } from "@/lib/twitch/chatRoll";
import type { ParticipantRow } from "@/lib/sessions/queries";
import { useLiveState } from "../RealtimeLiveView";

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
        {`${ordered.length} ${ordered.length === 1 ? "viewer" : "viewers"} in the lobby. Each viewer’s roll updates the moment they type `}
        <code>!gs-shuffle</code>{" in chat."}
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
  const slots = rollSlots(participant.current_combo);
  const name = participant.display_name ?? participant.platform_user_id;

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
      {slots.length ? (
        <div className="live-lobby__card-slots">
          {slots.map((slot, i) => (
            <ComboSlot key={i} slot={slot} />
          ))}
        </div>
      ) : (
        <p className="live-lobby__card-empty">
          Nothing rolled yet. Type <code>!gs-shuffle</code> in chat to roll.
        </p>
      )}
    </article>
  );
}

function ComboSlot({ slot }: { slot: RollSlot }) {
  return (
    <div className="live-lobby__slot">
      <RollSlotArt slot={slot} className="live-lobby__slot-img" glyphSize={30} compact />
      <span className="live-lobby__slot-name">{slot.name}</span>
      <span className="live-lobby__slot-label">{slot.detail ?? slot.label}</span>
    </div>
  );
}
