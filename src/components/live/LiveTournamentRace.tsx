"use client";

/**
 * "Now racing" banner on /live — shows the organizer's in-progress tournament's
 * current race, independent of whether a GS session is live. Self-loading: it
 * looks for the streamer's in-progress tournament (public read) every minute,
 * and while one runs it follows that tournament in realtime, so advancing the
 * race (web or !gs-tourney) updates here in place.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconFlag } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { listRaces, raceIndex, type RaceSource } from "@/lib/tournaments/races";
import { everyVisible } from "@/lib/hooks/everyVisible";

interface LiveTournament extends RaceSource {
  id: string;
  title: string;
}

export function LiveTournamentRace({ ownerUserId }: { ownerUserId: string }) {
  const [t, setT] = useState<LiveTournament | null>(null);

  const load = useCallback(async () => {
    if (!ownerUserId) return;
    const { data } = await createClient()
      .from("tournaments")
      .select("*") // "*" so a missing column (e.g. bracket) can't error the read.
      .eq("organizer_id", ownerUserId)
      .eq("status", "in_progress")
      .order("date_time", { ascending: true, nullsFirst: false })
      .limit(1);
    setT((data?.[0] as LiveTournament | undefined) ?? null);
  }, [ownerUserId]);

  // With no tournament running, look again every minute while the page is visible. This used to
  // hold a realtime connection for every /live visitor, offline streamers included.
  const running = t?.id ?? null;
  useEffect(() => {
    if (running) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read of server data, set when it answers
    void load();
    return everyVisible(load, 60_000);
  }, [load, running]);

  // While one runs, its changes (the current-race pointer, the status flip at the end) re-load the
  // banner in place; once it ends the read comes back empty and the connection closes.
  useEffect(() => {
    if (!running) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`live-tourney-${running}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${running}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, running]);

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
        <span className="live-tournament-race__eyebrow"><IconFlag size={14} aria-hidden />Now racing · {idx + 1} / {races.length}</span>
        <span className="live-tournament-race__name">{race.sublabel || race.label}</span>
        <span className="live-tournament-race__title">{t.title}</span>
      </div>
    </Link>
  );
}
