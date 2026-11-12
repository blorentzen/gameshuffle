"use client";

/**
 * Trainer battles on a room's page (battle picks 2026-11-11, all as recommended, with a coin flip for who goes first):
 *   - BattleTeamPick: the lobby's team pick (a Trainer Road team from the room's group; hidden from the other player
 *     until the start), in a CDS Modal with a search and region chips.
 *   - BattleRoomPlay: the battle itself. Players get the Daily Duel arena from their side (the bring step, the lead,
 *     then turns) with the turn clock above it; watchers get both sides read only. Both poll the battle every 1.5
 *     seconds while it's on (that poll is also what moves the clock along on the server).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, Input, Modal } from "@empac/cascadeds";
import { IconArrowsShuffle, IconSearch } from "@tabler/icons-react";
import { DuelArena } from "@/components/originals/duel/DuelArena";
import { DuelZoom } from "@/components/originals/duel/DuelZoom";
import { TrainerArt } from "@/components/originals/duel/TrainerArt";
import { useDuelPlay } from "@/components/originals/duel/useDuelPlay";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { useToast } from "@/components/toast/ToastProvider";
import type { DuelCardView } from "@/lib/originals/duel/view";
import type { BattleRunView, BattleTeamView, RoomStatus } from "@/lib/versus/types";

const POLL_MS = 1500;

const jsonFetch = (path: string, init: RequestInit = {}) =>
  fetch(path, { cache: "no-store", ...init, headers: { ...(init.headers ?? {}), ...(init.body ? { "content-type": "application/json" } : {}) } });

/** A team in a line: picture, name, where it's from, its cards (and whose it is, after a battle). */
function TeamLine({ team, size = "md", whose }: { team: BattleTeamView; size?: "sm" | "md"; whose?: string }) {
  return (
    <span className={`battle-team battle-team--${size}`}>
      {team.picture ? <TrainerArt picture={team.picture} shape="round" className="battle-team__face" /> : <span className="battle-team__face battle-team__face--none" aria-hidden="true" />}
      <span className="battle-team__txt">
        {whose && <small className="battle-team__whose">{whose}</small>}
        <b>{team.name}</b>
        <small>{team.game}</small>
        <small className="battle-team__cards">{team.cards.join(", ")}</small>
      </span>
    </span>
  );
}

// ---- The lobby ----------------------------------------------------------------------------------------------------

export function BattleTeamPick({ code, groupLabel, mine, busy, onPick }: {
  code: string;
  groupLabel: string;
  mine: BattleTeamView | null;
  busy: boolean;
  onPick: (trainerId: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<BattleTeamView[] | null>(null);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<string | null>(null);

  useEffect(() => {
    if (!open || teams) return;
    let alive = true;
    fetch(`/api/races/${code}/battle?teams=1`).then((r) => (r.ok ? r.json() : null))
      .then((d: { teams?: BattleTeamView[] } | null) => { if (alive) setTeams(d?.teams ?? []); }).catch(() => { if (alive) setTeams([]); });
    return () => { alive = false; };
  }, [open, teams, code]);

  const regions = useMemo(() => [...new Set((teams ?? []).map((t) => t.region).filter((r): r is string => !!r))], [teams]);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (teams ?? []).filter((t) => (!region || t.region === region)
      && (!words || `${t.name} ${t.game} ${t.cards.join(" ")}`.toLowerCase().includes(words)));
  }, [teams, q, region]);

  const pick = async (id: string) => { if (await onPick(id)) setOpen(false); };
  const random = () => { const list = shown.length ? shown : teams ?? []; if (list.length) void pick(list[Math.floor(Math.random() * list.length)].trainerId); };

  return (
    <div className="battle-pick">
      <h3 className="battle-pick__h">Your team</h3>
      {mine
        ? <TeamLine team={mine} />
        : <p className="race-help">Pick a team from the {groupLabel}. The other player sees it when the battle starts.</p>}
      <div className="race-acts">
        <Button variant={mine ? "secondary" : "primary"} disabled={busy} onClick={() => setOpen(true)}>{mine ? "Change team" : "Pick your team"}</Button>
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={`Pick a team: ${groupLabel}`} size="large">
        <div className="battle-pick__modal">
          <div className="battle-pick__find">
            <Input id="battle-team-find" floatingLabel="Find a trainer or a card" value={q} onChange={(e) => setQ(e.target.value)} iconBefore={IconSearch} fullWidth />
            <Button variant="secondary" iconBefore={IconArrowsShuffle} disabled={busy || !teams?.length} onClick={random}>Pick for me</Button>
          </div>
          {regions.length > 1 && (
            <div className="battle-pick__regions" role="group" aria-label="Region">
              <Chip clickable selected={!region} onClick={() => setRegion(null)} label="All" />
              {regions.map((r) => <Chip key={r} clickable selected={region === r} onClick={() => setRegion(region === r ? null : r)} label={r} />)}
            </div>
          )}
          {!teams && <p className="race-help" aria-live="polite">Loading the teams…</p>}
          {teams && !shown.length && <p className="race-help">No team matches that.</p>}
          <ul className="battle-pick__list">
            {shown.map((t) => (
              <li key={t.trainerId}>
                <button type="button" className={`battle-pick__row${mine?.trainerId === t.trainerId ? " battle-pick__row--on" : ""}`} aria-pressed={mine?.trainerId === t.trainerId} disabled={busy} onClick={() => void pick(t.trainerId)}>
                  <TeamLine team={t} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}

// ---- The battle ---------------------------------------------------------------------------------------------------

/** "0:42" left on whoever's clock it is. */
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

const WHY_LINE = {
  knockout: (w: string) => `${w} knocked out every card.`,
  timeout: (w: string) => `${w} wins: the other player missed three turns in a row.`,
  left: (w: string) => `${w} wins: the other player left the battle.`,
  cap: (w: string) => `${w} wins on cards and HP left after the last round.`,
} as const;

export function BattleRoomPlay({ code, status }: { code: string; status: RoomStatus }) {
  const toast = useToast();
  const runPath = useCallback(() => `/api/races/${code}/battle`, [code]);
  const play = useDuelPlay<BattleRunView>({ fetcher: jsonFetch, runPath });
  const [watch, setWatch] = useState<BattleRunView | null>(null);
  const [zoom, setZoom] = useState<{ card: DuelCardView; owner: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const version = useRef(-1);
  const { take, resume } = play;
  const run = play.run ?? watch;
  const info = run?.battle ?? null;
  const done = info?.phase === "done";

  // Poll while the battle is on: a newer version plays the difference (the other player's turn).
  useEffect(() => {
    if (done && version.current >= 0) return;
    let alive = true;
    let timer = 0;
    const load = async () => {
      const res = await jsonFetch(runPath()).catch(() => null);
      if (!alive) return;
      if (res?.status === 404) setMissing(true);
      const d = res?.ok ? ((await res.json().catch(() => null)) as { run?: BattleRunView } | null) : null;
      if (alive && d?.run && d.run.battle.version !== version.current) {
        const first = version.current < 0;
        version.current = d.run.battle.version;
        setMissing(false);
        if (d.run.battle.spectator) setWatch(d.run);
        else if (first) resume(d.run);
        else take(d.run);
      }
      if (alive && !(d?.run?.battle.phase === "done")) timer = window.setTimeout(load, document.hidden ? POLL_MS * 4 : POLL_MS);
    };
    void load();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [runPath, take, resume, done]);

  // A step the player sent comes back newer than the last poll: keep the version in step so the poll doesn't replay it.
  useEffect(() => { if (play.run) version.current = Math.max(version.current, play.run.battle.version); }, [play.run]);

  const clock = useClock(info && !done ? info.deadline : null, play.offset);

  if (!run || !info) {
    return <p className="race-help" aria-live="polite">{missing && status !== "running" ? "This battle didn't start." : "Opening the battle…"}</p>;
  }

  const them = info.them.name;
  const turnLine = (() => {
    if (done) return null;
    if (info.phase === "bring") return info.brought.you ? `Waiting for ${them} to pick their 3` : "Pick 3 cards to bring";
    if (run.play.turn === 0) return info.waiting === "them" ? `Waiting for ${them} to pick a lead` : "Pick your lead";
    if (info.waiting === "you") return run.play.needsNext ? "Send out your next card" : "Your turn";
    if (info.waiting === "them") return `${them}'s turn`;
    return info.spectator ? "Battle on" : null;
  })();

  const head = (
    <div className="battle-bar" role="status">
      <span className="battle-bar__who">
        {info.you && <b>{info.you.name}</b>}{info.you && <span className="battle-bar__vs">vs</span>}<b>{them}</b>
      </span>
      {turnLine && <span className={`battle-bar__turn${info.waiting === "you" ? " battle-bar__turn--you" : ""}`}>{turnLine}</span>}
      {clock && <span className={`battle-bar__clock${info.waiting === "you" ? " battle-bar__clock--you" : ""}`} role="timer" aria-label={`${clock} left`}>{clock}</span>}
    </div>
  );
  const coin = info.first && run.play.turn <= 2 && !done
    ? <p className="battle-coin">Coin flip: {info.first.you ? "you go" : `${info.first.name} goes`} first. The first turn has no attack.</p>
    : null;
  const misses = !info.spectator && info.you && info.you.missed > 0 && !done
    ? <p className="race-help">You{"'"}ve missed {info.you.missed} {info.you.missed === 1 ? "turn" : "turns"} in a row. Three in a row lose the battle.</p>
    : null;

  // Finished: the result, the head-to-head, the teams.
  if (done) {
    const line = info.result === "draw" || !info.winner ? "It's a draw: the same cards and HP left after the last round." : WHY_LINE[info.why ?? "knockout"](info.winner);
    return (
      <div className="battle-done" id="duel-result" tabIndex={-1}>
        <b className="battle-done__h">{info.result === "won" ? `You beat ${them}.` : info.result === "lost" ? `${them} won this one.` : info.result === "draw" ? "A draw." : `${info.winner} won.`}</b>
        <span>{line}</span>
        {info.record && <span>You and {them}: you{"'"}ve won {info.record.won}, {them} has won {info.record.lost}.</span>}
        <div className="battle-done__teams">
          {info.you && <TeamLine team={info.you.team} size="sm" whose={info.spectator ? `${info.you.name}'s team` : "Your team"} />}
          <TeamLine team={info.them.team} size="sm" whose={`${them}'s team`} />
        </div>
        <ArrowLink href="/pokemon-trainers">Trainer Road</ArrowLink>
      </div>
    );
  }

  if (info.spectator) {
    return (
      <div className="battle-watch">
        {head}
        {coin}
        <BattleWatch run={run} />
      </div>
    );
  }

  if (info.phase === "bring" && info.brought.you) {
    return (
      <div className="battle-wait">
        {head}
        <p className="race-lede">Your 3 are in. When {them} picks theirs, you both pick a lead.</p>
        <div className="battle-done__teams">
          {info.you && <TeamLine team={info.you.team} size="sm" />}
          <TeamLine team={info.them.team} size="sm" />
        </div>
      </div>
    );
  }

  if (!play.frame) return <>{head}<p className="race-help" aria-live="polite">Opening the battle…</p></>;
  return (
    <div className="battle-play">
      {head}
      {coin}
      {misses}
      <div className="duel-page race-duel">
        <DuelArena run={play.run!} play={play.frame.play} motion={play.frame.motion} busy={play.busy || play.staging} staging={play.staging} offset={play.offset}
          onNext={play.onNext} onBring={play.onBring} onTurn={play.onTurn}
          onTip={async () => { toast.error("No tips in a trainer battle."); return null; }}
          onZoom={(card, owner) => setZoom({ card, owner })} onSkip={play.endBeats} noHelp battle />
        <DuelZoom card={zoom?.card ?? null} owner={zoom?.owner ?? ""} onClose={() => setZoom(null)} />
      </div>
    </div>
  );
}

/** Both sides for someone watching: each player's cards with HP, the card on the field first, and the last turn. */
function BattleWatch({ run }: { run: BattleRunView }) {
  const p = run.play;
  const side = (name: string, cards: DuelCardView[], field: number) => (
    <div className="battle-watch__side">
      <b>{name}</b>
      <ul>
        {[...cards].sort((a, b) => (a.index === field ? -1 : b.index === field ? 1 : a.index - b.index)).map((c) => (
          <li key={c.index} className={c.out ? "is-out" : c.index === field ? "is-field" : undefined}>
            <span>{c.short}{c.index === field && !c.out ? <small> on the field</small> : null}</span>
            <span className="race-num">{c.out ? "Knocked out" : `${c.cur} / ${c.hp}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="battle-watch__grid">
      {side(run.battle.you?.name ?? "", p.you, p.yi)}
      {side(run.battle.them.name, p.foe, p.fi)}
      {p.log.length > 0 && (
        <ol className="battle-watch__log" aria-label="Last turn">
          {p.log.map((l, i) => <li key={i}>{l.text}</li>)}
        </ol>
      )}
    </div>
  );
}
