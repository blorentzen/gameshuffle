"use client";

/**
 * "Now racing" banner on /live — shows the organizer's in-progress tournament's
 * current race, independent of whether a GS session is live. Self-loading and
 * Supabase-realtime: it queries the streamer's in-progress tournament (public
 * read) and re-fetches on any change to their tournaments, so advancing the
 * race (web or !gs-tourney) updates here in place.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { listRaces, raceIndex, type RaceSource } from "@/lib/tournaments/races";

interface LiveTournament extends RaceSource {
  id: string;
  title: string;
}

export function LiveTournamentRace({ ownerUserId }: { ownerUserId: string }) {
  const [t, setT] = useState<LiveTournament | null>(null);

  useEffect(() => {
    if (!ownerUserId) return;
    const supabase = createClient();
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("tournaments")
        .select("*") // "*" so a missing column (e.g. bracket) can't error the read.
        .eq("organizer_id", ownerUserId)
        .eq("status", "in_progress")
        .order("date_time", { ascending: true, nullsFirst: false })
        .limit(1);
      if (active) setT((data?.[0] as LiveTournament | undefined) ?? null);
    };
    load();

    // Any change to this organizer's tournaments (status flip or current-race
    // pointer) re-loads the banner.
    const channel = supabase
      .channel(`live-tourney-${ownerUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments", filter: `organizer_id=eq.${ownerUserId}` },
        () => { if (active) load(); },
      )
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [ownerUserId]);

  if (!t) return null;
  const races = listRaces(t);
  const idx = raceIndex(races, t.settings?.currentRaceKey ?? null);
  if (idx < 0) return null;
  const race = races[idx];

  return (
    <Link href={`/tournament/${t.id}`} className="live-tournament-race">
      {race.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={race.img} alt="" className="live-tournament-race__img" />
      ) : null}
      <div className="live-tournament-race__body">
        <span className="live-tournament-race__eyebrow">🏁 Now racing · {idx + 1} / {races.length}</span>
        <span className="live-tournament-race__name">{race.sublabel || race.label}</span>
        <span className="live-tournament-race__title">{t.title}</span>
      </div>
    </Link>
  );
}
