"use client";

/**
 * A speedrun race's page (speedrun races picks 2026-11-10): the room before the start (who's in, whether each timer is
 * connected with the race's splits, ready marks, the host's start), the countdown, the race live (places and gaps at
 * the same split, each runner's lane after their stream delay), then the results. The live part comes from the relay's
 * room socket (useRaceRoom); the page's own data (names, pictures, PBs, what the viewer may do) from /api/races/<code>,
 * read again when the room's roster or status changes and after every action.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Chip, IconButton, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCopy, IconFlag, IconShare, IconTrash, IconUserPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { TableScroll } from "@/components/ui/TableScroll";
import { EVENTS, track } from "@/lib/analytics/events";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { fmtClock, fmtDelta } from "@/lib/speedrun/time";
import { shownName } from "@/lib/speedrun/splitGroups";
import { COUNTDOWN_S, READY_HELP, fmtGap, fmtValue, laneColor, outLine, rankFor, speedrunReadiness, standings, teamStandings, type ReadyCheck, type ReadyProblem } from "@/lib/versus/rules";
import type { RoomEntrant, RoomStatus, VersusEntrantView, VersusRoomView } from "@/lib/versus/types";
import { useRaceRoom } from "./useRaceRoom";
import { DuelRoomPlay } from "./DuelRoomPlay";
import { BattleRoomPlay, BattleTeamPick } from "./Battle";
import { TagRoomPlay } from "./Tag";

const LEVEL_WORD = { easy: "Easy", normal: "Normal", hard: "Hard" } as const;
/** A duel has no timer to check: every player can start. */
const DUEL_READY: ReadyCheck = { ok: true, line: "", problem: null };

const ERRORS: Record<string, string> = {
  signin: "Sign in to race.",
  setup: "Set up your speedrun first, so GameShuffle can start your timer.",
  no_splits: "Add your splits on the speedrun page first.",
  closed: "This race has already started or ended.",
  full: "This race is full.",
  invite: "This race is invite only. Ask the host for an invite.",
  host_only: "Only the host can do that.",
  host_stays: "The host stays in. Call the race off instead.",
  need_two: "At least two runners need to be ready.",
  relay: "The race server didn't answer. Try again in a moment.",
  no_user: "No GameShuffle account has that name.",
  already_in: "They're already in this race.",
  not_running: "The race isn't running.",
  not_ready: "Races need a quick update on our side first.",
  teams: "Everyone racing needs a team, and at least two teams need someone on them.",
  slow_down: "That's a lot of taps. Try again in a moment.",
};

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const plain = shownName;

function errorText(e: { error?: string; detail?: string; problem?: ReadyProblem } | null): string {
  if (!e?.error) return "Couldn't do that. Try again.";
  if (e.error === "elsewhere") return `You're in race ${e.detail ?? "another race"}. Leave it first.`;
  if (e.error === "lane" && e.problem) return READY_HELP[e.problem];
  return ERRORS[e.error] ?? "Couldn't do that. Try again.";
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function Runner({ e, size = "small" }: { e: VersusEntrantView; size?: "small" | "medium" }) {
  return (
    <span className="race-av" style={{ "--lane": laneColor(e.seat) } as React.CSSProperties}>
      <Avatar src={e.avatar ?? undefined} initials={initials(e.name)} alt="" size={size} />
    </span>
  );
}

function SplitsBar({ done, total, finished }: { done: number; total: number; finished: boolean }) {
  if (total > 40) {
    return <span className="race-bar race-bar--fill" aria-hidden="true"><i style={{ width: `${Math.round((finished ? 1 : done / total) * 100)}%` }} /></span>;
  }
  return (
    <span className="race-bar" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <i key={i} className={finished ? "f" : i < done ? "d" : ""} />)}
    </span>
  );
}

export function RaceRoom({ initial, signedIn }: { initial: VersusRoomView; signedIn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const { room, latest, serverNow } = useRaceRoom(view.watchUrl, view.live);

  // The page's own data again when the room's roster, ready marks or status change.
  const sig = latest ? `${latest.status}|${latest.entrants.map((e) => `${e.key}${e.ready ? "+" : ""}`).join(",")}` : "";
  useEffect(() => {
    if (!sig) return;
    let alive = true;
    fetch(`/api/races/${view.code}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d: { view?: VersusRoomView } | null) => { if (alive && d?.view) setView(d.view); }).catch(() => {});
    return () => { alive = false; };
  }, [sig, view.code]);

  const status: RoomStatus = latest && latest.status !== "open" ? latest.status : view.status;
  const n = view.checkpoints.length;
  const tag = view.kind === "tag" ? view.duel : null;
  // A tag duel's lobby works like a duel's (nothing to set up, everyone ready plays).
  const duel = view.kind === "duel" || view.kind === "tag" ? view.duel : null;
  const battle = view.kind === "battle" ? view.battle : null;
  const noun = battle ? "battle" : duel ? "duel" : "race";
  // A duel played on this page keeps its arena after the finish, so its last moment plays out above the results.
  const [sawRunning, setSawRunning] = useState(false);
  if (status === "running" && !sawRunning) setSawRunning(true);
  const me = view.me;
  const mine = me ? view.entrants.find((e) => e.userId === me.userId) : null;
  const laneOf = (key: string): RoomEntrant | undefined => room?.entrants.find((x) => x.key === key);
  const url = typeof window === "undefined" ? `/races/${view.code}` : `${window.location.origin}/races/${view.code}`;

  async function act(action: string, arg?: string, ok?: string) {
    setBusy(true);
    const res = await fetch(`/api/races/${view.code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, arg }) }).catch(() => null);
    setBusy(false);
    const d = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string; detail?: string; problem?: ReadyProblem; code?: string; view?: VersusRoomView } | null;
    if (d?.view) setView(d.view);
    if (!res?.ok || !d?.ok) { toast.error(res?.status === 401 ? ERRORS.signin : errorText(d)); return false; }
    if (ok) toast.success(ok);
    if (action === "join") track(EVENTS.raceJoined, { invited: view.settings.join === "invite" });
    if (action === "start") track(EVENTS.raceStarted, { runners: view.entrants.filter((e) => e.status === "ready").length });
    if (action === "again" && d.code) router.push(`/races/${d.code}`);
    return true;
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); } catch { toast.error(`Copy this link: ${url}`); }
  }

  async function share() {
    const title = view.kind === "speedrun" ? `${view.game}${view.category ? ` · ${view.category}` : ""} race` : view.game;
    track(EVENTS.raceShared, { place: mine?.place ?? 0 });
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title, url }); return; } catch { /* closed or refused: copy instead */ }
    }
    await copyLink();
  }

  const seated = view.entrants.filter((e) => e.status !== "invited");
  // After the finish, the standings play out each runner's stream delay before the results show (no spoilers).
  const lastDelay = Math.max(0, ...(room?.entrants.map((e) => e.delayMs) ?? [0]));
  const settling = status === "finished" && !!room?.finishedAt && serverNow - room.finishedAt < lastDelay;
  const readyCount = view.entrants.filter((e) => e.status === "ready").length;

  return (
    <div className="race">
      <div className="race-bar-top">
        <span className={`race-state race-state--${status}`}>{STATUS_WORD[status]}</span>
        <span className="race-code">{battle ? "Battle" : duel ? "Duel" : "Race"} <b>{view.code}</b> · {seated.length} of {view.settings.max} {duel || battle ? "players" : "runners"} · hosted by {view.host.name}</span>
        <Button variant="ghost" size="small" iconBefore={IconCopy} onClick={() => void copyLink()}>Copy the link</Button>
      </div>

      {status === "open" && (
        <section className="race-sec" aria-labelledby="race-runners-h">
          {tag ? (
            <p className="race-lede">
              The two of you share one side against {tag.name}{"'"}s team from {tag.game}: {view.checkpoints.join(", ")}. You take turns picking from the duel{"'"}s six, and whoever owns the card on the field plays the turn.{" "}
              {tag.href && <ArrowLink href={tag.href}>See the team</ArrowLink>}
            </p>
          ) : duel && (
            <p className="race-lede">
              {duel.name}{"'"}s team from {duel.game} on {LEVEL_WORD[duel.level]}: {view.checkpoints.join(", ")}.{" "}
              {duel.href && <ArrowLink href={duel.href}>See the team</ArrowLink>}
            </p>
          )}
          {battle && (
            <p className="race-lede">
              One against one, with teams from the {battle.groupLabel}. Each of you picks a team; neither of you sees the other{"'"}s until the start. Then you each bring 3 of its cards and a coin flip decides who goes first.
            </p>
          )}
          <h2 id="race-runners-h">{duel || battle ? "Players" : "Runners"}</h2>
          <ul className="race-runners">
            {view.entrants.map((e) => {
              const lane = laneOf(e.userId);
              const check = duel || battle ? DUEL_READY : speedrunReadiness(lane?.lane.live ?? null, n);
              const pb = e.pbMs != null ? `PB ${fmtClock(e.pbMs)}` : "no PB yet";
              const line = e.status === "invited" ? "Invited by the host"
                : battle ? (e.team && e.userId === me?.userId ? `${e.team.name}'s team${e.status === "ready" ? ", ready" : ""}` : e.status === "ready" ? "Ready to battle" : e.teamPicked ? "Team picked" : "Picking a team")
                  : duel ? (e.status === "ready" ? "Ready to duel" : "Joined") : `${check.line} · ${pb}`;
              const pill = e.status === "invited" ? <Badge size="small">Invited</Badge>
                : e.status === "ready" ? <Badge size="small" variant="success">Ready</Badge>
                  : check.ok ? <Badge size="small" variant="warning">Not ready</Badge> : <Badge size="small" variant="error">{"Can't start"}</Badge>;
              return (
                <li key={e.userId} className="race-runner">
                  <Runner e={e} />
                  <div className="race-runner__txt">
                    <b>{e.name}{e.userId === view.host.userId && <small> (host)</small>}</b>
                    <small>{line}</small>
                  </div>
                  {view.settings.teams && <Badge size="small">{e.squad ? `Team ${e.squad}` : "No team yet"}</Badge>}
                  {pill}
                  {me?.isHost && e.userId !== view.host.userId && (
                    <IconButton variant="tertiary" size="small" aria-label={`Take ${e.name} out`} disabled={busy}
                      onClick={async () => { if (await confirm({ title: `Take ${e.name} out of the ${noun}?`, confirmLabel: "Take them out" })) void act("remove", e.userId); }}>
                      <IconTrash size={18} aria-hidden="true" />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
          {view.settings.teams && mine && (mine.status === "joined" || mine.status === "ready") && (
            <div className="team-pick" role="group" aria-labelledby="team-pick-h">
              <span id="team-pick-h" className="team-opts__label">Your team</span>
              <div className="team-opts__chips">
                {Array.from({ length: view.settings.teams.count }, (_, k) => k + 1).map((t) => (
                  <Chip key={t} clickable selected={mine.squad === t} disabled={busy} onClick={() => void act("squad", String(t))} label={`Team ${t} (${view.entrants.filter((x) => x.squad === t).length})`} />
                ))}
              </div>
              <p className="team-opts__note">{view.settings.teams.score === "total" ? "A team scores everyone's results added up, so everyone on it needs to finish." : "A team scores its best result."}</p>
            </div>
          )}
          {battle && mine && (mine.status === "joined" || mine.status === "ready") && (
            <BattleTeamPick code={view.code} groupLabel={battle.groupLabel} mine={mine.team ?? null} busy={busy} onPick={(id) => act("team", id, "Team picked.")} />
          )}
          <MyLobbyActions view={view} mine={mine ?? null} lane={mine ? laneOf(mine.userId) ?? null : null} busy={busy} signedIn={signedIn} n={n} readyCount={readyCount} duel={!!duel} battle={!!battle}
            onAct={act} onCancel={async () => { if (await confirm({ title: `Call off this ${noun}?`, body: "Everyone in it is let go. The page stays.", confirmLabel: "Call it off" })) void act("cancel", undefined, `${noun[0].toUpperCase()}${noun.slice(1)} called off.`); }} />
          {me?.isHost && (
            <form className="race-invite" onSubmit={(ev) => { ev.preventDefault(); if (inviteName.trim()) void act("invite", inviteName, "Invite sent.").then((ok) => { if (ok) setInviteName(""); }); }}>
              <div className="race-invite__field">
                <Input id="race-invite" floatingLabel={`Invite a ${view.kind === "speedrun" ? "runner" : "player"} by GameShuffle name`} aria-describedby="race-invite-help" value={inviteName} onChange={(ev) => setInviteName(ev.target.value)} fullWidth />
                <small id="race-invite-help">They get a notification with the link.</small>
              </div>
              <Button type="submit" variant="secondary" iconBefore={IconUserPlus} disabled={busy || !inviteName.trim()}>Invite</Button>
            </form>
          )}
          {tag
            ? <p className="race-note">Turns take 60 seconds; a turn that runs out passes on its own, and three in a row lose it for both of you. No professor and no tools. The host starts once both players are ready.</p>
            : battle
            ? <p className="race-note">Turns take 60 seconds; a turn that runs out passes on its own, and three in a row lose. No professor and no tools. The host starts once both players are ready.</p>
            : duel
            ? <p className="race-note">Everyone duels the same team at the same time, with no professor and no tools. A win counts first, then fewer turns, then less time. The host starts once at least two players are ready; your arena opens at the end of a {COUNTDOWN_S} second countdown.</p>
            : <p className="race-note">The host starts once at least two runners are ready; anyone not ready sits this one out. Timers stay at 0:00: GameShuffle starts every timer at the end of a {COUNTDOWN_S} second countdown.</p>}
        </section>
      )}

      {view.seed && (status === "countdown" || status === "running") && (
        <section className="race-sec race-seed" aria-label="The seed">
          <small>Everyone plays this seed</small>
          <b>{view.seed}</b>
          <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={async () => { try { await navigator.clipboard.writeText(view.seed!); toast.success("Seed copied"); } catch { toast.error(`The seed is ${view.seed}`); } }}>Copy the seed</Button>
        </section>
      )}

      {status === "countdown" && latest?.startAt && (
        <section className="race-sec race-count" aria-live="polite">
          <b>{Math.max(0, Math.ceil((latest.startAt - serverNow) / 1000))}</b>
          <span>{battle ? "The battle opens at 0." : duel ? "Your arena opens at 0." : <>GameShuffle starts every timer at 0. {"Don't"} press start yourself.</>}</span>
        </section>
      )}

      {tag && (status === "running" || status === "finished") && (
        <section className="race-sec" aria-label="The duel">
          <TagRoomPlay code={view.code} status={status} trainerHref={tag.href} />
          {status === "running" && mine?.status === "racing" && (
            <div className="race-acts">
              <Button variant="ghost" size="small" iconBefore={IconFlag} disabled={busy}
                onClick={async () => { if (await confirm({ title: "Leave the duel?", body: "It ends for both of you.", confirmLabel: "Leave" })) void act("leave", undefined, "You left the duel."); }}>Leave</Button>
            </div>
          )}
        </section>
      )}

      {duel && !tag && me && mine && (status === "running" || (status === "finished" && sawRunning)) && ["racing", "done", "out"].includes(mine.status) && (
        <section className="race-sec" aria-label="Your duel">
          <DuelRoomPlay code={view.code} status={status} trainerHref={duel.href} trainerName={duel.name} />
        </section>
      )}

      {battle && (status === "running" || status === "finished") && (
        <section className="race-sec" aria-label="The battle">
          <BattleRoomPlay code={view.code} status={status} />
          {status === "running" && mine?.status === "racing" && (
            <div className="race-acts">
              <Button variant="ghost" size="small" iconBefore={IconFlag} disabled={busy}
                onClick={async () => { if (await confirm({ title: "Forfeit the battle?", body: "The other player wins.", confirmLabel: "Forfeit" })) void act("leave", undefined, "You forfeited."); }}>Forfeit</Button>
            </div>
          )}
        </section>
      )}

      {!battle && !tag && (status === "running" || (status === "finished" && settling)) && room && (
        <LiveStandings room={room} view={view} serverNow={serverNow} status={status} me={me} busy={busy}
          onLeave={async () => { if (await confirm({ title: "Forfeit the race?", body: "You're out, and your place is gone.", confirmLabel: "Forfeit" })) void act("leave", undefined, "You're out of the race."); }}
          onEnd={async () => { if (await confirm({ title: "End the race now?", body: "Anyone still running is out. Finished times stand.", confirmLabel: "End the race" })) void act("end"); }} />
      )}

      {status === "finished" && !settling && !tag && <Results view={view} room={room} onShare={() => void share()} onAgain={() => void act("again")} busy={busy} />}
      {status === "finished" && tag && (
        <section className="race-sec">
          <div className="race-acts">
            <Button variant="primary" iconBefore={IconShare} onClick={() => void share()}>Share</Button>
            {!view.nextCode && view.me?.isHost && <Button variant="secondary" disabled={busy} onClick={() => void act("again")}>Team up again</Button>}
          </div>
          {view.nextCode && <ArrowLink href={`/races/${view.nextCode}`}>Next duel: {view.nextCode}</ArrowLink>}
        </section>
      )}

      {status === "cancelled" && (
        <section className="race-sec">
          <p className="race-lede">This {noun} was called off.</p>
          {view.nextCode && <ArrowLink href={`/races/${view.nextCode}`}>Go to race {view.nextCode}</ArrowLink>}
          {me?.isHost && !view.nextCode && <div className="race-acts"><Button variant="secondary" disabled={busy} onClick={() => void act("again")}>Make a new race</Button></div>}
        </section>
      )}
    </div>
  );
}

const STATUS_WORD: Record<RoomStatus, string> = { open: "Open", countdown: "Starting", running: "Live", finished: "Finished", cancelled: "Called off" };

function MyLobbyActions({ view, mine, lane, busy, signedIn, n, readyCount, onAct, onCancel, duel = false, battle = false }: {
  view: VersusRoomView; mine: VersusEntrantView | null; lane: RoomEntrant | null; busy: boolean; signedIn: boolean; n: number; readyCount: number;
  onAct: (action: string, arg?: string, ok?: string) => Promise<boolean>; onCancel: () => void; duel?: boolean; battle?: boolean;
}) {
  const router = useRouter();
  const me = view.me;
  if (!signedIn || !me) {
    return (
      <div className="race-acts">
        <Button variant="primary" onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/races/${view.code}`)}`)}>{battle ? "Sign in to battle" : duel ? "Sign in to duel" : "Sign in to race"}</Button>
      </div>
    );
  }
  const inRoom = mine && (mine.status === "joined" || mine.status === "ready");
  // A battle player needs a team before they can be ready.
  const check: ReadyCheck = battle ? (mine?.teamPicked ? DUEL_READY : { ok: false, line: "Pick your team first.", problem: null }) : duel ? DUEL_READY : speedrunReadiness(lane?.lane.live ?? null, n);
  const block = me.joinBlock;
  return (
    <>
      <div className="race-acts">
        {!inRoom && !block && <Button variant="primary" disabled={busy} onClick={() => void onAct("join", undefined, battle ? "You're in. Pick your team, then mark ready." : duel ? "You're in. Mark ready when you are." : "You're in. Mark ready when your timer is.")}>{mine?.status === "invited" ? "Accept and join" : battle ? "Join the battle" : duel ? "Join the duel" : "Join the race"}</Button>}
        {inRoom && mine.status === "joined" && <Button variant="primary" disabled={busy || !check.ok} onClick={() => void onAct("ready")}>{"I'm ready"}</Button>}
        {inRoom && mine.status === "ready" && <Button variant="secondary" disabled={busy} onClick={() => void onAct("unready")}>Not ready yet</Button>}
        {me.isHost && <Button variant={inRoom && mine.status === "ready" ? "primary" : "secondary"} disabled={busy || readyCount < 2} onClick={() => void onAct("start")}>Start the countdown ({readyCount} of {view.entrants.filter((e) => e.status !== "invited").length} ready)</Button>}
        {inRoom && !me.isHost && <Button variant="ghost" disabled={busy} onClick={() => void onAct("leave", undefined, battle ? "You left the battle." : duel ? "You left the duel." : "You left the race.")}>Leave</Button>}
        {me.isHost && <Button variant="ghost" disabled={busy} onClick={onCancel}>{battle ? "Call off the battle" : duel ? "Call off the duel" : "Call off the race"}</Button>}
      </div>
      {inRoom && mine.status === "joined" && !check.ok && !check.problem && check.line && <p className="race-help">{check.line}</p>}
      {inRoom && mine.status === "joined" && !check.ok && check.problem && (
        <p className="race-help">{READY_HELP[check.problem]} <ArrowLink href="/speedrun">Your speedrun setup</ArrowLink></p>
      )}
      {!inRoom && block && <p className="race-help">{BLOCK_TEXT(block, me.elsewhere)}</p>}
    </>
  );
}

function BLOCK_TEXT(block: NonNullable<VersusRoomView["me"]>["joinBlock"], elsewhere: string | null): React.ReactNode {
  switch (block) {
    case "full": return "This race is full.";
    case "invite": return "This race is invite only. Ask the host for an invite.";
    case "closed": return "This race has already started.";
    case "elsewhere": return <>{"You're in another race"}{elsewhere ? <> (<ArrowLink href={`/races/${elsewhere}`}>{elsewhere}</ArrowLink>)</> : null}. Leave it to join this one.</>;
    case "setup": return <>To race, set up your timer first. <ArrowLink href="/speedrun">Set up speedrunning</ArrowLink></>;
    default: return null;
  }
}

/** Team races (co-op pick 6): the teams, best first, with each team's score or how far it's got. */
function TeamTable({ view, room }: { view: VersusRoomView; room: ReturnType<typeof useRaceRoom>["room"] }) {
  const teams = view.settings.teams;
  if (!teams || !room) return null;
  const rows = standings(room.entrants, room.checkpoints.length, rankFor(room.kind));
  const squad = new Map(view.entrants.map((e) => [e.userId, e.squad ?? null]));
  const named = new Map(view.entrants.map((e) => [e.userId, e.name]));
  const list = teamStandings(rows, (k) => squad.get(k), teams.score);
  if (!list.length) return null;
  const unit = view.kind === "speedrun" ? "ms" : "turns";
  return (
    <div className="team-table">
      <h3 className="team-table__h">Teams <small>{teams.score === "total" ? "everyone's results added up" : "each team's best"}</small></h3>
      <ol className="team-table__list">
        {list.map((t) => (
          <li key={t.team} className="team-table__row">
            <span className={`race-medal race-medal--${t.place ?? "none"}`}>{t.place ? ORDINAL[t.place - 1] : t.running ? "Going" : "Out"}</span>
            <span className="team-table__who"><b>Team {t.team}</b><small>{t.members.map((k) => named.get(k) ?? "Runner").join(", ")}</small></span>
            <span className="race-num">{t.value != null && t.place ? fmtValue(t.value, unit) : `${t.finished} of ${t.size} finished`}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LiveStandings({ room, view, serverNow, status, me, busy, onLeave, onEnd }: {
  room: NonNullable<ReturnType<typeof useRaceRoom>["room"]>; view: VersusRoomView; serverNow: number; status: RoomStatus;
  me: VersusRoomView["me"]; busy: boolean; onLeave: () => void; onEnd: () => void;
}) {
  const n = room.checkpoints.length;
  const duel = room.kind === "duel";
  const rows = standings(room.entrants, n, rankFor(room.kind));
  const byKey = new Map(view.entrants.map((e) => [e.userId, e]));
  const raceMs = room.startedAt ? Math.max(0, (status === "finished" && room.finishedAt ? room.finishedAt : serverNow) - room.startedAt) : 0;
  const mineRacing = me && room.entrants.some((e) => e.key === me.userId && e.lane.status === "running");
  return (
    <section className="race-sec" aria-labelledby="race-live-h">
      <div className="race-sec__h">
        <h2 id="race-live-h">{status === "running" ? (duel ? "The duel" : "The race") : "How it went"}</h2>
        {status === "running" && <span className="race-clock" role="timer">{fmtClock(raceMs)}</span>}
      </div>
      <TeamTable view={view} room={room} />
      <TableScroll label={duel ? "Duel standings" : "Race standings"}>
        <Table className="race-table">
          <TableHeader>
            {duel
              ? <TableRow><TableHead>#</TableHead><TableHead>Player</TableHead><TableHead>Up against</TableHead><TableHead>Knocked out</TableHead><TableHead align="right">Turns</TableHead></TableRow>
              : <TableRow><TableHead>#</TableHead><TableHead>Runner</TableHead><TableHead>Split now</TableHead><TableHead align="right">Last split</TableHead><TableHead align="right">Gap</TableHead><TableHead>Splits</TableHead></TableRow>}
          </TableHeader>
          <TableBody>
            {duel && rows.map((r) => {
              const e = room.entrants.find((x) => x.key === r.key)!;
              const who = byKey.get(r.key);
              const against = r.status === "done" ? "Won" : r.status === "out" ? outLine(r.outReason, r.outAt, room.checkpoints) : room.checkpoints[r.reached] ?? "Starting";
              const turns = r.status === "done" ? e.lane.finalMs : e.lane.current;
              return (
                <TableRow key={r.key} className={r.status === "out" ? "is-out" : undefined}>
                  <TableCell className="race-num">{r.place ?? ""}</TableCell>
                  <TableCell><span className="race-who">{who && <Runner e={who} />}<span>{e.name}</span></span></TableCell>
                  <TableCell>{against}</TableCell>
                  <TableCell><span className="race-kos"><SplitsBar done={r.reached} total={n} finished={r.status === "done"} /> {r.reached} of {n}</span></TableCell>
                  <TableCell align="right" className="race-num">{turns ?? ""}</TableCell>
                </TableRow>
              );
            })}
            {!duel && rows.map((r) => {
              const e = room.entrants.find((x) => x.key === r.key)!;
              const who = byKey.get(r.key);
              const now = r.status === "done" ? "Finished" : r.status === "out" ? outLine(r.outReason, r.outAt, room.checkpoints, plain) : room.checkpoints[r.reached] ? plain(room.checkpoints[r.reached]) : "Starting";
              const clock = r.timeMs;
              const gap = r.leader ? "Leader" : r.gapMs != null ? `+${fmtDelta(r.gapMs)}${r.gapAt != null ? ` at ${plain(room.checkpoints[r.gapAt])}` : ""}` : "";
              return (
                <TableRow key={r.key} className={r.status === "out" ? "is-out" : undefined}>
                  <TableCell className="race-num">{r.place ?? ""}</TableCell>
                  <TableCell><span className="race-who">{who && <Runner e={who} />}<span>{e.name}</span></span></TableCell>
                  <TableCell>{now}</TableCell>
                  <TableCell align="right" className="race-num">{r.status === "out" || clock == null ? "" : fmtClock(clock)}</TableCell>
                  <TableCell align="right" className={`race-num${r.gapMs ? " race-behind" : ""}`}>{gap}</TableCell>
                  <TableCell><SplitsBar done={r.reached} total={n} finished={r.status === "done"} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableScroll>
      {duel
        ? <p className="race-note">Each player duels in their own arena. A win counts first, then fewer turns, then less time.</p>
        : <p className="race-note">Gaps compare the same split on each runner{"'"}s own clock. Each row waits out that runner{"'"}s stream delay. A reset forfeits.</p>}
      <div className="race-watch">
        {view.entrants.filter((e) => e.username).map((e) => <ArrowLink key={e.userId} href={`/live/${e.username}`}>Watch {e.name}</ArrowLink>)}
      </div>
      <div className="race-acts">
        {status === "running" && mineRacing && <Button variant="ghost" size="small" iconBefore={IconFlag} disabled={busy} onClick={onLeave}>Forfeit</Button>}
        {status === "running" && me?.isHost && <Button variant="ghost" size="small" disabled={busy} onClick={onEnd}>{duel ? "End the duel" : "End the race"}</Button>}
      </div>
    </section>
  );
}

function Results({ view, room, onShare, onAgain, busy }: { view: VersusRoomView; room: ReturnType<typeof useRaceRoom>["room"]; onShare: () => void; onAgain: () => void; busy: boolean }) {
  const rows = [...view.entrants].filter((e) => e.status === "done" || e.status === "out")
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || (a.seat - b.seat));
  const duel = view.kind === "duel" || view.kind === "battle";
  const unit = duel ? "turns" : "ms";
  const winner = rows.find((e) => e.place === 1 && e.finalMs != null);
  const laneFor = (e: VersusEntrantView) => room?.entrants.find((x) => x.key === e.userId)?.lane;
  const outOf = (e: VersusEntrantView) => {
    const lane = laneFor(e);
    if (duel && (lane?.outReason ?? e.outReason) === "lost") return `Lost · ${lane?.reached ?? e.reached ?? 0} of ${view.checkpoints.length} knocked out`;
    if (view.kind === "battle" && (lane?.outReason ?? e.outReason) === "left") return "Forfeited";
    return lane ? outLine(lane.outReason, lane.outAt, view.checkpoints, plain) : "Didn't finish";
  };
  // A duel's winners: their turns, then the time that breaks a tie.
  const valueOf = (e: VersusEntrantView) => {
    const tie = duel ? laneFor(e)?.tieMs : null;
    return `${fmtValue(e.finalMs, unit)}${tie != null ? ` · ${fmtClock(tie)}` : ""}`;
  };
  return (
    <section className="race-sec" aria-labelledby="race-res-h">
      <h2 id="race-res-h">Results</h2>
      <TeamTable view={view} room={room} />
      <ol className="race-res">
        {rows.map((e) => {
          const gap = winner && e.place && e.place > 1 && e.finalMs != null && winner.finalMs != null && e.finalMs > winner.finalMs ? `+${fmtGap(e.finalMs - winner.finalMs, unit)}` : null;
          const pb = !duel && e.place != null && e.finalMs != null && (e.pbMs == null || e.finalMs <= e.pbMs);
          return (
            <li key={e.userId} className="race-res__row">
              <span className={`race-medal race-medal--${e.place ?? "none"}`}>{e.place ? ORDINAL[e.place - 1] : "Out"}</span>
              <Runner e={e} />
              <span className="race-res__name"><b>{e.name}</b>{pb && e.pbMs != null && <small className="race-pb"> New PB</small>}</span>
              <span className="race-num">{e.place && e.finalMs != null ? valueOf(e) : outOf(e)}{gap && <small> {gap}</small>}</span>
            </li>
          );
        })}
      </ol>
      <div className="race-acts">
        <Button variant="primary" iconBefore={IconShare} onClick={onShare}>Share</Button>
        {!view.nextCode && view.me?.isHost && <Button variant="secondary" disabled={busy} onClick={onAgain}>{view.kind === "battle" ? "Battle again" : duel ? "Duel again" : "Race again"}</Button>}
      </div>
      {view.nextCode && <ArrowLink href={`/races/${view.nextCode}`}>Next {view.kind === "battle" ? "battle" : duel ? "duel" : "race"}: {view.nextCode}</ArrowLink>}
    </section>
  );
}
