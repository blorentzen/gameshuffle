import "server-only";

/**
 * Speedrun races on the GameShuffle Competitive bot (races pick 9A): "Race starting" with the runners and a Watch the
 * race button, then the results. To each Competitive server with "Post races" on and a channel, when the host or any
 * runner is its owner or a member. One of each per room, claimed on the room. Results wait out the longest stream
 * delay among the runners, so Discord never hears who won before every stream shows it.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { DiscordEmbed } from "@/lib/adapters/discord/adapter";
import { cover, runner, send, targets, type Target } from "@/lib/speedrun/discordPosts";
import { shownName } from "@/lib/speedrun/splitGroups";
import { SITE_URL } from "@/lib/seo";
import { fmtGap, fmtValue, outLine, rankFor, standings } from "./rules";
import type { RoomRow } from "./store";
import type { RoomView } from "./types";

const RED = 0xd1283e;
const GOLD = 0xd4a017;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

/** "Nova, Riley, Sam and Kit". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The start post (pure, for tests). A duel says so ("Duel starting: Ramos"). */
export function raceStartEmbed(o: { title: string; names: string[]; startedAt: number | null; cover: string | null; duel?: boolean }): DiscordEmbed {
  const when = o.startedAt ? ` Started <t:${Math.floor(o.startedAt / 1000)}:t>.` : "";
  return {
    title: o.duel ? `${o.title.replace(/^Duel: /, "Duel starting: ")}` : `Race starting: ${o.title}`,
    description: `${nameList(o.names)}.${when}`,
    color: RED,
    ...(o.cover ? { thumbnail: { url: o.cover } } : {}),
    footer: { text: "Speedrun race · GameShuffle" },
  };
}

/** The results post (pure, for tests): the winner and their time, then everyone's place, gap or why they stopped. */
export function raceResultsEmbed(o: { title: string; view: RoomView; pbs: Map<string, number | null>; cover: string | null }): DiscordEmbed {
  const duel = o.view.kind === "duel";
  const unit = o.view.unit;
  const rows = standings(o.view.entrants, o.view.checkpoints.length, rankFor(o.view.kind));
  const name = (key: string) => o.view.entrants.find((e) => e.key === key)?.name ?? (duel ? "A player" : "A runner");
  const finished = rows.filter((r) => r.status === "done");
  const winner = finished[0];
  const fields: DiscordEmbed["fields"] = [];
  finished.slice(0, 8).forEach((r, i) => {
    fields.push({ name: ORD[i], value: i === 0 ? `${name(r.key)} ${fmtValue(r.timeMs, unit)}` : `${name(r.key)} +${fmtGap(r.gapMs ?? 0, unit)}`, inline: true });
  });
  // A duel places its losers too, after the winners, by how many cards they knocked out.
  const lostPlaced = duel ? rows.filter((r) => r.status === "out" && r.place != null) : [];
  for (const r of lostPlaced.slice(0, 8 - fields.length)) {
    fields.push({ name: ORD[(r.place ?? 1) - 1] ?? `${r.place}th`, value: `${name(r.key)}, lost (${r.reached} of ${o.view.checkpoints.length} down)`, inline: true });
  }
  const out = rows.filter((r) => r.status !== "done" && !lostPlaced.includes(r));
  if (out.length) {
    fields.push({ name: "Didn't finish", value: out.map((r) => `${name(r.key)}: ${outLine(r.outReason, r.outAt, o.view.checkpoints, shownName)}`).join("\n").slice(0, 1000) });
  }
  let title = duel ? "Duel over: nobody won" : "Race over: nobody finished";
  let description = o.title;
  if (winner) {
    const pb = o.pbs.get(winner.key);
    const newPb = !duel && winner.timeMs != null && pb != null && winner.timeMs <= pb ? ", a new PB" : "";
    title = `${name(winner.key)} won the ${duel ? "duel" : "race"}`;
    description = `${o.title} in **${fmtValue(winner.timeMs, unit)}**${newPb}.`;
  }
  return {
    title, description, color: GOLD, fields,
    ...(o.cover ? { thumbnail: { url: o.cover } } : {}),
    footer: { text: duel ? "Duel · GameShuffle" : "Speedrun race · GameShuffle" },
  };
}

/** Every Competitive server that wants this race: anyone in it (host included) is the owner or a member there. */
async function raceTargets(userIds: string[]): Promise<Target[]> {
  const seen = new Map<string, Target>();
  for (const id of userIds) {
    for (const t of await targets(await runner(id), "races")) if (!seen.has(t.guildId)) seen.set(t.guildId, t);
  }
  return [...seen.values()];
}

async function claim(roomId: string, column: "discord_started_at" | "discord_results_at"): Promise<boolean> {
  const { data } = await createServiceClient().from("versus_rooms").update({ [column]: new Date().toISOString() }).eq("id", roomId).is(column, null).select("id");
  return !!data?.length;
}

const titleOf = (room: RoomRow, view: RoomView) => view.title || "Speedrun race";

export async function postRaceStart(room: RoomRow, view: RoomView): Promise<void> {
  const ids = [...new Set([room.host_user_id, ...view.entrants.map((e) => e.key)])];
  const ts = await raceTargets(ids);
  if (!ts.length || !(await claim(room.id, "discord_started_at"))) return;
  const duel = room.kind === "duel";
  const embed = raceStartEmbed({ title: titleOf(room, view), names: view.entrants.map((e) => e.name), startedAt: view.startedAt, cover: duel ? null : cover(room.game), duel });
  for (const t of ts) await send(t, embed, { label: duel ? "Watch the duel" : "Watch the race", url: `${SITE_URL}/races/${room.code}` }, false);
}

export async function postRaceResults(room: RoomRow, view: RoomView): Promise<void> {
  const ids = [...new Set([room.host_user_id, ...view.entrants.map((e) => e.key)])];
  const ts = await raceTargets(ids);
  if (!ts.length || !(await claim(room.id, "discord_results_at"))) return;
  // Wait out the longest stream delay (60 seconds at most), so no stream is spoiled.
  const delay = Math.min(60_000, Math.max(0, ...view.entrants.map((e) => e.delayMs)));
  if (delay) await wait(delay);
  const { data } = await createServiceClient().from("speedrun_setups").select("user_id, run").in("user_id", view.entrants.map((e) => e.key));
  const pbs = new Map<string, number | null>();
  for (const r of (data ?? []) as { user_id: string; run: { pbMs?: number | null }[] | null }[]) pbs.set(r.user_id, Array.isArray(r.run) ? r.run.at(-1)?.pbMs ?? null : null);
  const embed = raceResultsEmbed({ title: titleOf(room, view), view, pbs, cover: room.kind === "duel" ? null : cover(room.game) });
  for (const t of ts) await send(t, embed, { label: room.kind === "duel" ? "See the duel" : "See the race", url: `${SITE_URL}/races/${room.code}` }, false);
}
