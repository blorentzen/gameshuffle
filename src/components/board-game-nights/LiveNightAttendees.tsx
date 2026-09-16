"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";

/**
 * Attendees ("Going") list on a night's event page. When `live` (a paid host),
 * it subscribes to the night's RSVPs via Supabase realtime and refreshes the
 * list as people RSVP during the event — a live in-room display. When not live,
 * it just renders the server snapshot (refresh to update). Degrades cleanly: if
 * the realtime publication isn't set up, no events arrive and it stays on the
 * snapshot.
 */

export interface LiveAttendee {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_source?: string | null;
  avatar_seed?: string | null;
  avatar_options?: Record<string, string> | null;
  discord_avatar?: string | null;
  twitch_avatar?: string | null;
}

export function LiveNightAttendees({
  nightId,
  initialAttendees,
  initialCount,
  live,
}: {
  nightId: string;
  initialAttendees: LiveAttendee[];
  initialCount: number;
  live: boolean;
}) {
  const [attendees, setAttendees] = useState<LiveAttendee[]>(initialAttendees);
  const [count, setCount] = useState<number>(initialCount);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/board-game-nights/${nightId}/live`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!cancelled && j?.ok) { setAttendees(j.going as LiveAttendee[]); setCount(j.count as number); }
      } catch { /* keep current */ }
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`bgn-rsvps-${nightId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_game_night_rsvps", filter: `night_id=eq.${nightId}` }, () => { void refresh(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [live, nightId]);

  return (
    <>
      <h3 className="bgn-side__heading">
        Going ({count})
        {live && <span className="bgn-live-dot" title="Live"> ● Live</span>}
      </h3>
      {attendees.length === 0 ? (
        <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>No RSVPs yet. Be the first.</p>
      ) : (
        <ul className="bgn-attendee-list">
          {attendees.map((a) => {
            const name = a.display_name || a.username || "Member";
            const avatar = (
              <UserAvatar
                user={{
                  id: a.id,
                  avatar_source: (a.avatar_source as AvatarSource | null) ?? "dicebear",
                  avatar_seed: a.avatar_seed ?? null,
                  avatar_options: a.avatar_options ?? null,
                  discord_avatar: a.discord_avatar ?? null,
                  twitch_avatar: a.twitch_avatar ?? null,
                }}
                size={32}
                alt={name}
              />
            );
            return (
              <li key={a.id} className="bgn-attendee">
                {a.username ? (
                  <Link href={`/u/${a.username}`} className="bgn-attendee__link">{avatar}<span className="bgn-attendee__name">{name}</span></Link>
                ) : (
                  <span className="bgn-attendee__link">{avatar}<span className="bgn-attendee__name">{name}</span></span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
