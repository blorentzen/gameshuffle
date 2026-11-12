"use client";

/**
 * Races on stream (speedrun races pick 5A):
 *   - OverlayRace: the race on a runner's own OBS overlay, beside their panel in their look: the countdown, then
 *     their place and everyone's gap at the same split. Their own row is live; everyone else's waits out that runner's
 *     stream delay, so this stream never shows a split before that runner's stream does.
 *   - RaceLanes: the race's restream link (/races/<code>/obs): every runner as a lane along the bottom of a 1920 × 1080
 *     source, each after their own stream delay, the leader outlined in gold.
 */

import { useEffect, useState } from "react";
import { fmtClock, fmtDelta } from "@/lib/speedrun/time";
import { shownName } from "@/lib/speedrun/splitGroups";
import { fmtValue, laneClockMs, laneColor, outLine, rankFor, standings } from "@/lib/versus/rules";
import type { RoomView } from "@/lib/versus/types";
import type { SpeedrunLook } from "@/lib/speedrun/types";
import { useRaceRoom } from "./useRaceRoom";

const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const plain = shownName;

function gapText(gapMs: number | null, gapAt: number | null, checkpoints: string[]): string {
  if (gapMs == null) return "";
  return `+${fmtDelta(gapMs)}${gapAt != null ? ` at ${plain(checkpoints[gapAt])}` : ""}`;
}

/** The race panel on a runner's overlay (inside SpeedrunCanvas's `race` slot, so it takes the look and its units). */
export function RacePanel({ room, me, serverNow, look }: { room: RoomView; me: string; serverNow: number; look: SpeedrunLook }) {
  const where = look.layout === "strip" ? (look.position === "top" ? "strip-top" : "strip-bottom") : "column";
  if (room.status === "countdown" && room.startAt) {
    const s = Math.max(0, Math.ceil((room.startAt - serverNow) / 1000));
    return (
      <div className={`sr-ovp sr-racep sr-racep--${where} sr-racep--count`}>
        <span className="sr-eyebrow">Race starts in</span>
        <b className="sr-big">{s}</b>
        <small>GameShuffle starts your timer at 0</small>
      </div>
    );
  }
  if (room.status !== "running" && room.status !== "finished") return null;
  const n = room.checkpoints.length;
  const rows = standings(room.entrants, n);
  const mine = rows.find((r) => r.key === me);
  const head = room.status === "finished"
    ? mine?.place === 1 ? "Race · you won" : mine?.place ? `Race · ${ORD[mine.place - 1]} of ${rows.length}` : "Race over"
    : mine?.place ? `Race · ${ORD[mine.place - 1]} of ${rows.length}` : "Race";
  return (
    <div className={`sr-ovp sr-racep sr-racep--${where}`}>
      <div className="sr-racep__head"><span className="sr-eyebrow">{head}</span></div>
      <div className="sr-racep__rows">
        {rows.slice(0, 8).map((r) => {
          const e = room.entrants.find((x) => x.key === r.key)!;
          // The panel is small: the leader's time at their last split, everyone else's gap without where it was taken.
          const right = r.status === "out" ? "Out" : r.leader ? (r.timeMs != null ? fmtClock(r.timeMs) : "") : gapText(r.gapMs, null, room.checkpoints);
          return (
            <div key={r.key} className={`sr-racep__row${r.key === me ? " is-me" : ""}${r.status === "out" ? " is-out" : ""}`}>
              <span className="p">{r.place ?? ""}</span>
              <span className="nm">{e.name}</span>
              <span className={`t${!r.leader && r.gapMs ? " behind" : ""}`}>{right}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The race on a runner's own overlay: asks the site every few seconds whether they're in one, then follows it. */
export function OverlayRace({ raceUrl, look }: { raceUrl: string; look: SpeedrunLook }) {
  const [race, setRace] = useState<{ watchUrl: string; key: string } | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ask = async () => {
      let next: { watchUrl: string; key: string } | null = null;
      try {
        const res = await fetch(raceUrl, { cache: "no-store" });
        if (res.ok) next = ((await res.json()) as { race?: { watchUrl: string; key: string } | null }).race ?? null;
      } catch { /* try again next time */ }
      if (stopped) return;
      setRace((cur) => (cur?.watchUrl === next?.watchUrl ? cur : next));
      timer = setTimeout(() => void ask(), next ? 20_000 : 10_000);
    };
    void ask();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [raceUrl]);
  if (!race) return null;
  return <OverlayRaceLive watchUrl={race.watchUrl} me={race.key} look={look} />;
}

function OverlayRaceLive({ watchUrl, me, look }: { watchUrl: string; me: string; look: SpeedrunLook }) {
  const { room, serverNow } = useRaceRoom(watchUrl, null, me);
  if (!room) return null;
  return <RacePanel room={room} me={me} serverNow={serverNow} look={look} />;
}

/** The restream link's lanes (a 1920 × 1080 OBS source). */
export function RaceLanes({ watchUrl, initial }: { watchUrl: string | null; initial: RoomView | null }) {
  const { room, serverNow } = useRaceRoom(watchUrl, initial);
  useEffect(() => {
    document.documentElement.classList.add("race-obs-route");
    return () => document.documentElement.classList.remove("race-obs-route");
  }, []);
  if (!room) return null;
  const n = room.checkpoints.length;
  const duel = room.kind === "duel";
  const rows = standings(room.entrants, n, rankFor(room.kind));
  const order = room.status === "open" || room.status === "countdown" ? room.entrants.map((e) => e.key) : rows.map((r) => r.key);
  return (
    <div className="race-obs">
      {room.status === "countdown" && room.startAt && (
        <div className="race-obs__count"><b>{Math.max(0, Math.ceil((room.startAt - serverNow) / 1000))}</b><span>{room.title}</span></div>
      )}
      <div className="race-obs__lanes" style={{ gridTemplateColumns: `repeat(${Math.max(1, order.length)}, minmax(0, 1fr))` }}>
        {order.map((key) => {
          const e = room.entrants.find((x) => x.key === key)!;
          const r = rows.find((x) => x.key === key);
          const running = room.status === "running" || room.status === "finished";
          const clock = r && running ? (r.status === "running" ? laneClockMs(e.lane, serverNow - e.delayMs) : r.timeMs) : null;
          // A duel: turns, not a clock; who they're up against, and how many cards are down.
          const value = duel ? (r?.status === "done" ? fmtValue(e.lane.finalMs, "turns") : e.lane.current != null && running ? `Turn ${e.lane.current}` : "") : clock != null ? fmtClock(clock) : "";
          const sub = duel && r && running
            ? r.status === "done" ? (r.leader ? "Won · winner" : `Won · ${r.reached} of ${n} down`) : r.status === "out" ? `${outLine(r.outReason, r.outAt, room.checkpoints)} · ${r.reached} of ${n} down` : `Up against ${room.checkpoints[r.reached] ?? "the trainer"} · ${r.reached} of ${n} down`
            : !r || !running ? "Ready" : r.status === "done" ? (r.leader ? "Finished · winner" : `Finished · ${gapText(r.gapMs, null, room.checkpoints)}`)
            : r.status === "out" ? outLine(r.outReason, r.outAt, room.checkpoints, plain)
              : `${room.checkpoints[r.reached] ? plain(room.checkpoints[r.reached]) : "Starting"}${r.leader ? " · leader" : r.gapMs != null ? ` · ${gapText(r.gapMs, r.gapAt, room.checkpoints)}` : ""}`;
          const done = r?.reached ?? 0;
          return (
            <div key={key} className={`race-obs__lane${r?.leader && running ? " is-first" : ""}${r?.status === "out" ? " is-out" : ""}`} style={{ "--lane": laneColor(room.entrants.findIndex((x) => x.key === key) + 1) } as React.CSSProperties}>
              <span className="n"><span>{running && r?.place ? `${r.place}. ` : ""}{e.name}</span><span className="t">{value}</span></span>
              <span className="s">{sub}</span>
              <span className="bar">{Array.from({ length: Math.min(n, 60) }, (_, j) => <i key={j} className={r?.status === "done" ? "f" : j < done * Math.min(n, 60) / Math.max(1, n) ? "d" : ""} />)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
