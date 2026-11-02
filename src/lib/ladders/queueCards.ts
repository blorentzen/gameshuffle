import "server-only";

/**
 * The queue's Discord cards (lounge system picks 2A to 7A, drawn on https://claude.ai/artifact/1nWqceDvxZpTToXyaem9vm):
 *   llq:j|l|s|h:<queueId>     Join, Leave, I can sub, I can host
 *   llr:v:<roomId>:<format>   a format vote
 *   llr:c|n|d|t:<roomId>      Room code (host), Need a sub (host), Drop out, Submit the table
 *   llr:ts|tp|sh:<roomId>     Take the spot, Pass (the asked sub), Play short (host)
 * The queue card is one message edited as people come and go; each room gets its own message (pinging its players),
 * edited from the vote to the teams; each sub ask is a new message so the sub gets the ping.
 */

import { compRest } from "@/lib/discord/compRest";
import { COMP_COLOR } from "@/lib/discord/ttPanel";
import { SITE_URL } from "@/lib/seo";
import { rushWindow, setQueueMessage, setRoomMessage, type Queue, type QueueRow, type Room } from "./queueStore";
import { teamAverage, SUB_ASK_SECONDS } from "./queue";
import { formatLabel, ladderPath, type Ladder } from "./types";

export const QUEUE_PREFIX = "llq:";
export const ROOM_PREFIX = "llr:";
export const ROOM_MODAL_PREFIX = "llrm:";
const V2 = 1 << 15;

const text = (content: string) => ({ type: 10, content: content.slice(0, 3900) });
const row = (...components: unknown[]) => ({ type: 1, components });
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2, disabled = false) => ({ type: 2, style, label, custom_id: id, ...(disabled ? { disabled: true } : {}) });
const link = (label: string, url: string) => ({ type: 2, style: 5, label, url });
const num = (n: number) => n.toLocaleString("en-US");
const ts = (iso: string | Date, style: "t" | "R" | "f" = "R") => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;

export function rangeLine(q: Pick<Queue, "minMmr" | "maxMmr" | "lowest">): string {
  const range = q.minMmr != null && q.maxMmr != null ? `For ${num(q.minMmr)} to ${num(q.maxMmr)} MMR` : q.minMmr != null ? `For ${num(q.minMmr)} MMR and up` : q.maxMmr != null ? `For up to ${num(q.maxMmr)} MMR` : "For everyone";
  return `${range}${q.lowest ? ", and players still placing" : ""}.`;
}

function wrap(parts: unknown[], mentions: string[] = []): Record<string, unknown> {
  return { flags: V2, allowed_mentions: mentions.length ? { users: mentions.slice(0, 100) } : { parse: [] }, components: [{ type: 17, accent_color: COMP_COLOR, components: parts }] };
}

export function queueCardBody(ladder: Ladder, q: Queue, entries: QueueRow[], now = new Date()): Record<string, unknown> {
  const play = entries.filter((e) => e.kind === "play");
  const subs = entries.filter((e) => e.kind === "sub");
  const parts: unknown[] = [];
  if (q.mode === "rush") {
    const w = rushWindow(q, now);
    const full = Math.floor(play.length / q.size);
    parts.push(text(w
      ? `## ${q.name} · rush hour ${ts(w.at, "t")}\n${rangeLine(q)} Join any time before ${ts(w.closesAt, "t")}. Then everyone is sorted by MMR into rooms of ${q.size}; whoever doesn't fill a room waits for the next one.`
      : `## ${q.name} · rush hour\n${rangeLine(q)} No rush hour times are set yet.`));
    parts.push(text(`**${play.length}** in so far${full ? `, so ${full} ${full === 1 ? "room" : "rooms"}${play.length % q.size ? ` with ${play.length % q.size} waiting` : ""}` : ""}.${w ? (w.closed ? ` Joining is closed until ${ts(w.at, "t")}.` : ` Joining closes ${ts(w.closesAt)}.`) : ""}`));
  } else {
    parts.push(text(`## ${q.name} · ${play.length} of ${q.size} in\n${rangeLine(q)} A room opens the moment ${q.size} are in.`));
  }
  if (play.length) {
    const names = play.slice(0, 24).map((e) => `${e.name}${e.canHost ? " ★" : ""}`);
    parts.push(text(`${names.join(" · ")}${play.length > 24 ? ` · and ${play.length - 24} more` : ""}`));
    parts.push(text(`-# ★ can host · average ${num(teamAverage(play))}${subs.length ? ` · ${subs.length} on the sub list` : ""}`));
  } else if (subs.length) parts.push(text(`-# ${subs.length} on the sub list`));
  parts.push(row(btn("Join", `${QUEUE_PREFIX}j:${q.id}`, 3), btn("Leave", `${QUEUE_PREFIX}l:${q.id}`), btn("I can sub", `${QUEUE_PREFIX}s:${q.id}`), btn("I can host", `${QUEUE_PREFIX}h:${q.id}`)));
  return wrap(parts);
}

export function roomCardBody(ladder: Ladder, room: Room, q: Queue | null, opts: { ping?: boolean } = {}): Record<string, unknown> {
  const avg = num(teamAverage(room.players));
  const host = room.players.find((p) => p.playerId === room.hostId);
  const mentions = opts.ping ? room.players.map((p) => p.discordId).filter((x): x is string => !!x) : [];
  const parts: unknown[] = [];
  if (room.status === "voting") {
    const formats = q?.formats ?? [1, 2, 3, 4, 6];
    const count = (f: number) => Object.values(room.votes).filter((v) => v === f).length;
    parts.push(text(`## Room ${num(room.number)} is ready\n${q?.name ?? ladder.name} · ${room.players.length} players · average ${avg}`));
    parts.push(text(room.players.map((p) => (p.discordId ? `<@${p.discordId}>` : p.name)).join(" ")));
    parts.push(text(`**Vote a format**${room.voteEndsAt ? ` · closes ${ts(room.voteEndsAt)}` : ""}`));
    parts.push(row(...formats.map((f) => btn(`${formatLabel(f)} · ${count(f)}`, `${ROOM_PREFIX}v:${room.id}:${f}`, count(f) ? 1 : 2))));
    parts.push(text("-# The format with the most votes wins; a tie goes to the bigger teams."));
    return wrap(parts, mentions);
  }
  const title = `## Room ${num(room.number)} · ${ladder.kind === "knockout" ? "Knockout Tour" : formatLabel(room.format ?? 1)}`;
  if (room.status === "done" || room.status === "canceled") {
    parts.push(text(`${title}\n${room.status === "done" ? "The table is in." : "Canceled."}`));
    if (room.status === "done" && room.tableId) parts.push(row(link("The lounge", `${SITE_URL}${ladderPath(ladder.slug)}`)));
    return wrap(parts);
  }
  const teams = (room.format ?? 1) > 1 && room.teams
    ? room.teams.map((t, i) => `**${String.fromCharCode(65 + i)}** ${t.map((p) => p.name).join(" + ")} · average ${num(teamAverage(t))}`).join("\n")
    : room.players.map((p) => p.name).join(" · ");
  parts.push(text(`${title}\n${(room.format ?? 1) > 1 ? "Teams drawn by MMR so each team averages about the same." : `${room.players.length} players · average ${avg}`}`));
  parts.push(text(teams));
  parts.push(text(`**Host:** ${host ? `${host.name}${host.canHost ? "" : " (highest MMR here)"}` : "nobody yet"}\n**Room code:** ${room.roomCode ?? `${host?.name ?? "The host"} posts it here`}`));
  if (room.subAsk) {
    const a = room.subAsk;
    parts.push(text(a.askedId ? `**Needs a sub:** ${a.outName} is out. ${a.askedName} is asked to take the spot, ${a.askedAt ? `until ${ts(new Date(Date.parse(a.askedAt) + SUB_ASK_SECONDS * 1000))}` : "now"}.` : `**Needs a sub:** ${a.outName} is out, and nobody on the sub list fits. The host can play short.`));
  }
  parts.push(row(
    btn("Room code", `${ROOM_PREFIX}c:${room.id}`),
    btn("Need a sub", `${ROOM_PREFIX}n:${room.id}`, 2, !!room.subAsk),
    btn("Drop out", `${ROOM_PREFIX}d:${room.id}`, 4),
    btn("Submit the table", `${ROOM_PREFIX}t:${room.id}`, 1),
    ...(room.subAsk && !room.subAsk.askedId ? [btn("Play short", `${ROOM_PREFIX}sh:${room.id}`)] : []),
  ));
  return wrap(parts);
}

export function subAskBody(room: Room): Record<string, unknown> {
  const a = room.subAsk!;
  return {
    allowed_mentions: a.askedDiscordId ? { users: [a.askedDiscordId] } : { parse: [] },
    content: `${a.askedDiscordId ? `<@${a.askedDiscordId}>` : a.askedName}, room ${num(room.number)} needs a sub: ${a.outName} is out. Take the spot within ${SUB_ASK_SECONDS / 60} minutes, or pass and the next sub is asked.`,
    components: [row(btn("Take the spot", `${ROOM_PREFIX}ts:${room.id}`, 3), btn("Pass", `${ROOM_PREFIX}tp:${room.id}`))],
  };
}

/** Posts the queue's card in its channel, or changes the posted one. */
export async function postQueueCard(ladder: Ladder, q: Queue, entries: QueueRow[]): Promise<"ok" | "no_access" | "failed" | "no_channel"> {
  if (!q.channelId) return "no_channel";
  const body = queueCardBody(ladder, q, entries);
  if (q.messageId) {
    const { flags: _f, ...edit } = body; void _f;
    const res = await compRest("PATCH", `/channels/${q.channelId}/messages/${q.messageId}`, edit);
    if (res.ok) return "ok";
    if (res.status !== 404) return res.status === 403 ? "no_access" : "failed";
  }
  const sent = await compRest<{ id: string }>("POST", `/channels/${q.channelId}/messages`, body);
  if (!sent.ok) return sent.status === 403 ? "no_access" : "failed";
  await setQueueMessage(q.id, q.channelId, sent.data.id);
  return "ok";
}

/** Posts a new room's card (pinging its players) or changes it. */
export async function postRoomCard(ladder: Ladder, room: Room, q: Queue | null): Promise<boolean> {
  const channel = room.channelId ?? q?.channelId;
  if (!channel) return false;
  if (room.messageId) {
    const { flags: _f, ...edit } = roomCardBody(ladder, room, q); void _f;
    const res = await compRest("PATCH", `/channels/${channel}/messages/${room.messageId}`, edit);
    if (res.ok || res.status !== 404) return res.ok;
  }
  const sent = await compRest<{ id: string }>("POST", `/channels/${channel}/messages`, roomCardBody(ladder, room, q, { ping: true }));
  if (!sent.ok) return false;
  await setRoomMessage(room, channel, sent.data.id);
  return true;
}

/** Pings the sub being asked. */
export async function postSubAsk(room: Room, q: Queue | null): Promise<boolean> {
  const channel = room.channelId ?? q?.channelId;
  if (!channel || !room.subAsk?.askedId) return false;
  const res = await compRest("POST", `/channels/${channel}/messages`, subAskBody(room));
  return res.ok;
}
