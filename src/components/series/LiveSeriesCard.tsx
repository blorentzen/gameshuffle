"use client";

/**
 * The team series on a player's live page (Summer Series pick 7A): their team, the night's standings and
 * the predictions about their team (plus who wins the night), picked from right there. Hidden unless the
 * streamer plays in a live series. Pots are shared with every other stream.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { currentNight, seriesPath, type SeriesView } from "@/lib/series/view";
import { ORDINAL } from "@/lib/series/rules";
import { LivePill, TeamTag } from "./SeriesBits";
import { SeriesPredict, type MyPicks } from "./SeriesPredict";
import "@/styles/series.css";

interface Me { signedIn: boolean; picks: MyPicks; balance: number | null }

export function LiveSeriesCard({ streamerSlug, streamerName }: { streamerSlug: string; streamerName: string }) {
  const [piece, setPiece] = useState<{ slug: string; teamId: string } | null>(null);
  const [view, setView] = useState<SeriesView | null>(null);
  const [me, setMe] = useState<Me>({ signedIn: false, picks: {}, balance: null });

  useEffect(() => {
    let alive = true;
    fetch(`/api/series/for/${encodeURIComponent(streamerSlug)}`).then((r) => r.json()).then((j: { series: { slug: string; teamId: string } | null }) => { if (alive) setPiece(j.series); }).catch(() => {});
    return () => { alive = false; };
  }, [streamerSlug]);

  const load = useCallback(async () => {
    if (!piece) return;
    const [v, m] = await Promise.all([
      fetch(`/api/series/${piece.slug}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/series/${piece.slug}/me`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (v) setView(v as SeriesView);
    if (m) setMe(m as Me);
  }, [piece]);

  useEffect(() => {
    if (!piece) return;
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 6000);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, [piece, load]);

  if (!piece || !view) return null;
  const team = view.teams.find((t) => t.id === piece.teamId);
  const night = currentNight(view);
  if (!team || !night) return null;
  const row = night.teams.find((r) => r.teamId === team.id);
  const preds = view.predictions.filter((p) => p.nightId === night.id && (p.teamId === team.id || p.kind === "night_winner"));
  const path = seriesPath(view.slug);
  return (
    <section className="live-poll ss-livecard" aria-labelledby="ss-livecard-h" style={{ ["--tc" as string]: team.color }}>
      <div className="ss-livecard__head">
        <span className="ss-kicker">{view.title}</span>
        <h2 id="ss-livecard-h" className="ss-livecard__title"><TeamTag team={team} /> {streamerName} races for {team.name}</h2>
        <p className="ss-livecard__line">
          {night.state === "live" ? <LivePill>{night.label} · race {Math.min(night.racesTotal, night.racesDone + 1)} of {night.racesTotal}</LivePill> : <span className="ss-state">{night.label}{night.state === "done" ? ": final" : ""}</span>}
          {row && night.racesDone > 0 && <span className="ss-state"> {team.name} {row.place === 1 ? "lead" : `are ${ORDINAL(row.place)}`} with {row.points}</span>}
        </p>
      </div>
      {preds.length > 0 && (
        <SeriesPredict
          slug={view.slug}
          night={night}
          teams={view.teams.filter((t) => t.id === team.id)}
          predictions={preds}
          picks={me.picks}
          balance={me.balance}
          signedIn={me.signedIn}
          loginHref={`/login?redirect=${encodeURIComponent(`/live/${streamerSlug}`)}`}
          focusTeamId={team.id}
          from={streamerSlug}
          bare
          onChanged={load}
        />
      )}
      <ArrowLink href={path}>Standings, teams and all predictions</ArrowLink>
    </section>
  );
}
