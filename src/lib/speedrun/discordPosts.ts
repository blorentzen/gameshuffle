import "server-only";

/**
 * Speedrunning on the GameShuffle Competitive bot (speedrun Twitch and Discord picks 2026-11-10, all as recommended,
 * Competitive by Britton's rule: anything competitive goes there):
 *   - new PB posts (free, a server's opt-in switch) for the server's owner and members who connected GameShuffle
 *   - PB pace alerts (GS Pro on the server's owner): once per run, when it's ahead of PB with a quarter left and the
 *     runner is live on Twitch, with an optional role ping
 *   - `/pb` (free): PB, sum of best and attempts for the owner by default, or any member who connected GameShuffle
 *   - "Speedrun tonight" on the main bot's end-of-stream recap (a stream summary may carry a competitive line)
 * Posts wait out the runner's stream delay ("Replies wait") so Discord never hears about a PB before the stream shows it.
 */

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { withDiscordApp } from "@/lib/discord/apps";
import { appGuildsReady } from "@/lib/discord/appGuilds";
import { isGuildMember, postEmbed, type DiscordEmbed } from "@/lib/adapters/discord/adapter";
import { actionRow, linkButton } from "@/lib/discord/respond";
import { boxArt } from "@/data/game-catalog";
import { gameEntry } from "@/lib/games/key";
import { SITE_URL } from "@/lib/seo";
import { fmtClock, fmtDelta } from "./time";
import { relayState } from "./relay";
import { idleState, isNewPb, lastDelta, onPbPace, pbTime, segmentLengths, sumOfBest } from "./rules";
import { readCompSpeedrun } from "./compDiscord";
import type { RelayState, RelaySegment } from "./types";

const GOLD = 0xd4a017;
const PACE = 0x2bd17e;
const BLUE = 0x2b52d6;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface Runner { userId: string; name: string; discordId: string | null; twitch: string | null; live: boolean }

export async function runner(userId: string): Promise<Runner> {
  const db = createServiceClient();
  const [{ data: u }, { data: tc }] = await Promise.all([
    db.from("users").select("display_name, username, twitch_username, discord_id").eq("id", userId).maybeSingle(),
    db.from("twitch_connections").select("twitch_login, is_live").eq("user_id", userId).maybeSingle(),
  ]);
  const user = u as { display_name: string | null; username: string | null; twitch_username: string | null; discord_id: string | null } | null;
  const t = tc as { twitch_login: string | null; is_live: boolean | null } | null;
  return {
    userId,
    name: user?.display_name || user?.twitch_username || user?.username || "A runner",
    discordId: user?.discord_id ?? null,
    twitch: t?.twitch_login ?? user?.twitch_username ?? null,
    live: !!t?.is_live,
  };
}

/** "Super Mario Odyssey · Any%". */
export const runTitle = (game: string, category: string) => [game, category].filter(Boolean).join(" · ") || "Speedrun";
const gameShown = (game: string | null) => (game ? gameEntry(game)?.name ?? game : "");
export function cover(game: string | null): string | null {
  const art = boxArt(gameEntry(game));
  return art ? `${SITE_URL}${art}` : null;
}

export interface Target { guildId: string; channel: string; role: string | null }

/**
 * The Competitive servers that want this post for this runner: the switch on, a channel picked, and the runner is the
 * server's owner or a member (Discord says so). Pace alerts also need the owner on GS Pro.
 */
export async function targets(r: Runner, kind: "pbs" | "pace" | "races"): Promise<Target[]> {
  if (!(await appGuildsReady())) return [];
  const { data } = await createServiceClient().from("discord_app_guilds").select("guild_id, owner_user_id, settings").eq("app", "comp").is("removed_at", null);
  const rows = (data ?? []) as { guild_id: string; owner_user_id: string; settings: Record<string, unknown> | null }[];
  const out: Target[] = [];
  const pro = new Map<string, boolean>();
  for (const g of rows) {
    const sr = readCompSpeedrun(g.settings);
    const channel = typeof g.settings?.channel === "string" ? g.settings.channel : null;
    if (!sr[kind] || !channel) continue;
    if (kind === "pace") {
      if (!pro.has(g.owner_user_id)) pro.set(g.owner_user_id, await isProUser(g.owner_user_id));
      if (!pro.get(g.owner_user_id)) continue;
    }
    const mine = g.owner_user_id === r.userId;
    if (!mine) {
      if (!r.discordId) continue;
      const member = await withDiscordApp("comp", () => isGuildMember(g.guild_id, r.discordId!));
      if (!member) continue;
    }
    out.push({ guildId: g.guild_id, channel, role: kind === "pace" ? sr.paceRole : null });
  }
  return out;
}

export async function send(t: Target, embed: DiscordEmbed, button: { label: string; url: string } | null, ping: boolean): Promise<void> {
  const res = await withDiscordApp("comp", () => postEmbed({
    channelId: t.channel,
    embed,
    ...(ping && t.role ? { content: `<@&${t.role}>`, allowedMentions: { roles: [t.role] } } : {}),
    ...(button ? { components: [actionRow(linkButton(button.label, button.url))] } : {}),
  }));
  if (!res.ok && !/^(403|404):/.test(res.error)) console.error(`[speedrun] discord post in ${t.guildId}:`, res.error);
}

/** The new PB post (pure, for tests): "Nova got a new PB". */
export function pbPostEmbed(o: { name: string; game: string; category: string; st: RelayState; cover: string | null }): DiscordEmbed {
  const n = o.st.segments.length;
  const end = o.st.splits[n - 1] ?? null;
  const was = pbTime(o.st.segments);
  const golds = o.st.golds.filter(Boolean).length;
  const sob = sumOfBest(o.st);
  const faster = end != null && was != null ? `, ${fmtDelta(was - end)} faster` : "";
  const extra = [`Attempt ${o.st.attempt.toLocaleString("en-US")}`, golds ? `${golds} gold split${golds === 1 ? "" : "s"}` : null].filter(Boolean).join(", ");
  return {
    title: `${o.name} got a new PB`,
    description: `${runTitle(o.game, o.category)} in **${fmtClock(end)}**${faster}. ${extra}.`,
    color: GOLD,
    fields: [
      { name: "New PB", value: fmtClock(end), inline: true },
      ...(was != null ? [{ name: "Was", value: fmtClock(was), inline: true }] : []),
      ...(sob != null ? [{ name: "Sum of best", value: fmtClock(sob), inline: true }] : []),
    ],
    ...(o.cover ? { thumbnail: { url: o.cover } } : {}),
    footer: { text: "Speedrun · GameShuffle" },
  };
}

/** The pace alert (pure, for tests): "Nova is on PB pace". */
export function pacePostEmbed(o: { name: string; game: string; category: string; st: RelayState; cover: string | null }): DiscordEmbed {
  const d = lastDelta(o.st);
  const left = o.st.segments.length - (o.st.index ?? 0);
  const ahead = d ? fmtDelta(-d.ms) : "";
  return {
    title: `${o.name} is on PB pace`,
    description: `${runTitle(o.game, o.category)}: ${ahead} ahead with ${left} split${left === 1 ? "" : "s"} left.`,
    color: PACE,
    ...(o.cover ? { thumbnail: { url: o.cover } } : {}),
    footer: { text: "Speedrun · GameShuffle" },
  };
}

/** Whether this split is the one that brings a run to a quarter left while it's ahead (one per run). */
export function paceMoment(st: RelayState): boolean {
  const n = st.segments.length;
  return st.last?.kind === "split" && st.index === Math.ceil(n * 0.75) && onPbPace(st);
}

const sentPace = new Set<string>();

/**
 * From the relay's webhook: a finished attempt that's a new PB (`closedNow`: this webhook closed it, so a repeat
 * doesn't post twice), or the split that puts a run on PB pace. Runs after the response, past the stream delay.
 */
export function speedrunDiscordAfter(o: { userId: string; game: string | null; category: string | null; delayS: number; event: string; st: RelayState; closedNow: boolean }): void {
  const pb = o.event === "finish" && o.closedNow && isNewPb({ ...o.st, phase: "ended" });
  const pace = o.event === "split" && paceMoment(o.st);
  if (!pb && !pace) return;
  if (pace) {
    const key = `${o.userId}:${o.st.attempt}`;
    if (sentPace.has(key)) return;
    sentPace.add(key);
    if (sentPace.size > 500) sentPace.delete(sentPace.values().next().value as string);
  }
  after(() => postSpeedrun({ ...o, kind: pb ? "pb" : "pace" }));
}

/** Sends one PB post or pace alert to every server that wants it (the webhook runs it after its response). */
export async function postSpeedrun(o: { kind: "pb" | "pace"; userId: string; game: string | null; category: string | null; delayS: number; st: RelayState }): Promise<number> {
  try {
    const r = await runner(o.userId);
    if (o.kind === "pace" && (!r.live || !r.twitch)) return 0; // "come watch" needs a stream to watch
    const list = await targets(r, o.kind === "pb" ? "pbs" : "pace");
    if (!list.length) return 0;
    if (o.delayS > 0) await wait(o.delayS * 1000);
    const game = gameShown(o.st.game ?? o.game);
    const category = o.st.category ?? o.category ?? "";
    const look = { name: r.name, game, category, st: o.st, cover: cover(o.st.game ?? o.game) };
    const watch = r.twitch ? `https://twitch.tv/${r.twitch}` : null;
    for (const t of list) {
      if (o.kind === "pb") await send(t, pbPostEmbed(look), watch ? { label: "Watch on Twitch", url: watch } : null, false);
      else await send(t, pacePostEmbed(look), { label: "Watch live", url: watch! }, true);
    }
    return list.length;
  } catch (e) {
    console.error("[speedrun] discord:", e);
    return 0;
  }
}

/** `/pb`: the runner's PB, sum of best and attempts, and the run going now if there is one. Null: no speedrun setup. */
export async function pbLookupEmbed(userId: string): Promise<{ embed: DiscordEmbed; watch: string | null } | null> {
  const db = createServiceClient();
  const { data } = await db.from("speedrun_setups").select("game, category, attempts, run, relay_id").eq("user_id", userId).maybeSingle();
  const setup = data as { game: string | null; category: string | null; attempts: number; run: RelaySegment[] | null; relay_id: string } | null;
  if (!setup) return null;
  const rs = await relayState(setup.relay_id).catch(() => null);
  const live = rs && rs.ok ? rs.state : null;
  const st: RelayState = live && live.segments.length ? live : idleState(setup.run ?? [], { game: setup.game, category: setup.category, attempt: setup.attempts });
  const r = await runner(userId);
  const pb = pbTime(st.segments);
  const sob = sumOfBest(st);
  const going = st.phase === "running" || st.phase === "paused";
  return {
    embed: {
      title: `${r.name} · ${runTitle(gameShown(st.game ?? setup.game), st.category ?? setup.category ?? "")}`,
      description: !st.segments.length ? "No splits yet." : going ? `Running now: attempt ${st.attempt.toLocaleString("en-US")}.` : pb == null ? "No finished run yet." : undefined,
      color: BLUE,
      fields: [
        { name: "PB", value: pb != null ? fmtClock(pb) : "None yet", inline: true },
        ...(sob != null ? [{ name: "Sum of best", value: fmtClock(sob), inline: true }] : []),
        { name: "Attempts", value: Math.max(0, going ? st.attempt - 1 : Math.max(setup.attempts, st.attempt)).toLocaleString("en-US"), inline: true },
      ],
      ...(cover(st.game ?? setup.game) ? { thumbnail: { url: cover(st.game ?? setup.game)! } } : {}),
      footer: { text: "Speedrun · gameshuffle.co/speedrun" },
    },
    watch: r.twitch && r.live ? `https://twitch.tv/${r.twitch}` : null,
  };
}

/** "14 attempts · best run 59:12.3, a new PB · 3 gold splits" (pure, for tests). Null when there were no attempts. */
export function speedrunTonightLine(attempts: { result: string; final_ms: number | null; pb: boolean; splits: (number | null)[] | null }[], best: RelaySegment[]): string | null {
  if (!attempts.length) return null;
  const finished = attempts.filter((a) => a.result === "finished" && a.final_ms != null);
  const fastest = finished.length ? Math.min(...finished.map((a) => a.final_ms!)) : null;
  const newPb = attempts.some((a) => a.pb);
  // Gold splits: a segment run tonight that matches the best segment as it stands now (the best only drops on a gold).
  const bestLen = segmentLengths(best.map((s) => s.bestMs)); // bestMs is the Best Segments comparison (cumulative)
  const golds = new Set<number>();
  for (const a of attempts) {
    segmentLengths(a.splits ?? []).forEach((len, i) => {
      const b = bestLen[i];
      if (len != null && b != null && len <= b + 50) golds.add(i);
    });
  }
  const parts = [
    `${attempts.length.toLocaleString("en-US")} attempt${attempts.length === 1 ? "" : "s"}`,
    fastest != null ? `best run ${fmtClock(fastest)}${newPb ? ", a new PB" : ""}` : "no finished runs",
    golds.size ? `${golds.size} gold split${golds.size === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** "Speedrun tonight" on the main bot's end-of-stream recap, or null when there were no attempts since `sinceIso`. */
export async function speedrunRecapField(ownerUserId: string, sinceIso: string): Promise<{ name: string; value: string; inline: boolean } | null> {
  const db = createServiceClient();
  const [{ data: rows, error }, { data: setup }] = await Promise.all([
    db.from("speedrun_attempts").select("result, final_ms, pb, splits").eq("user_id", ownerUserId).gte("started_at", sinceIso).neq("result", "running").limit(1000),
    db.from("speedrun_setups").select("run").eq("user_id", ownerUserId).maybeSingle(),
  ]);
  if (error) return null;
  const line = speedrunTonightLine((rows ?? []) as Parameters<typeof speedrunTonightLine>[0], ((setup as { run: RelaySegment[] | null } | null)?.run) ?? []);
  return line ? { name: "Speedrun tonight", value: line, inline: false } : null;
}
