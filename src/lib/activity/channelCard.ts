/**
 * Wordle-style results in a Discord channel (server only).
 *
 * When people play the Daily in the Discord Activity from a server channel
 * (Discord-confirmed, see verifiedChannel), the bot keeps one message per
 * channel per Pacific day up to date: each player's rows as squares only, no
 * names of characters, so nothing is spoiled, and a "Play the Daily" button
 * that opens the Activity (LAUNCH_ACTIVITY via the `activity:` buttons). The
 * next morning a summary ranks yesterday and counts the channel's streak.
 *
 * Each daily keeps its own card in its own colors (Britton's pick,
 * 2026-10-16): the Daily Shuffle and the Daily Dex, keyed by the day's puzzle
 * (dailies-discord-m1 makes that the key; before it runs, only the first daily
 * played in a channel that day gets a card).
 *
 * Needs the GameShuffle bot in that server with permission to post there; if
 * it can't, the card is marked skipped for the day and play carries on.
 * One message per channel: the card row is claimed ("pending") before the
 * first post so two players finishing at once can't post twice.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { activityApp } from "@/lib/activity/discord";
import { CARD_MAX_FACES, renderDailyCard, renderPodium, vibe, type CardGame, type CardPlayer, type CellStatus } from "@/lib/discord/cards";
import { facesFor } from "@/lib/discord/faces";
import { DEX_PUZZLE_ID, SHUFFLE, answerFor, guessLimits, hintFor, playColumns, puzzleFor, puzzleLabel, puzzleNumber, type DailySchedule } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";
import { gsAddDays, gsDay } from "@/lib/time/gsClock";

const API = "https://discord.com/api/v10";
/** Each daily's accent, as on its share image and page header. */
const COLOR: Record<CardGame, number> = { shuffle: 0x5a3fd6, dex: 0xd9502a };
const TITLE: Record<CardGame, string> = { shuffle: "The Daily", dex: "The Daily Dex" };
/** The schedule a stored puzzle id belongs to. */
const gameOfPuzzle = (puzzle: string): DailySchedule => (puzzle === DEX_PUZZLE_ID ? DEX : SHUFFLE);
/** Rows for one daily: the Dex's own puzzle id, or every other for the Shuffle (a PostgREST filter). */
const gameFilter = (game: DailySchedule) => (game.id === "dex" ? `puzzle.eq.${DEX_PUZZLE_ID}` : `puzzle.neq.${DEX_PUZZLE_ID}`);
/** Discord's newer message layout (containers, media galleries, text displays). */
const COMPONENTS_V2 = 1 << 15;
/** A post claimed longer ago than this is treated as abandoned. */
const PENDING_MS = 60_000;
/** Buttons on our posts that open the Activity on a game: `activity:daily` and friends. */
export const ACTIVITY_PLAY_PREFIX = "activity:";

interface Player extends CardPlayer { identityId: string; finishedAt: string | null }

const cell = (s: string): CellStatus => (s === "match" ? "match" : s === "close" ? "close" : "miss");
/** Discord markdown in a name shouldn't format the line. */
const md = (s: string) => s.replace(/([\\*_~`|>])/g, "\\$1");

/** Days in a row each identity has solved, up to `day` (or the day before, if they haven't yet today). */
async function streaksFor(identityIds: string[], day: string, game: DailySchedule): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!identityIds.length) return out;
  const { data } = await createServiceClient().from("daily_identity_results").select("identity_id, day")
    .in("identity_id", identityIds).eq("solved", true).gte("day", gsAddDays(day, -90)).lte("day", day).or(gameFilter(game)).limit(5000);
  const days = new Map<string, Set<string>>();
  for (const r of (data ?? []) as { identity_id: string; day: string }[]) {
    if (!days.has(r.identity_id)) days.set(r.identity_id, new Set());
    days.get(r.identity_id)!.add(r.day);
  }
  for (const id of identityIds) {
    const set = days.get(id);
    if (!set) continue;
    let n = 0;
    for (let d = set.has(day) ? day : gsAddDays(day, -1); set.has(d); d = gsAddDays(d, -1)) n += 1;
    out.set(id, n);
  }
  return out;
}

/** Everyone who played the day's daily from this channel (their latest channel that day). */
async function playersIn(channelId: string, day: string, game: DailySchedule): Promise<Player[]> {
  const admin = createServiceClient();
  const { data } = await admin.from("daily_identity_results").select("identity_id, guess_list, guesses, solved, finished_at")
    .eq("day", day).eq("channel_id", channelId).eq("puzzle", puzzleFor(day, game).id).limit(200);
  const rows = (data ?? []) as { identity_id: string; guess_list: string[]; guesses: number | null; solved: boolean | null; finished_at: string | null }[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.identity_id);
  const [faces, streaks] = await Promise.all([facesFor(ids), streaksFor(ids, day, game)]);
  const puzzle = puzzleFor(day, game);
  const answer = answerFor(day, game);
  const players: Player[] = rows.map((r) => {
    const face = faces.get(r.identity_id);
    return {
      identityId: r.identity_id,
      name: face?.name || "A player",
      avatar: face?.avatar ?? null,
      rows: (r.guess_list ?? []).map((g) => hintFor(g, answer, puzzle)?.cells.map((c) => cell(c.status)) ?? []).filter((row) => row.length),
      finished: !!r.finished_at,
      finishedAt: r.finished_at,
      solved: !!r.solved,
      guesses: r.guesses ?? (r.guess_list ?? []).length,
      streak: streaks.get(r.identity_id) ?? 0,
    };
  });
  // Solved first (fewest guesses, then whoever finished first), then still playing, then out of guesses.
  const rank = (p: Player) => (p.finished ? (p.solved ? 0 : 2) : 1);
  return players.sort((a, b) => rank(a) - rank(b) || a.guesses - b.guesses
    || (a.finishedAt ?? "").localeCompare(b.finishedAt ?? "") || a.name.localeCompare(b.name));
}

const playButtons = (labels: { daily: string; game?: CardGame; weekly?: string }) => ({
  type: 1,
  components: [
    { type: 2, style: 3, label: labels.daily, custom_id: `${ACTIVITY_PLAY_PREFIX}${labels.game === "dex" ? "dex" : "daily"}` },
    ...(labels.weekly ? [{ type: 2, style: 2, label: labels.weekly, custom_id: `${ACTIVITY_PLAY_PREFIX}weekly` }] : []),
  ],
});

interface Outgoing { body: Record<string, unknown>; file?: { name: string; data: Buffer } }

/**
 * One container: the drawn card (when it rendered), a line of text and the
 * buttons. The picture's description says who played, for screen readers;
 * without a picture the text carries everything.
 */
function containerMessage(args: { game: CardGame; picture?: { data: Buffer; name: string; alt: string }; text: string; buttons: ReturnType<typeof playButtons> }): Outgoing {
  const pic = args.picture;
  return {
    body: {
      flags: COMPONENTS_V2,
      components: [{
        type: 17,
        accent_color: COLOR[args.game],
        components: [
          ...(pic ? [{ type: 12, items: [{ media: { url: `attachment://${pic.name}` }, description: pic.alt.slice(0, 1024) }] }] : []),
          { type: 10, content: args.text.slice(0, 3800) },
          args.buttons,
        ],
      }],
      // Listing only the new picture also removes the last one when a card is edited.
      attachments: pic ? [{ id: 0, filename: pic.name }] : [],
      allowed_mentions: { parse: [] },
    },
    file: pic ? { name: pic.name, data: pic.data } : undefined,
  };
}

/** How each player is doing, in words (the picture's description and the text-only fallback). */
function standings(players: Player[], main: number): string[] {
  return players.map((p) => `${p.name}: ${vibe(p, main)}`);
}

/** The line under today's card: who leads, and a nudge. */
function leadLine(players: Player[]): string {
  const best = players.find((p) => p.solved);
  if (!best) {
    const n = players.length;
    return `${n === 1 ? "1 player is" : `${n} players are`} on it. First to solve takes the lead.`;
  }
  if (best.guesses === 1) return `**${md(best.name)}** got it in 1. Nobody beats that today.`;
  return `**${md(best.name)}** leads with ${best.guesses}. Can anyone do it in ${best.guesses - 1}?`;
}

async function dailyCardMessage(channelId: string, day: string, players: Player[], schedule: DailySchedule): Promise<Outgoing> {
  const game: CardGame = schedule.id === "dex" ? "dex" : "shuffle";
  const puzzle = puzzleFor(day, schedule);
  const number = puzzleNumber(day, schedule);
  const channel = await channelName(channelId);
  const cols = Math.max(1, ...players.flatMap((p) => p.rows.map((r) => r.length)), playColumns(puzzle).length);
  const buttons = playButtons({ daily: game === "dex" ? "Play the Dex" : "Play the Daily", game });
  const { main, total } = guessLimits(puzzle);
  const label = puzzleLabel(puzzle);
  const lines = standings(players, main);
  try {
    const data = await renderDailyCard({ game, number, label, channel, max: main, total, cols, players });
    const shown = lines.slice(0, CARD_MAX_FACES);
    const more = lines.length - shown.length;
    const alt = `${TITLE[game]} #${number}${label ? `, ${label}` : ""}. ${shown.join(". ")}${more > 0 ? `. And ${more} more.` : "."}`;
    return containerMessage({ game, picture: { data, name: `${game === "dex" ? "dex" : "daily"}-${number}.png`, alt }, text: leadLine(players), buttons });
  } catch (err) {
    console.warn("[channelCard] card picture failed, sending text:", err);
    const text = [`**${TITLE[game]} #${number}**${label ? ` · ${label}` : ""}`, ...lines.slice(0, 20).map(md), "", leadLine(players)].join("\n");
    return containerMessage({ game, text, buttons });
  }
}

/** The channel's name for the card ("#12 in #game-night"); cached, null if the bot can't see it. */
const names = new Map<string, { at: number; name: string | null }>();
async function channelName(channelId: string): Promise<string | null> {
  const hit = names.get(channelId);
  if (hit && Date.now() - hit.at < 3600_000) return hit.name;
  const app = activityApp();
  if (!app?.botToken) return null;
  const res = await fetch(`${API}/channels/${channelId}`, { headers: { Authorization: `Bot ${app.botToken}` } }).catch(() => null);
  const j = res?.ok ? ((await res.json().catch(() => null)) as { name?: string } | null) : null;
  const name = j?.name ?? null;
  if (names.size > 500) names.clear();
  names.set(channelId, { at: Date.now(), name });
  return name;
}

async function discord(method: "POST" | "PATCH" | "DELETE", path: string, out?: Outgoing): Promise<{ ok: boolean; status: number; id?: string }> {
  const app = activityApp();
  if (!app?.botToken) return { ok: false, status: 0 };
  const headers: Record<string, string> = { Authorization: `Bot ${app.botToken}` };
  let body: BodyInit | undefined;
  if (out?.file) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(out.body));
    form.append("files[0]", new Blob([new Uint8Array(out.file.data)], { type: "image/png" }), out.file.name);
    body = form;
  } else if (out) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(out.body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body }).catch(() => null);
  if (!res) return { ok: false, status: 0 };
  const j = (await res.json().catch(() => null)) as { id?: string; message?: string; code?: number } | null;
  if (!res.ok && res.status !== 404 && res.status !== 429) console.warn(`[channelCard] Discord ${method} ${res.status}:`, j?.code, j?.message);
  return { ok: res.ok, status: res.status, id: j?.id };
}

/** Posts or updates the channel's card for the day. Best effort: failures never reach the player. */
export async function updateDailyCard(args: { channelId: string; guildId: string; day: string; game?: DailySchedule }): Promise<void> {
  if (!activityApp()?.botToken) return;
  const game = args.game ?? SHUFFLE;
  const admin = createServiceClient();
  const key = { channel_id: args.channelId, day: args.day, puzzle: puzzleFor(args.day, game).id };
  // A plain insert: a duplicate (23505) means the card exists. Before dailies-discord-m1 the key is
  // the channel and day only, so the other daily's card can hold it and this one finds no row below.
  const { error: insertError } = await admin.from("discord_daily_cards").insert({ ...key, guild_id: args.guildId });
  if (insertError && insertError.code !== "23505") console.warn("[channelCard] card row failed:", insertError.message);
  const { data } = await admin.from("discord_daily_cards").select("message_id, skipped, updated_at").match(key).maybeSingle();
  const card = data as { message_id: string | null; skipped: boolean; updated_at: string } | null;
  if (!card || card.skipped) return;
  const players = await playersIn(args.channelId, args.day, game);
  if (!players.length) return;
  const message = await dailyCardMessage(args.channelId, args.day, players, game);

  const pending = card.message_id === "pending";
  if (card.message_id && !pending) {
    const oldId = card.message_id;
    const r = await discord("PATCH", `/channels/${args.channelId}/messages/${oldId}`, message);
    if (r.ok || (r.status !== 404 && r.status !== 400)) return; // a 429 or hiccup: the next guess updates it
    if (r.status === 400) {
      // A card from before the drawn layout can't be edited into it: post the new one, then remove the old.
      const { data: mine } = await admin.from("discord_daily_cards").update({ message_id: "pending", updated_at: new Date().toISOString() })
        .match(key).eq("message_id", oldId).select("channel_id").maybeSingle();
      if (!mine) return;
      const fresh = await discord("POST", `/channels/${args.channelId}/messages`, message);
      await admin.from("discord_daily_cards").update({ message_id: fresh.ok && fresh.id ? fresh.id : oldId, updated_at: new Date().toISOString() }).match(key);
      if (fresh.ok) await discord("DELETE", `/channels/${args.channelId}/messages/${oldId}`);
      return;
    }
    // Someone deleted the card: post a fresh one.
    await admin.from("discord_daily_cards").update({ message_id: null }).match(key).eq("message_id", oldId);
  } else if (pending) {
    if (Date.now() - Date.parse(card.updated_at) < PENDING_MS) return; // another request is posting it right now
    // An abandoned claim (a crash mid-post): free it, then claim it like a new card.
    await admin.from("discord_daily_cards").update({ message_id: null }).match(key).eq("message_id", "pending")
      .lt("updated_at", new Date(Date.now() - PENDING_MS).toISOString());
  }

  // Only one request can turn null into "pending", so only one posts.
  const { data: claimed } = await admin.from("discord_daily_cards").update({ message_id: "pending", updated_at: new Date().toISOString() })
    .match(key).is("message_id", null).select("channel_id").maybeSingle();
  if (!claimed) return;
  const r = await discord("POST", `/channels/${args.channelId}/messages`, message);
  if (r.ok && r.id) {
    await admin.from("discord_daily_cards").update({ message_id: r.id, updated_at: new Date().toISOString() }).match(key);
  } else if (r.status === 403 || r.status === 404) {
    // The bot isn't in that server or can't post in that channel: stop trying today.
    await admin.from("discord_daily_cards").update({ message_id: null, skipped: true }).match(key);
  } else {
    await admin.from("discord_daily_cards").update({ message_id: null }).match(key);
  }
}

/** Consecutive days, ending `day`, on which someone in this channel solved that daily. */
async function channelStreak(channelId: string, day: string, game: DailySchedule): Promise<number> {
  const { data } = await createServiceClient().from("daily_identity_results").select("day")
    .eq("channel_id", channelId).eq("solved", true).gte("day", gsAddDays(day, -120)).lte("day", day).or(gameFilter(game)).limit(5000);
  const days = new Set(((data ?? []) as { day: string }[]).map((r) => r.day));
  let n = 0;
  for (let d = day; days.has(d); d = gsAddDays(d, -1)) n += 1;
  return n;
}

const listNames = (players: Player[], n: number) => {
  const shown = players.slice(0, n).map((p) => md(p.name));
  const more = players.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
};

/** The morning post: the podium picture (or a ranked list if it didn't render), then today's game. */
async function summaryMessage(args: { schedule: DailySchedule; channelId: string; yesterday: string; today: string; players: number; solved: Player[]; out: Player[]; streak: number }): Promise<Outgoing> {
  const s = args.schedule;
  const card: CardGame = s.id === "dex" ? "dex" : "shuffle";
  const number = puzzleNumber(args.yesterday, s);
  const game = puzzleLabel(puzzleFor(args.yesterday, s));
  const todayGame = puzzleLabel(puzzleFor(args.today, s));
  const { main } = guessLimits(puzzleFor(args.yesterday, s));
  const title = TITLE[card];
  // "in 3", or how a Last chance save reads.
  const how = (p: Player) => (p.guesses > main ? "on the last chance" : `in ${p.guesses}`);
  const buttons = playButtons({ daily: card === "dex" ? "Play today's Dex" : "Play today's Daily", game: card, weekly: "Weekly" });
  const rest = args.solved.slice(3);
  const tail = [
    rest.length ? `Also solved: ${rest.slice(0, 5).map((p) => `${md(p.name)} ${how(p)}`).join(", ")}${rest.length > 5 ? ` and ${rest.length - 5} more` : ""}.` : "",
    args.out.length ? `Out of guesses: ${listNames(args.out, 5)}.` : "",
    todayGame ? `Today it's **${todayGame}**.${args.streak >= 2 ? " Keep the streak going." : ""}` : args.streak >= 2 ? "Keep the streak going." : "",
  ].filter(Boolean).join("\n");

  if (args.solved.length) {
    try {
      const channel = await channelName(args.channelId);
      const data = await renderPodium({ game: card, number, label: game, channel, top: args.solved, played: args.players, solved: args.solved.length, streak: args.streak });
      const places = args.solved.slice(0, 3).map((p, i) => `${["First", "Second", "Third"][i]}: ${p.name} ${how(p)}`).join(". ");
      const alt = `Yesterday's ${title.replace(/^The /, "")} #${number}${game ? `, ${game}` : ""}. ${places}.${args.streak >= 2 ? ` This channel has solved it ${args.streak} days running.` : ""}`;
      return containerMessage({ game: card, picture: { data, name: `${card === "dex" ? "dex" : "daily"}-${number}-podium.png`, alt }, text: tail, buttons });
    } catch (err) {
      console.warn("[channelCard] podium picture failed, sending text:", err);
    }
  }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = [
    `**Yesterday's ${title.replace(/^The /, "")} #${number}**${game ? ` · ${game}` : ""}`,
    ...args.solved.slice(0, 10).map((p, i) => `${medals[i] ?? "•"} ${md(p.name)} ${how(p)}`),
    ...(args.solved.length ? [] : ["Nobody got it yesterday."]),
    ...(args.streak >= 2 ? [`This channel has solved the ${title.replace(/^The /, "")} ${args.streak} days running.`] : []),
    "",
    args.out.length ? `Out of guesses: ${listNames(args.out, 5)}.` : "",
    todayGame ? `Today it's **${todayGame}**.` : "",
  ].filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""));
  return containerMessage({ game: card, text: lines.join("\n"), buttons });
}

/**
 * Yesterday's summary for every channel that had a card: ranking and the
 * channel's streak, with buttons for today's Daily and the Weekly. Claimed per
 * card (summary_posted_at), so a retried run can't post twice. Returns how
 * many were posted.
 */
export async function postDailySummaries(today: string = gsDay()): Promise<number> {
  const yesterday = gsAddDays(today, -1);
  const admin = createServiceClient();
  const { data } = await admin.from("discord_daily_cards").select("channel_id, puzzle")
    .eq("day", yesterday).eq("skipped", false).is("summary_posted_at", null).not("message_id", "is", null).limit(1000);
  let posted = 0;
  // One summary per daily that had a card in the channel, the Daily Shuffle first.
  const cards = ((data ?? []) as { channel_id: string; puzzle: string }[]).sort((a, b) => Number(a.puzzle === DEX_PUZZLE_ID) - Number(b.puzzle === DEX_PUZZLE_ID));
  for (const { channel_id: channelId, puzzle } of cards) {
    const schedule = gameOfPuzzle(puzzle);
    const { data: claim } = await admin.from("discord_daily_cards").update({ summary_posted_at: new Date().toISOString() })
      .eq("channel_id", channelId).eq("day", yesterday).eq("puzzle", puzzle).is("summary_posted_at", null).select("channel_id").maybeSingle();
    if (!claim) continue;
    const finished = (await playersIn(channelId, yesterday, schedule)).filter((p) => p.finished);
    if (!finished.length) continue;
    const solved = finished.filter((p) => p.solved);
    const out = finished.filter((p) => !p.solved);
    const streak = await channelStreak(channelId, yesterday, schedule);
    const r = await discord("POST", `/channels/${channelId}/messages`, await summaryMessage({ schedule, channelId, yesterday, today, players: finished.length, solved, out, streak }));
    if (r.ok) posted += 1;
  }
  return posted;
}
