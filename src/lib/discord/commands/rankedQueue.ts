/**
 * The GS Ranked queue in Discord (lounge system picks 2A to 7A and 13A): /ranked queue posts a queue card in the
 * channel; its buttons join and leave, rooms vote a format, then play with a host and room code, and drops call subs.
 * The cards live in src/lib/ladders/queueCards.ts, the engine in src/lib/ladders/queueStore.ts.
 */

import { after } from "next/server";
import {
  cleanQueueInput, createQueue, dropFromRoom, finishRoom, getQueue, getRoom, joinQueue, leaveQueue, passSpot, playShort,
  queueEntries, queuesReady, roomTableText, setCanHost, setRoomCode, takeSpot, voteFormat, type Queue, type Room,
} from "@/lib/ladders/queueStore";
import { postQueueCard, postRoomCard, postSubAsk, queueCardBody, QUEUE_PREFIX, roomCardBody, ROOM_MODAL_PREFIX, ROOM_PREFIX } from "@/lib/ladders/queueCards";
import { getLadder, playerForDiscord } from "@/lib/ladders/store";
import type { Ladder } from "@/lib/ladders/types";
import { isUpdater, modalParts, pickLadder, submitForm, who } from "./ladder";

const EPHEMERAL = 1 << 6;
const say = (content: string, components: unknown[] = []) => Response.json({ type: 4, data: { content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });
const num = (n: number) => n.toLocaleString("en-US");
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2) => ({ type: 2, style, label, custom_id: id });
const row = (...components: unknown[]) => ({ type: 1, components });
const NOT_LINKED = (l: Ladder) => `You're not on ${l.name} yet. If you've played here, tie your Discord to your name with \`/ranked join\`. New to the lounge? Ask its staff to add you.`;
const actor = (by: { id: string; name: string }) => ({ id: by.id, name: by.name, via: "discord" as const });

export { QUEUE_PREFIX, ROOM_PREFIX, ROOM_MODAL_PREFIX };

/** Updates the message the button was on with `body` (a V2 card), dropping the flags Discord won't take on an edit. */
const updateCard = (body: Record<string, unknown>) => { const { flags: _f, ...rest } = body; void _f; return Response.json({ type: 7, data: rest }); };

/** /ranked queue: a queue card in this channel (updaters). */
export async function handleQueueCommand(interaction: Record<string, unknown>, opt: (name: string) => unknown, str: (name: string) => string | null): Promise<Response> {
  const guildId = String(interaction.guild_id ?? "");
  const channelId = (interaction.channel_id as string | undefined) ?? null;
  const by = who(interaction);
  if (!by || !channelId) return say("Couldn't tell where this is.");
  if (!(await queuesReady())) return say("The queue isn't ready yet.");
  const pick = await pickLadder(guildId, str("lounge"));
  if (!pick.ok) return say(pick.message);
  const ladder = pick.ladder;
  if (!isUpdater(ladder, interaction)) return say("Only updaters can set up a queue.");
  const times = (str("times") ?? "").split(/[,\s]+/).map((t) => t.trim()).filter(Boolean).map((t) => (/^\d:\d{2}$/.test(t) ? `0${t}` : t));
  const input = cleanQueueInput({
    name: str("name") ?? "Queue", channelId, mode: str("mode") === "rush" ? "rush" : "open", minMmr: opt("min"), maxMmr: opt("max"),
    formats: (str("formats") ?? "1,2,3,4,6").split(/[,\s]+/).map((f) => Number(f.replace(/v\d/i, ""))), rushTimes: times, lowest: opt("lowest") === true,
  }, ladder);
  if (input.mode === "rush" && !input.rushTimes.length) return say("A rush hour queue needs its times, like `times: 20:00, 22:00` (Pacific).");
  const queue = await createQueue(ladder, input, actor(by));
  if (!queue) return say("The queue couldn't be saved. Try again in a moment.");
  after(async () => { await postQueueCard(ladder, queue, []); });
  return say(`**${queue.name}** is set up here. Staff change it on the staff page's Settings tab.`);
}

/** After a join made rooms: post each room's card, then refresh the queue card. */
function postRooms(ladder: Ladder, queue: Queue, rooms: Room[]) {
  after(async () => {
    for (const room of rooms) await postRoomCard(ladder, room, queue);
  });
}

export async function handleQueueComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  if (customId.startsWith(QUEUE_PREFIX)) return queueButton(interaction, by, customId);
  return roomButton(interaction, by, customId);
}

async function queueButton(interaction: Record<string, unknown>, by: { id: string; name: string }, customId: string): Promise<Response> {
  const [kind, ref] = customId.slice(QUEUE_PREFIX.length).split(":");
  const queue = await getQueue(ref ?? "");
  if (!queue) return say("That queue is gone.");
  const ladder = await getLadder({ id: queue.ladderId });
  if (!ladder) return say("That lounge is gone.");
  const player = await playerForDiscord(ladder.id, by.id);
  if (!player) return say(NOT_LINKED(ladder));
  const refresh = async () => updateCard(queueCardBody(ladder, queue, await queueEntries(queue.id)));
  switch (kind) {
    case "j": {
      const res = await joinQueue(ladder, queue, player);
      if (!res.ok) return say(joinRefusal(res, queue));
      if (res.rooms.length) postRooms(ladder, queue, res.rooms);
      return refresh();
    }
    case "l": {
      if (!(await leaveQueue(queue, player.id))) return say("You're not in this queue.");
      return refresh();
    }
    case "s": {
      const left = await leaveQueue(queue, player.id, "sub");
      if (!left) {
        const res = await joinQueue(ladder, queue, player, "sub");
        if (!res.ok) return say(joinRefusal(res, queue));
      }
      return refresh();
    }
    case "h": {
      const entries = await queueEntries(queue.id);
      const mine = entries.find((e) => e.playerId === player.id);
      const now = !(mine?.canHost ?? false);
      await setCanHost(player.id, now);
      return mine ? refresh() : say(now ? "You're marked as able to host. It shows with a star when you join." : "You're no longer marked as able to host.");
    }
  }
  return say("Unknown button.");
}

function joinRefusal(res: Extract<Awaited<ReturnType<typeof joinQueue>>, { ok: false }>, q: Queue): string {
  const ts = (iso?: string) => (iso ? `<t:${Math.floor(Date.parse(iso) / 1000)}:${q.mode === "rush" ? "t" : "f"}>` : "later");
  switch (res.reason) {
    case "on_break": return `You're on a break from the queue until ${ts(res.until)}.`;
    case "in_room": return `You're in room ${num(res.room ?? 0)} right now.`;
    case "already_in": return "You're already in.";
    case "closed": return `Joining is closed until the rush hour at ${ts(res.until)}.`;
    case "below_tier": return `This queue is for ${q.minMmr != null ? `${num(q.minMmr)} MMR and up` : "a higher tier"}.`;
    case "above_tier": return `This queue is for up to ${q.maxMmr != null ? num(q.maxMmr) : "a lower"} MMR.`;
    case "placement_lowest": return "Players still placing join the lowest tier's queue.";
    case "inactive": return "This queue is closed right now.";
  }
}

async function roomButton(interaction: Record<string, unknown>, by: { id: string; name: string }, customId: string): Promise<Response> {
  const [kind, ref, extra] = customId.slice(ROOM_PREFIX.length).split(":");
  const room = await getRoom(ref ?? "");
  if (!room) return say("That room is gone.");
  const ladder = await getLadder({ id: room.ladderId });
  if (!ladder) return say("That lounge is gone.");
  const queue = room.queueId ? await getQueue(room.queueId) : null;
  const player = await playerForDiscord(ladder.id, by.id);
  const mine = !!player && room.players.some((p) => p.playerId === player.id);
  const card = (r: Room) => updateCard(roomCardBody(ladder, r, queue));

  switch (kind) {
    case "v": {
      if (!player || !mine) return say("Only this room's players vote.");
      const res = await voteFormat(ladder, room.id, player.id, Number(extra));
      if (!res.ok) return say(res.reason === "not_voting" ? "The vote is over." : "That vote didn't count. Try again.");
      return card(res.room);
    }
    case "c": {
      if (!player || room.hostId !== player.id) return say("The host posts the room code.");
      return Response.json({ type: 9, data: {
        custom_id: `${ROOM_MODAL_PREFIX}code:${room.id}`, title: `Room ${num(room.number)} code`,
        components: [{ type: 18, label: "Room code", description: "As the game shows it, like 1234-5678-9012.", component: { type: 4, custom_id: "code", style: 1, required: true, max_length: 40, ...(room.roomCode ? { value: room.roomCode } : {}) } }],
      } });
    }
    case "d": {
      if (!player || !mine) return say("You're not in this room.");
      const pen = ladder.settings.discipline.penalties.drop_before;
      return say(`Drop out of room ${num(room.number)}? You get the drop penalty: ${[pen.mmr ? `−${num(pen.mmr)} MMR` : null, pen.strikes ? `${pen.strikes} ${pen.strikes === 1 ? "strike" : "strikes"}` : null].filter(Boolean).join(" and ") || "a note on your record"}. The first sub in range is asked.`,
        [row(btn("Drop out", `${ROOM_PREFIX}dd:${room.id}`, 4))]);
    }
    case "dd": {
      if (!player || !mine) return say("You're not in this room.");
      const res = await dropFromRoom(ladder, room.id, player.id, player.id, actor(by));
      if (!res.ok) return say(res.reason === "asking" ? "A sub is already being asked for this room. Try again in a moment." : "You couldn't drop out just now. Try again.");
      after(async () => { await postRoomCard(ladder, res.room, queue); await postSubAsk(res.room, queue); });
      return Response.json({ type: 7, data: { content: `You're out of room ${num(room.number)}.`, components: [] } });
    }
    case "n": {
      if (!player || room.hostId !== player.id) return say("The host marks a no-show.");
      return say("Who didn't show? They get the drop penalty and the first sub in range is asked.", [row({
        type: 3, custom_id: `${ROOM_PREFIX}ns:${room.id}`, placeholder: "Pick the player",
        options: room.players.filter((p) => p.playerId !== player.id).slice(0, 25).map((p) => ({ label: p.name.slice(0, 100), value: p.playerId })),
      })]);
    }
    case "ns": {
      if (!player || room.hostId !== player.id) return say("The host marks a no-show.");
      const out = String(((interaction.data as { values?: string[] } | undefined)?.values ?? [])[0] ?? "");
      const res = await dropFromRoom(ladder, room.id, out, player.id, actor(by));
      if (!res.ok) return say(res.reason === "asking" ? "A sub is already being asked for this room." : "That didn't work. Try again.");
      after(async () => { await postRoomCard(ladder, res.room, queue); await postSubAsk(res.room, queue); });
      return Response.json({ type: 7, data: { content: `Marked as a no-show. ${res.room.subAsk?.askedName ? `${res.room.subAsk.askedName} is asked to sub.` : "Nobody on the sub list fits; you can play short."}`, components: [] } });
    }
    case "ts": {
      if (!player) return say(NOT_LINKED(ladder));
      const res = await takeSpot(ladder, room.id, player.id);
      if (!res.ok) return say(res.reason === "expired" ? "Your two minutes ran out; the next sub was asked." : res.reason === "in_room" ? "You're in another room." : "This spot isn't yours to take.");
      after(async () => { await postRoomCard(ladder, res.room, queue); });
      return Response.json({ type: 7, data: { content: `${by.name} took the spot in room ${num(room.number)}.`, components: [], allowed_mentions: { parse: [] } } });
    }
    case "tp": {
      if (!player) return say(NOT_LINKED(ladder));
      const res = await passSpot(room.id, player.id);
      if (!res.ok) return say("This spot isn't yours to pass.");
      after(async () => { await postRoomCard(ladder, res.room, queue); await postSubAsk(res.room, queue); });
      return Response.json({ type: 7, data: { content: `${by.name} passed on room ${num(room.number)}.`, components: [], allowed_mentions: { parse: [] } } });
    }
    case "sh": {
      if (!player || (room.hostId !== player.id && !isUpdater(ladder, interaction))) return say("The host or an updater decides to play short.");
      const r = await playShort(room.id);
      return r ? card(r) : say("There's no open spot.");
    }
    case "t": {
      if (!player || (!mine && !isUpdater(ladder, interaction))) return say("This room's players submit its table.");
      if (room.status !== "playing") return say("This room is finished.");
      return Response.json({ type: 9, data: submitForm(ladder, "new", `${ladder.id}:${room.id}`, { body: roomTableText(room, ladder.kind), format: room.format ?? 1, tier: queue?.name.slice(0, 12) ?? null }) });
    }
  }
  return say("Unknown button.");
}

export async function handleRoomModal(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const [kind, ref] = customId.slice(ROOM_MODAL_PREFIX.length).split(":");
  if (kind !== "code") return say("Unknown form.");
  const room = await getRoom(ref ?? "");
  const ladder = room ? await getLadder({ id: room.ladderId }) : null;
  if (!room || !ladder) return say("That room is gone.");
  const player = await playerForDiscord(ladder.id, by.id);
  const code = String(modalParts(interaction).get("code")?.value ?? "");
  const res = player ? await setRoomCode(room.id, player.id, code) : { ok: false as const, reason: "not_host" as const };
  if (!res.ok) return say(res.reason === "not_host" ? "The host posts the room code." : "That didn't save. Try again.");
  const queue = room.queueId ? await getQueue(room.queueId) : null;
  return updateCard(roomCardBody(ladder, res.room, queue));
}

/** A table submitted from a room's card: the room is done. */
export async function roomTableIn(ladder: Ladder, roomId: string, tableId: string): Promise<void> {
  const room = await finishRoom(roomId, tableId);
  if (room) await postRoomCard(ladder, room, room.queueId ? await getQueue(room.queueId) : null);
}

/** The every-minute sweep's changes, shown in Discord: closed votes, the next sub asked, rush hour rooms. */
export async function showSweep(changes: Awaited<ReturnType<typeof import("@/lib/ladders/queueStore").sweepQueues>>): Promise<void> {
  for (const c of changes) {
    const ladder = await getLadder({ id: c.ladderId });
    if (!ladder) continue;
    if (c.room) {
      const queue = c.room.queueId ? await getQueue(c.room.queueId) : null;
      await postRoomCard(ladder, c.room, queue);
      if (c.kind === "sub_moved") await postSubAsk(c.room, queue);
    }
    if (c.kind === "rush_rooms" && c.queue) {
      for (const room of c.rooms ?? []) await postRoomCard(ladder, room, c.queue);
      await postQueueCard(ladder, c.queue, await queueEntries(c.queue.id));
    }
  }
}

