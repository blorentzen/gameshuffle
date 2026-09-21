"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { nightVisual, gameArtFallback } from "@/data/game-night-visuals";
import { boardGameLevelLabel } from "@/data/board-games";
import type { NightGame } from "@/lib/game-nights/types";
import type { LiveAttendee } from "@/components/game-nights/LiveNightAttendees";

/**
 * Full live board for the in-person display mode — title, time/place, games, and
 * attendees, all seeded server-side and (for paid hosts) kept in sync via
 * Supabase realtime: edits the host makes on the manage page and new RSVPs push
 * to the projected board without a refresh. Free hosts get the static board.
 */

export interface NightDisplayData {
  title: string;
  starts_at: string | null;
  timezone: string | null;
  place: string | null;
  genres: string[] | null;
  level: string | null;
  cover_image_url?: string | null;
  games: NightGame[];
}

function fmtWhen(iso: string | null, tz: string | null): string {
  if (!iso) return "Date to be announced";
  try {
    return new Date(iso).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz || undefined });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function LiveNightBoard({
  nightId,
  initial,
  initialAttendees,
  initialCount,
  live,
}: {
  nightId: string;
  initial: NightDisplayData;
  initialAttendees: LiveAttendee[];
  initialCount: number;
  live: boolean;
}) {
  const [night, setNight] = useState<NightDisplayData>(initial);
  const [attendees, setAttendees] = useState<LiveAttendee[]>(initialAttendees);
  const [count, setCount] = useState<number>(initialCount);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/game-nights/${nightId}/live`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (cancelled || !j?.ok) return;
        if (j.night) setNight((prev) => ({ ...prev, ...j.night }));
        setAttendees(j.going as LiveAttendee[]);
        setCount(j.count as number);
      } catch { /* keep current */ }
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`bgn-board-${nightId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_game_nights", filter: `id=eq.${nightId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "board_game_night_rsvps", filter: `night_id=eq.${nightId}` }, () => void refresh())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [live, nightId]);

  const visual = nightVisual(nightId);
  const level = boardGameLevelLabel(night.level);
  const genres = night.genres ?? [];
  const games = night.games ?? [];

  return (
    <main className="bgn-display" style={{ background: night.cover_image_url ? undefined : visual.gradient }}>
      {night.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={night.cover_image_url} alt="" className="bgn-display__bg" />
      )}
      <div className="bgn-display__inner">
        <header className="bgn-display__head">
          <p className="bgn-display__eyebrow">
            {visual.emoji} Game night{level ? ` · ${level}` : ""}
            {live && <span className="bgn-live-dot"> ● Live</span>}
          </p>
          <h1 className="bgn-display__title">{night.title}</h1>
          <p className="bgn-display__meta">{fmtWhen(night.starts_at, night.timezone)}{night.place ? ` · ${night.place}` : ""}</p>
          {genres.length > 0 && (
            <div className="bgn-display__tags">
              {genres.slice(0, 6).map((g) => <span key={g} className="bgn-display__tag">{g}</span>)}
            </div>
          )}
        </header>

        <div className="bgn-display__cols">
          {games.length > 0 && (
            <section className="bgn-display__panel">
              <h2 className="bgn-display__h2">On the table</h2>
              <ul className="bgn-display__games">
                {games.slice(0, 12).map((g, i) => (
                  <li key={`${g.name}-${i}`} className="bgn-display__game">
                    {g.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.imageUrl} alt="" className="bgn-display__game-art" />
                    ) : (() => {
                      const fpo = gameArtFallback(g.name, g.length);
                      return <span className="bgn-display__game-art bgn-display__game-art--fpo" style={{ backgroundImage: fpo.gradient }} aria-hidden>{fpo.initials}</span>;
                    })()}
                    <span className="bgn-display__game-name">{g.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="bgn-display__panel bgn-display__panel--who">
            <h2 className="bgn-display__h2">Going ({count})</h2>
            {attendees.length === 0 ? (
              <p style={{ opacity: 0.8 }}>No RSVPs yet.</p>
            ) : (
              <ul className="bgn-attendee-list">
                {attendees.map((a) => {
                  const name = a.display_name || a.username || "Member";
                  return (
                    <li key={a.id} className="bgn-attendee">
                      <span className="bgn-attendee__link">
                        <UserAvatar
                          user={{
                            id: a.id,
                            avatar_source: (a.avatar_source as AvatarSource | null) ?? "dicebear",
                            avatar_seed: a.avatar_seed ?? null,
                            avatar_options: a.avatar_options ?? null,
                            discord_avatar: a.discord_avatar ?? null,
                            twitch_avatar: a.twitch_avatar ?? null,
                          }}
                          size={36}
                          alt={name}
                        />
                        <span className="bgn-attendee__name">{name}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <p className="bgn-display__foot">
          <Link href={`/game-nights/${nightId}`}>gameshuffle.co/game-nights</Link>
        </p>
      </div>
    </main>
  );
}
