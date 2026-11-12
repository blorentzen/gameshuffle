"use client";

/**
 * A player's own arena in a duel room (duels picks 2026-11-11): at Go it opens their Trainer Road run for the room
 * (POST /api/races/<code> { action: "play" }, which also picks a run back up after a reload), then plays it in the
 * Daily Duel's arena with no professor and no tools. Every step goes through Trainer Road's own route, which tells the
 * room how far they've got. When their duel ends, a line says how it went while the others finish.
 */

import { useEffect, useState } from "react";
import { DuelArena } from "@/components/originals/duel/DuelArena";
import { DuelZoom } from "@/components/originals/duel/DuelZoom";
import { useDuelPlay } from "@/components/originals/duel/useDuelPlay";
import { ArrowLink } from "@/components/ui/ArrowLink";
import type { DuelCardView, DuelRunView } from "@/lib/originals/duel/view";
import type { RoomStatus } from "@/lib/versus/types";

const jsonFetch = (path: string, init: RequestInit = {}) =>
  fetch(path, { ...init, headers: { ...(init.headers ?? {}), ...(init.body ? { "content-type": "application/json" } : {}) } });
const runPath = (id: string) => `/api/trainer-road/${id}`;

export function DuelRoomPlay({ code, status, trainerHref, trainerName }: { code: string; status: RoomStatus; trainerHref: string | null; trainerName: string }) {
  const play = useDuelPlay<DuelRunView>({ fetcher: jsonFetch, runPath });
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState<{ card: DuelCardView; owner: string } | null>(null);
  const { take, resume } = play;
  const hasRun = !!play.run;

  // At Go (or on a reload mid-duel): this player's run for the room.
  useEffect(() => {
    if (status !== "running" || hasRun) return;
    let alive = true;
    jsonFetch(`/api/races/${code}`, { method: "POST", body: JSON.stringify({ action: "play" }) })
      .then((r) => r.json())
      .then((d: { run?: DuelRunView } | null) => {
        if (!alive) return;
        if (!d?.run) { setFailed(true); return; }
        if (d.run.status === "playing" && d.run.turns <= 1) take(d.run, { fresh: true });
        else resume(d.run);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [status, code, hasRun, take, resume]);

  const run = play.run;
  if (!run) {
    return failed
      ? <p className="race-help">Your duel didn{"'"}t open. Reload the page to try again.</p>
      : status === "running" ? <p className="race-help" aria-live="polite">Opening your duel…</p> : null;
  }
  if (play.frame && (run.status === "playing" || play.holding)) {
    return (
      <div className="duel-page race-duel">
        <DuelArena run={run} play={play.frame.play} motion={play.frame.motion} busy={play.busy || play.staging || run.status !== "playing"} staging={play.staging} offset={play.offset}
          onNext={play.onNext} onBring={play.onBring} onTurn={play.onTurn} onTip={play.onTip} onZoom={(card, owner) => setZoom({ card, owner })} onSkip={play.endBeats} noHelp />
        <DuelZoom card={zoom?.card ?? null} owner={zoom?.owner ?? ""} onClose={() => setZoom(null)} />
      </div>
    );
  }
  const won = run.result === "won";
  return (
    <div className="race-duel-done" id="duel-result" tabIndex={-1}>
      <b>{won ? `You beat ${trainerName} in ${run.turns} ${run.turns === 1 ? "turn" : "turns"}.` : `${trainerName} won this one.`}</b>
      <span>{won ? "Your place shows once everyone has finished." : "Your place counts how many cards you knocked out."} Your duel counts on Trainer Road too.</span>
      {trainerHref && <ArrowLink href={trainerHref}>{trainerName} on Trainer Road</ArrowLink>}
    </div>
  );
}
