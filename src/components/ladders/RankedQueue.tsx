"use client";

/**
 * The queue on a lounge's page (name, web and docs pick 7A; lounge system picks 2A to 7A): each queue with who's in, and
 * the rooms playing now. Players join, leave, go on the sub list, vote a format, post the room code (the host), drop out,
 * take a sub spot and submit their room's table here or in Discord; both show the same thing. Checks back every
 * 5 seconds while the page is open.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { Select } from "@/components/ui/Select";
import { formatLabel, type LadderKind } from "@/lib/ladders/types";
import { SubmitTable } from "./RankedYou";

interface QueueView {
  id: string; name: string; mode: "open" | "rush"; size: number; range: string; formats: number[];
  players: { name: string; canHost: boolean }[]; subs: number; rush: { at: string; closesAt: string; closed: boolean } | null; mine: { play: boolean; sub: boolean };
}
interface RoomPlayer { id: string; name: string; mmr: number }
interface RoomView {
  formats: number[]; id: string; number: number; status: "voting" | "playing"; format: number | null; voteEndsAt: string | null; roomCode: string | null;
  players: RoomPlayer[]; votes: Record<string, number>; myVote: number | null; teams: RoomPlayer[][] | null; host: string | null;
  subAsk: { out: string; asked: string | null; askedAt: string | null; mine: boolean } | null; mine: boolean; isHost: boolean;
}
interface State { queues: QueueView[]; rooms: RoomView[]; you: { signedIn: boolean; discord: boolean; player: { id: string; name: string; canHost: boolean } | null } }

const num = (n: number) => n.toLocaleString("en-US");
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const avg = (ps: { mmr: number }[]) => Math.round(ps.reduce((a, p) => a + p.mmr, 0) / Math.max(1, ps.length));

function errorText(e: { error?: string; until?: string | null; room?: number | null; min?: number | null; max?: number | null }): string {
  switch (e.error) {
    case "on_break": return `You're on a break from the queue${e.until ? ` until ${new Date(e.until).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}.`;
    case "in_room": return `You're in room ${num(e.room ?? 0)} right now.`;
    case "already_in": return "You're already in.";
    case "closed": return `Joining is closed until the rush hour${e.until ? ` at ${clock(e.until)}` : ""}.`;
    case "below_tier": return `This queue is for ${e.min != null ? `${num(e.min)} MMR and up` : "a higher tier"}.`;
    case "above_tier": return `This queue is for up to ${e.max != null ? num(e.max) : "a lower"} MMR.`;
    case "placement_lowest": return "Players still placing join the lowest tier's queue.";
    case "not_player": return "Claim your name on the lounge first (above).";
    case "not_member": return "Join the lounge's Discord server to play in its queue.";
    case "not_voting": return "The vote is over.";
    case "not_host": return "Only the host can do that.";
    case "asking": return "A sub is already being asked for this room.";
    case "expired": return "Your two minutes ran out; the next sub was asked.";
    case "not_asked": return "That spot isn't yours.";
    default: return "That didn't work. Try again in a moment.";
  }
}

/** The room's table for the submit form: team headings and every name, scores to fill in. */
function roomText(r: RoomView, kind: LadderKind): string {
  if (kind === "knockout") return r.players.map((p) => p.name).join("\n");
  if (!r.teams || (r.format ?? 1) === 1) return r.players.map((p) => `${p.name} `).join("\n");
  return r.teams.map((t, i) => [`# Team ${String.fromCharCode(65 + i)}`, ...t.map((p) => `${p.name} `)].join("\n")).join("\n");
}

export function RankedQueue({ ladderId, kind }: { ladderId: string; kind: LadderKind }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState<State | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<RoomView | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/ranked/${ladderId}/queue`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: State | null) => { if (alive && j) setState(j); }).catch(() => null);
    return () => { alive = false; };
  }, [ladderId, version]);
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") reload(); }, 5000);
    return () => window.clearInterval(id);
  }, [reload]);

  const act = async (key: string, body: Record<string, unknown>, done?: string) => {
    setBusy(key);
    const res = await fetch(`/api/ranked/${ladderId}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = ((await res?.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    setBusy(null);
    if (!res?.ok) { toast.error(errorText(json as Parameters<typeof errorText>[0])); return false; }
    if (done) toast.success(done);
    reload();
    return true;
  };

  if (!state || (!state.queues.length && !state.rooms.length)) return null;
  const me = state.you.player;
  const myRoom = state.rooms.find((r) => r.mine || r.subAsk?.mine);
  const others = state.rooms.filter((r) => r !== myRoom);

  return (
    <section className="lounge-sec ranked-queue" aria-labelledby="ranked-queue">
      <h2 id="ranked-queue">Queue</h2>
      {me && (
        <Switch label="I can host" helperText="Hosts make the room in the game and post its code. The highest MMR who can host is picked." checked={me.canHost} disabled={busy === "host"} onChange={(e) => act("host", { action: "host", canHost: e.target.checked })} />
      )}
      {myRoom && <RoomBlock room={myRoom} kind={kind} busy={busy} act={act} confirm={confirm} onSubmit={() => setSubmitting(myRoom)} highlight />}
      <ul className="ranked-staff__list">
        {state.queues.map((q) => (
          <li key={q.id} className="ranked-staff__row">
            <div className="ranked-staff__row-main">
              <span className="ranked-staff__row-title">
                {q.mode === "rush" ? `${q.name} · rush hour${q.rush ? ` ${clock(q.rush.at)}` : ""}` : `${q.name} · ${q.players.length} of ${q.size} in`}
              </span>
              <span className="ladder-muted">
                {q.range} {q.mode === "rush"
                  ? (q.rush ? (q.rush.closed ? `Joining is closed until ${clock(q.rush.at)}.` : `${q.players.length} in so far. Join before ${clock(q.rush.closesAt)}; then rooms are sorted by MMR.`) : "No times set yet.")
                  : `A room opens the moment ${q.size} are in.`}
              </span>
              {q.players.length > 0 && <span>{q.players.map((p) => `${p.name}${p.canHost ? " ★" : ""}`).join(" · ")}</span>}
              {(q.players.some((p) => p.canHost) || q.subs > 0) && <span className="ladder-muted">{[q.players.some((p) => p.canHost) ? "★ can host" : null, q.subs ? `${q.subs} on the sub list` : null].filter(Boolean).join(" · ")}</span>}
            </div>
            {me && !myRoom && (
              <div className="ranked-staff__row-acts">
                {q.mine.play
                  ? <Button size="small" variant="secondary" loading={busy === `l${q.id}`} onClick={() => act(`l${q.id}`, { action: "leave", queueId: q.id })}>Leave</Button>
                  : <Button size="small" loading={busy === `j${q.id}`} onClick={() => act(`j${q.id}`, { action: "join", queueId: q.id })}>Join</Button>}
                {q.mine.sub
                  ? <Button size="small" variant="ghost" loading={busy === `s${q.id}`} onClick={() => act(`s${q.id}`, { action: "leave", queueId: q.id, kind: "sub" })}>Leave the sub list</Button>
                  : <Button size="small" variant="ghost" loading={busy === `s${q.id}`} onClick={() => act(`s${q.id}`, { action: "sub", queueId: q.id }, "You're on the sub list.")}>I can sub</Button>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <div className="ranked-queue__rooms">
          <h3>Rooms playing now</h3>
          <ul className="ranked-staff__list">
            {others.map((r) => (
              <li key={r.id} className="ranked-staff__row">
                <div className="ranked-staff__row-main">
                  <span className="ranked-staff__row-title">Room {num(r.number)} · {r.status === "voting" ? "voting a format" : kind === "knockout" ? "Knockout Tour" : formatLabel(r.format ?? 1)}</span>
                  <span className="ladder-muted">{r.players.length} players · average {num(avg(r.players))}{r.host ? ` · host ${r.host}` : ""}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {submitting && (
        <SubmitTable ladderId={ladderId} kind={kind} prefill={{ body: roomText(submitting, kind), format: submitting.format ?? 1, roomId: submitting.id, title: `Room ${num(submitting.number)}'s table` }} onClose={(changed) => { setSubmitting(null); if (changed) reload(); }} />
      )}
    </section>
  );
}

function RoomBlock({ room, kind, busy, act, confirm, onSubmit, highlight }: {
  room: RoomView; kind: LadderKind; busy: string | null; highlight?: boolean;
  act: (key: string, body: Record<string, unknown>, done?: string) => Promise<boolean>;
  confirm: ReturnType<typeof useConfirm>;
  onSubmit: () => void;
}) {
  const [code, setCode] = useState(room.roomCode ?? "");
  const [noShow, setNoShow] = useState("");
  const title = room.status === "voting" ? `Room ${num(room.number)} is ready` : `Room ${num(room.number)} · ${kind === "knockout" ? "Knockout Tour" : formatLabel(room.format ?? 1)}`;
  const drop = async () => {
    if (!(await confirm({ title: `Drop out of room ${num(room.number)}?`, body: "You get the lounge's drop penalty, and the first sub in range is asked.", confirmLabel: "Drop out" }))) return;
    await act(`d${room.id}`, { action: "drop", roomId: room.id }, "You're out of the room.");
  };
  return (
    <div className={`ranked-queue__room${highlight ? " ranked-queue__room--mine" : ""}`}>
      <h3>{title}</h3>
      <p className="ladder-muted">{room.players.length} players · average {num(avg(room.players))}{room.host ? ` · host ${room.host}` : ""}</p>
      {room.subAsk?.mine ? (
        <div className="ranked-queue__ask">
          <p className="ladder-note">You&apos;re asked to sub: {room.subAsk.out} is out. Take the spot within two minutes, or pass and the next sub is asked.</p>
          <div className="ranked-you__acts">
            <Button loading={busy === `t${room.id}`} onClick={() => act(`t${room.id}`, { action: "take", roomId: room.id }, "You're in the room.")}>Take the spot</Button>
            <Button variant="ghost" loading={busy === `p${room.id}`} onClick={() => act(`p${room.id}`, { action: "pass", roomId: room.id })}>Pass</Button>
          </div>
        </div>
      ) : room.status === "voting" ? (
        <>
          <p className="ranked-queue__line">Vote a format{room.voteEndsAt ? ` by ${clock(room.voteEndsAt)}` : ""}. The most votes wins; a tie goes to the bigger teams.</p>
          <div className="ranked-you__acts" role="group" aria-label="Format vote">
            {room.formats.map((f) => (
              <Button key={f} size="small" variant={room.myVote === f ? "primary" : "secondary"} aria-pressed={room.myVote === f} loading={busy === `v${f}`} onClick={() => act(`v${f}`, { action: "vote", roomId: room.id, format: f })}>
                {formatLabel(f)} · {room.votes[f] ?? 0}
              </Button>
            ))}
          </div>
          <p className="ladder-muted">{room.players.map((p) => p.name).join(" · ")}</p>
        </>
      ) : (
        <>
          <ul className="ranked-queue__teams">
            {(room.teams && (room.format ?? 1) > 1 ? room.teams : [room.players]).map((t, i) => (
              <li key={i}>{(room.format ?? 1) > 1 ? <b>{String.fromCharCode(65 + i)} </b> : null}{t.map((p) => p.name).join((room.format ?? 1) > 1 ? " + " : " · ")}{(room.format ?? 1) > 1 ? <span className="ladder-muted"> · average {num(avg(t))}</span> : null}</li>
            ))}
          </ul>
          <p className="ranked-queue__line"><b>Room code:</b> {room.roomCode ?? `${room.host ?? "The host"} posts it here.`}</p>
          {room.subAsk && <p className="ranked-staff__row-why">{room.subAsk.asked ? `${room.subAsk.out} is out; ${room.subAsk.asked} is asked to sub.` : `${room.subAsk.out} is out, and nobody on the sub list fits.`}</p>}
          {room.isHost && (
            <div className="ranked-queue__host">
              <div className="ranked-you__claim-row">
                <Input floatingLabel="Room code" value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} />
                <Button variant="secondary" loading={busy === `c${room.id}`} disabled={!code.trim() || code.trim() === room.roomCode} onClick={() => act(`c${room.id}`, { action: "code", roomId: room.id, code }, "Room code posted.")}>Post the code</Button>
              </div>
              {!room.subAsk && (
                <div className="ranked-you__claim-row">
                  <Select floatingLabel="Didn't show" value={noShow} onChange={(v) => setNoShow(String(v))} options={[{ value: "", label: "Pick a player" }, ...room.players.map((p) => ({ value: p.id, label: p.name }))]} />
                  <Button variant="secondary" disabled={!noShow} loading={busy === `n${room.id}`} onClick={() => act(`n${room.id}`, { action: "noshow", roomId: room.id, playerId: noShow }, "Marked. The first sub in range is asked.")}>Mark a no-show</Button>
                </div>
              )}
              {room.subAsk && !room.subAsk.asked && <Button variant="secondary" loading={busy === `sh${room.id}`} onClick={() => act(`sh${room.id}`, { action: "short", roomId: room.id }, "Playing short.")}>Play short</Button>}
            </div>
          )}
          {room.mine && (
            <div className="ranked-you__acts">
              <Button onClick={onSubmit}>Submit the table</Button>
              <Button variant="ghost" loading={busy === `d${room.id}`} onClick={drop}>Drop out</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
