"use client";

/**
 * The team series piece on a streamer's GameShuffle overlay (Summer Series pick 8A): the six teams with the
 * streamer's own team lit up, the race count and each race's points; during the track draft, who's on the
 * clock instead. Shows only for a player in a live series (store.seriesPieceFor), reads its own small feed
 * every few seconds while the overlay is visible. Kept out of the way of Mario Kart's places and map
 * (top right by default).
 */

import { useEffect, useState, type CSSProperties } from "react";
import type { SeriesOverlayData } from "@/lib/series/view";
import { clock, useSecondsUntil } from "./SeriesBits";
import "@/styles/series-overlay.css";

const SAMPLE: SeriesOverlayData = {
  title: "GS Summer Series", path: "/summer-series",
  night: { label: "Kickoff", state: "live", racesDone: 7, racesTotal: 12, startsAt: null },
  teams: [
    { id: "a", tag: "KC", name: "Kart Club", color: "#2f6fe4", ink: "#ffffff", points: 128, place: 1, last: 22 },
    { id: "b", tag: "NO", name: "Night Owls", color: "#7c4ddb", ink: "#ffffff", points: 112, place: 2, last: 19 },
    { id: "c", tag: "RS", name: "Red Shells", color: "#d63a3a", ink: "#ffffff", points: 101, place: 3, last: 12 },
    { id: "d", tag: "PG", name: "Pink Gold", color: "#c2307f", ink: "#ffffff", points: 88, place: 4, last: 11 },
    { id: "e", tag: "BB", name: "Banana Bunch", color: "#b98a06", ink: "#141a2e", points: 79, place: 5, last: 10 },
    { id: "f", tag: "GM", name: "Green Machine", color: "#2e9a52", ink: "#ffffff", points: 66, place: 6, last: 8 },
  ],
  draft: null, champion: null, now: 0,
};

function useSeries(slug: string | null): (SeriesOverlayData & { skew: number }) | null {
  const [data, setData] = useState<(SeriesOverlayData & { skew: number }) | null>(null);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch(`/api/series/${slug}/overlay`, { cache: "no-store" }).catch(() => null);
      const j = res?.ok ? ((await res.json().catch(() => null)) as SeriesOverlayData | null) : null;
      if (alive && j) setData({ ...j, skew: j.now - Date.now() });
    };
    void load();
    const id = window.setInterval(load, 3000);
    return () => { alive = false; window.clearInterval(id); };
  }, [slug]);
  return data;
}

export function SeriesOverlay({ piece, sample, style }: { piece?: { slug: string; teamId: string } | null; sample?: boolean; style?: CSSProperties }) {
  const live = useSeries(sample ? null : piece?.slug ?? null);
  const data = sample ? { ...SAMPLE, skew: 0 } : live;
  const mine = sample ? "a" : piece?.teamId ?? null;
  const d = data?.draft ?? null;
  const left = useSecondsUntil(d?.status === "running" ? d.deadline : null, data?.skew ?? 0);
  if (!data || !data.teams.length) return null;
  const n = data.night;
  const top = Math.max(1, ...data.teams.map((t) => t.points));
  const onClock = d?.onClock ? data.teams.find((t) => t.id === d.onClock) : null;
  const champ = data.champion ? data.teams.find((t) => t.id === data.champion) : null;
  const head = d && d.status !== "done"
    ? `${n?.label ?? ""} track draft · turn ${d.turn} of ${d.total}`
    : n?.state === "live" ? `${n.label} · race ${Math.min(n.racesTotal, n.racesDone + 1)} of ${n.racesTotal}`
      : n?.state === "done" ? `${n.label} · final`
        : n ? `${n.label} · next` : "";

  return (
    <div className="sso" style={style}>
      <div className="sso__card">
        <div className="sso__top">
          <span>{data.title}</span>
          <b>{champ ? `Champions: ${champ.name}` : head}</b>
        </div>
        {d && d.status !== "done" ? (
          <div className="sso__draft">
            {onClock ? (
              <div className="sso__clock">
                <span className="sso__tag" style={{ background: onClock.color, color: onClock.ink }}>{onClock.tag}</span>
                <span className="sso__who"><b>{onClock.name}</b><small>{onClock.id === mine ? "Your turn: ban one, protect one" : "Ban one, protect one"}</small></span>
                <b className="sso__secs">{d.status === "paused" ? "Paused" : left != null ? clock(left) : ""}</b>
              </div>
            ) : (
              <p className="sso__line">The order is set. The draft starts soon.</p>
            )}
            {d.last && <p className="sso__line">{d.last}</p>}
            <p className="sso__line">{d.pool} tracks left · {d.open} still open</p>
          </div>
        ) : (
          <ol className="sso__rows">
            {data.teams.map((t) => (
              <li key={t.id} className={`sso__row${t.id === mine ? " is-me" : ""}`} style={{ ["--tc" as string]: t.color }}>
                <span className="sso__tag" style={{ background: t.color, color: t.ink }}>{t.tag}</span>
                <span className="sso__bar"><i style={{ width: `${Math.round((t.points / top) * 100)}%` }} /></span>
                <b className="sso__pts">{t.points}</b>
                <span key={`${t.id}-${n?.racesDone ?? 0}`} className="sso__gain">{t.last ? `+${t.last}` : ""}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="sso__foot">gameshuffle.co{data.path}</div>
      </div>
    </div>
  );
}
