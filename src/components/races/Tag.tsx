"use client";

/**
 * A tag team duel on a room's page (co-op picks 2026-11-11, pick 4): two players share one side against a Trainer Road
 * trainer. The draft (take turns picking from the duel's six; a coin decides who picks first), then the Daily Duel arena
 * where whoever owns the card on the field plays the turn, with the turn bar above it saying whose turn it is and the
 * clock. Polls every 1.5 seconds while it's on (the poll also moves the clock along on the server); the partner's turns
 * play as beats.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DuelArena } from "@/components/originals/duel/DuelArena";
import { DuelZoom } from "@/components/originals/duel/DuelZoom";
import { CardArt, TypeChip } from "@/components/originals/duel/DuelBits";
import { cardLabel } from "@/components/originals/duel/duelLook";
import { useDuelPlay } from "@/components/originals/duel/useDuelPlay";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { useToast } from "@/components/toast/ToastProvider";
import type { DuelCardView } from "@/lib/originals/duel/view";
import type { RoomStatus, TagRunView } from "@/lib/versus/types";

const POLL_MS = 1500;
const jsonFetch = (path: string, init: RequestInit = {}) =>
  fetch(path, { cache: "no-store", ...init, headers: { ...(init.headers ?? {}), ...(init.body ? { "content-type": "application/json" } : {}) } });

function useClock(deadline: number | null, offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline == null) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [deadline]);
  if (deadline == null) return null;
  const left = Math.max(0, Math.ceil((deadline - (now + offset)) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

const STAR = "★";

export function TagRoomPlay({ code, status, trainerHref }: { code: string; status: RoomStatus; trainerHref: string | null }) {
  const toast = useToast();
  const runPath = useCallback(() => `/api/races/${code}/tag`, [code]);
  const play = useDuelPlay<TagRunView>({ fetcher: jsonFetch, runPath });
  const [watch, setWatch] = useState<TagRunView | null>(null);
  const [zoom, setZoom] = useState<{ card: DuelCardView; owner: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const [picking, setPicking] = useState(false);
  const version = useRef(-1);
  const { take, resume } = play;
  const run = play.run ?? watch;
  const info = run?.tag ?? null;
  const done = info?.phase === "done";

  useEffect(() => {
    if (done && version.current >= 0) return;
    let alive = true;
    let timer = 0;
    const load = async () => {
      const res = await jsonFetch(runPath()).catch(() => null);
      if (!alive) return;
      if (res?.status === 404) setMissing(true);
      const d = res?.ok ? ((await res.json().catch(() => null)) as { run?: TagRunView } | null) : null;
      if (alive && d?.run && d.run.tag.version !== version.current) {
        const first = version.current < 0;
        version.current = d.run.tag.version;
        setMissing(false);
        if (d.run.tag.spectator) setWatch(d.run);
        else if (first) resume(d.run);
        else take(d.run);
      }
      if (alive && d?.run?.tag.phase !== "done") timer = window.setTimeout(load, document.hidden ? POLL_MS * 4 : POLL_MS);
    };
    void load();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [runPath, take, resume, done]);
  useEffect(() => { if (play.run) version.current = Math.max(version.current, play.run.tag.version); }, [play.run]);

  const clock = useClock(info && !done ? info.deadline : null, play.offset);

  async function pick(i: number) {
    if (picking) return;
    setPicking(true);
    const res = await jsonFetch(runPath(), { method: "POST", body: JSON.stringify({ pick: i }) }).catch(() => null);
    setPicking(false);
    const d = res?.ok ? ((await res.json().catch(() => null)) as { run?: TagRunView } | null) : null;
    if (d?.run) { version.current = d.run.tag.version; take(d.run); }
    else toast.error("Couldn't pick that card. Try again.");
  }

  if (!run || !info) return <p className="race-help" aria-live="polite">{missing && status !== "running" ? "This duel didn't start." : "Opening the duel…"}</p>;

  const partner = info.partner;
  const you = run.play.you;
  const own = (who: "you" | "partner") => you.filter((c) => info.owners[c.index] === who).map((c) => cardLabel(c));
  const turnLine = (() => {
    if (done) return null;
    if (info.phase === "draft") return info.waiting === "you" ? `Your pick (${info.draft.size} cards in all)` : `${info.spectator ? "Picking" : `${partner}'s pick`}`;
    if (info.phase === "lead") return info.waiting === "you" ? "Pick the lead from your cards" : `${partner} picks the lead`;
    if (info.waiting === "you") return run.play.needsNext ? "Send out the next card" : "Your turn";
    return info.spectator ? "Duel on" : `${partner}'s turn`;
  })();
  const head = (
    <div className="battle-bar" role="status">
      <span className="battle-bar__who"><b>{info.spectator ? info.names.join(" and ") : `You and ${partner}`}</b><span className="battle-bar__vs">vs</span><b>{run.trainer.name}</b></span>
      {turnLine && <span className={`battle-bar__turn${info.waiting === "you" ? " battle-bar__turn--you" : ""}`}>{turnLine}</span>}
      {clock && <span className={`battle-bar__clock${info.waiting === "you" ? " battle-bar__clock--you" : ""}`} role="timer" aria-label={`${clock} left`}>{clock}</span>}
    </div>
  );

  if (done) {
    const stars = info.stars ?? 0;
    const line = info.why === "left" ? "One of you left the duel." : info.why === "timeout" ? "Three missed turns in a row ended it." : info.result === "won" ? `Won in ${run.turns} ${run.turns === 1 ? "turn" : "turns"}. Par is ${info.par}.` : `${run.trainer.name} knocked out all your cards.`;
    return (
      <div className="battle-done" id="duel-result" tabIndex={-1}>
        <b className="battle-done__h">{info.result === "won" ? `You beat ${run.trainer.name} together.` : `${run.trainer.name} won this one.`}</b>
        <span>{line}</span>
        {info.result === "won" && <span className="tag-stars" aria-label={`${stars} of 3 stars`}>{STAR.repeat(stars)}<span className="tag-stars__off">{STAR.repeat(3 - stars)}</span></span>}
        {info.result === "won" && <span className="race-note">Stars as for any duel of this team. A tag duel doesn{"'"}t go on your Trainer Road best or the board.</span>}
        {trainerHref && <ArrowLink href={trainerHref}>{run.trainer.name} on Trainer Road</ArrowLink>}
      </div>
    );
  }

  const owners = !info.spectator && info.phase !== "draft"
    ? <p className="race-help tag-owners">Your cards: {own("you").join(", ") || "none"}. {partner}{"'"}s: {own("partner").join(", ") || "none"}.</p>
    : null;
  const coin = info.phase === "draft" && run.play.you.every((c) => info.owners[c.index] == null)
    ? <p className="battle-coin">Coin flip: {info.first.you ? "you pick" : `${info.first.name} picks`} first. The other one leads.</p>
    : null;

  if (info.phase === "draft") {
    return (
      <div className="battle-play">
        {head}
        {coin}
        <div className="duel-page tag-draft">
          <h3 className="tag-draft__h">Pick your cards</h3>
          <p className="tag-draft__text">Take turns picking from the duel{"'"}s six. Each card is played by whoever picks it.</p>
          <ul className="duel-pick__list">
            {you.map((c) => {
              const who = info.owners[c.index];
              const can = info.draft.choices.includes(c.index);
              const best = c.moves.reduce((m, mv) => Math.max(m, mv.d), 0);
              return (
                <li key={c.index} className="duel-pick__item">
                  <button type="button" className={`duel-pick__card${who ? " duel-pick__card--on" : ""}`} disabled={!can || picking || play.busy} onClick={() => void pick(c.index)}
                    aria-label={`${c.name}: ${c.t}, ${c.hp} HP, hits for up to ${best}. ${who === "you" ? "Your pick." : who === "partner" ? `${partner}'s pick.` : can ? "Pick it." : ""}`}>
                    <span className="duel-pick__art"><CardArt card={c} /></span>
                    <span className="duel-pick__name">{cardLabel(c)}</span>
                    <span className="duel-pick__facts" aria-hidden="true"><TypeChip t={c.t} /><span>{c.hp} HP</span></span>
                    <span className="duel-pick__facts" aria-hidden="true">{who === "you" ? "Yours" : who === "partner" ? `${partner}'s` : `Up to ${best}`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  if (info.spectator) {
    return (
      <div className="battle-watch">
        {head}
        <ul className="tag-watch">
          {you.map((c) => <li key={c.index}>{cardLabel(c)}: {c.out ? "knocked out" : `${c.cur} / ${c.hp}`}{info.owners[c.index] ? ` (${info.names[info.owners[c.index] === "you" ? 0 : 1]})` : ""}</li>)}
        </ul>
      </div>
    );
  }

  if (!play.frame) return <>{head}<p className="race-help" aria-live="polite">Opening the duel…</p></>;
  return (
    <div className="battle-play">
      {head}
      {owners}
      {info.missed > 0 && <p className="race-help">You{"'"}ve missed {info.missed} {info.missed === 1 ? "turn" : "turns"} in a row. Three in a row lose the duel for both of you.</p>}
      <div className="duel-page race-duel">
        <DuelArena run={play.run!} play={play.frame.play} motion={play.frame.motion} busy={play.busy || play.staging} staging={play.staging} offset={play.offset}
          onNext={play.onNext} onBring={play.onBring} onTurn={play.onTurn}
          onTip={async () => { toast.error("No tips in a tag duel."); return null; }}
          onZoom={(card, owner) => setZoom({ card, owner })} onSkip={play.endBeats} noHelp title="Tag team duel" />
        <DuelZoom card={zoom?.card ?? null} owner={zoom?.owner ?? ""} onClose={() => setZoom(null)} />
      </div>
    </div>
  );
}
