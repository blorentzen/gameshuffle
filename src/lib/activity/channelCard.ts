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
 * Needs the GameShuffle bot in that server with permission to post there; if
 * it can't, the card is marked skipped for the day and play carries on.
 * One message per channel: the card row is claimed ("pending") before the
 * first post so two players finishing at once can't post twice.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { activityApp } from "@/lib/activity/discord";
import { MAX_GUESSES, answerFor, hintFor, puzzleFor, puzzleNumber } from "@/lib/originals/daily";
import { gsAddDays, gsDay } from "@/lib/time/gsClock";

const API = "https://discord.com/api/v10";
const COLOR = 0x2766ec;
const MAX_SHOWN = 12;
/** A post claimed longer ago than this is treated as abandoned. */
const PENDING_MS = 60_000;
/** Buttons on our posts that open the Activity on a game: `activity:daily` and friends. */
export const ACTIVITY_PLAY_PREFIX = "activity:";

interface Player { name: string; rows: string[]; finished: boolean; solved: boolean; guesses: number }

const square = (s: string) => (s === "match" ? "🟩" : s === "close" ? "🟨" : "⬛");

/** Everyone who played the day's Daily from this channel (their latest channel that day). */
async function playersIn(channelId: string, day: string): Promise<Player[]> {
  const admin = createServiceClient();
  const { data } = await admin.from("daily_identity_results").select("identity_id, guess_list, guesses, solved, finished_at")
    .eq("day", day).eq("channel_id", channelId).limit(200);
  const rows = (data ?? []) as { identity_id: string; guess_list: string[]; guesses: number | null; solved: boolean | null; finished_at: string | null }[];
  if (!rows.length) return [];
  const { data: ids } = await admin.from("gs_identities").select("id, display_name").in("id", rows.map((r) => r.identity_id));
  const names = new Map(((ids ?? []) as { id: string; display_name: string | null }[]).map((i) => [i.id, i.display_name]));
  const puzzle = puzzleFor(day);
  const answer = answerFor(day);
  const players = rows.map((r) => ({
    name: (names.get(r.identity_id) || "A player").slice(0, 60),
    rows: (r.guess_list ?? []).map((g) => hintFor(g, answer, puzzle)?.cells.map((c) => square(c.status)).join("") ?? "").filter(Boolean),
    finished: !!r.finished_at,
    solved: !!r.solved,
    guesses: r.guesses ?? (r.guess_list ?? []).length,
  }));
  // Solved first (fewest guesses), then still playing, then out of guesses.
  const rank = (p: Player) => (p.finished ? (p.solved ? 0 : 2) : 1);
  return players.sort((a, b) => rank(a) - rank(b) || a.guesses - b.guesses || a.name.localeCompare(b.name));
}

const playButtons = (labels: { daily: string; weekly?: string }) => [{
  type: 1,
  components: [
    { type: 2, style: 3, label: labels.daily, custom_id: `${ACTIVITY_PLAY_PREFIX}daily` },
    ...(labels.weekly ? [{ type: 2, style: 2, label: labels.weekly, custom_id: `${ACTIVITY_PLAY_PREFIX}weekly` }] : []),
  ],
}];

function cardMessage(day: string, players: Player[]) {
  const puzzle = puzzleFor(day);
  const shown = players.slice(0, MAX_SHOWN);
  const extra = players.length - shown.length;
  const score = (p: Player) => (p.finished ? `${p.solved ? p.guesses : "X"}/${MAX_GUESSES}` : "playing");
  return {
    embeds: [{
      title: `The Daily #${puzzleNumber(day)} · ${puzzle.game}`,
      description: `${players.length === 1 ? "1 player" : `${players.length} players`} here today. Squares only, no spoilers.`,
      color: COLOR,
      fields: shown.map((p) => ({ name: `${p.name} · ${score(p)}`.slice(0, 256), value: p.rows.join("\n").slice(0, 1024) || "Just started", inline: true })),
      footer: { text: extra > 0 ? `And ${extra} more · The Daily Shuffle on GameShuffle` : "The Daily Shuffle on GameShuffle" },
    }],
    components: playButtons({ daily: "Play the Daily" }),
    allowed_mentions: { parse: [] },
  };
}

async function discord(method: "POST" | "PATCH", path: string, body: unknown): Promise<{ ok: boolean; status: number; id?: string }> {
  const app = activityApp();
  if (!app?.botToken) return { ok: false, status: 0 };
  const res = await fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bot ${app.botToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, status: 0 };
  const j = (await res.json().catch(() => null)) as { id?: string } | null;
  return { ok: res.ok, status: res.status, id: j?.id };
}

/** Posts or updates the channel's card for the day. Best effort: failures never reach the player. */
export async function updateDailyCard(args: { channelId: string; guildId: string; day: string }): Promise<void> {
  if (!activityApp()?.botToken) return;
  const admin = createServiceClient();
  const key = { channel_id: args.channelId, day: args.day };
  await admin.from("discord_daily_cards").upsert({ ...key, guild_id: args.guildId, puzzle: puzzleFor(args.day).id }, { onConflict: "channel_id,day", ignoreDuplicates: true });
  const { data } = await admin.from("discord_daily_cards").select("message_id, skipped, updated_at").match(key).maybeSingle();
  const card = data as { message_id: string | null; skipped: boolean; updated_at: string } | null;
  if (!card || card.skipped) return;
  const players = await playersIn(args.channelId, args.day);
  if (!players.length) return;
  const message = cardMessage(args.day, players);

  const pending = card.message_id === "pending";
  if (card.message_id && !pending) {
    const r = await discord("PATCH", `/channels/${args.channelId}/messages/${card.message_id}`, message);
    if (r.ok || r.status !== 404) return; // a 429 or hiccup: the next guess updates it
    // Someone deleted the card: post a fresh one.
    await admin.from("discord_daily_cards").update({ message_id: null }).match(key).eq("message_id", card.message_id);
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

/** Consecutive days, ending `day`, on which someone in this channel solved the Daily. */
async function channelStreak(channelId: string, day: string): Promise<number> {
  const { data } = await createServiceClient().from("daily_identity_results").select("day")
    .eq("channel_id", channelId).eq("solved", true).gte("day", gsAddDays(day, -120)).lte("day", day).limit(5000);
  const days = new Set(((data ?? []) as { day: string }[]).map((r) => r.day));
  let n = 0;
  for (let d = day; days.has(d); d = gsAddDays(d, -1)) n += 1;
  return n;
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
  const { data } = await admin.from("discord_daily_cards").select("channel_id")
    .eq("day", yesterday).eq("skipped", false).is("summary_posted_at", null).not("message_id", "is", null).limit(1000);
  let posted = 0;
  for (const { channel_id: channelId } of (data ?? []) as { channel_id: string }[]) {
    const { data: claim } = await admin.from("discord_daily_cards").update({ summary_posted_at: new Date().toISOString() })
      .eq("channel_id", channelId).eq("day", yesterday).is("summary_posted_at", null).select("channel_id").maybeSingle();
    if (!claim) continue;
    const finished = (await playersIn(channelId, yesterday)).filter((p) => p.finished);
    if (!finished.length) continue;
    const medals = ["🥇", "🥈", "🥉"];
    const solved = finished.filter((p) => p.solved);
    const lines = [
      ...solved.map((p, i) => `${medals[i] ?? "•"} ${p.name} in ${p.guesses}`),
      ...finished.filter((p) => !p.solved).map((p) => `• ${p.name} ran out of guesses`),
    ];
    const streak = await channelStreak(channelId, yesterday);
    if (streak >= 2) lines.push("", `This channel has solved the Daily ${streak} days running.`);
    const r = await discord("POST", `/channels/${channelId}/messages`, {
      embeds: [{
        title: `Yesterday's Daily #${puzzleNumber(yesterday)} · ${puzzleFor(yesterday).game}`,
        description: lines.join("\n").slice(0, 4000),
        color: COLOR,
        footer: { text: `Today's Daily is ${puzzleFor(today).game}` },
      }],
      components: playButtons({ daily: "Play today's Daily", weekly: "Weekly" }),
      allowed_mentions: { parse: [] },
    });
    if (r.ok) posted += 1;
  }
  return posted;
}
