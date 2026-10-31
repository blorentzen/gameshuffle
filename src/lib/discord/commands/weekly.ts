/**
 * The Weekly Challenge in Discord.
 *
 *   /gs-weekly          server managers post this week's card to the channel;
 *                       anyone else gets it just for them (ephemeral)
 *   Play                `weekly:play`. Survey week: a form with your own answer
 *                       and up to three optional guesses, filled with what you sent before.
 *                       Tier War week: a ranking message just for you
 *   form submit         `weeklym:{week}` → saveSurvey
 *   tier pick           `weeklyt:{week}:{item}:{ballot}` → the same message with
 *                       that pick. The ballot rides in the custom ids (one
 *                       character per item: 0-4 = S-D, "-" = not ranked yet), so
 *                       nothing is stored until Lock in
 *   Lock in             `weeklyts:{week}:{ballot}` → saveBallot
 *   Last week           `weekly:last` → last week's board and your score
 *
 * `{week}` is the week number, so a ranking started on Sunday can't land on
 * Monday's new items. Plays count on the GameShuffle account the Discord user
 * signs in with (users.discord_id), because weekly_entries is keyed by account;
 * without one, Play links to sign in with Discord. The ranking message uses
 * Components V2 (six selects plus buttons is more rows than a classic message
 * holds). Once the Discord Activity is live (DISCORD_ACTIVITY_LIVE), Play opens
 * the Activity on the Weekly instead.
 */

import { resolveDiscordUser } from "@/lib/discord/user";
import { addWeeks, revealAt, SURVEY_PREDICTIONS, weekNumber, weekOf } from "@/lib/originals/weekly";
import { personAnswer } from "@/lib/chatbrain/store";
import { after } from "next/server";
import { answeredNames, interactionName, noteAnswer, recordInteractionPost, weekTopic, type AnsweredHere } from "@/lib/discord/promptPosts";
import { TIERS } from "@/lib/originals/tierWars";
import {
  WeeklyNotReady, agendaCard, countEntries, ensureWeek, getEntry, getWeek, leaderboard, saveBallot, saveSurvey,
  type WeekRow,
} from "@/lib/weekly/store";
import type { DiscordEmbed } from "@/lib/adapters/discord/adapter";
import { ephemeralMessage } from "../respond";
import { activityLive, launchActivity } from "../activityLaunch";

export const WEEKLY_PLAY = "weekly:play";
export const WEEKLY_LAST = "weekly:last";
export const WEEKLY_MODAL_PREFIX = "weeklym:";
export const WEEKLY_TIER_PREFIX = "weeklyt:";
export const WEEKLY_LOCK_PREFIX = "weeklyts:";

const SITE = "https://www.gameshuffle.co";
const COLOR = 0x4f46e5;
const MANAGE_GUILD = BigInt(32);
const ADMINISTRATOR = BigInt(8);
const ZERO = BigInt(0);
const EPHEMERAL = 64;
const COMPONENTS_V2 = 32768;

interface DiscordUser { id: string; username?: string; global_name?: string | null }

function callerFrom(interaction: Record<string, unknown>): DiscordUser | null {
  const member = interaction.member as { user?: DiscordUser } | undefined;
  return member?.user ?? (interaction.user as DiscordUser | undefined) ?? null;
}

function canManage(interaction: Record<string, unknown>): boolean {
  const perms = (interaction.member as { permissions?: string } | undefined)?.permissions;
  if (!perms) return false;
  try {
    const bits = BigInt(perms);
    return (bits & MANAGE_GUILD) !== ZERO || (bits & ADMINISTRATOR) !== ZERO;
  } catch {
    return false;
  }
}

const siteLink = () => `${SITE}/weekly?src=discord`;
/** Discord renders `<t:…:R>` as "in 3 days" in each reader's own time. */
const revealStamp = (week: string) => `<t:${Math.floor(Date.parse(revealAt(week)) / 1000)}:R>`;

function reply(data: Record<string, unknown>, ephemeral: boolean): Response {
  return Response.json({ type: 4, data: { ...data, allowed_mentions: { parse: [] }, ...(ephemeral ? { flags: EPHEMERAL } : {}) } });
}

const linkButton = (label: string, url: string) => ({ type: 2, style: 5, label, url });

/** This week's card: what the challenge is, when it's revealed, and Play. The Monday post uses it too. */
export function weeklyCardMessage(week: WeekRow, opts: { players?: number; footerLine?: string | null; answered?: AnsweredHere | null } = {}): { embeds: DiscordEmbed[]; components: unknown[] } {
  const n = weekNumber(week.week_start);
  const agenda = agendaCard(week.agenda_card_id);
  const how = week.kind === "survey"
    ? `**${week.title}**\n\nGive your own answer and, if you like, guess the crowd's top three. Each guess that makes the board scores its points. The board is revealed ${revealStamp(week.week_start)}.`
    : `**Tier War: ${week.title}**\n\nRank all six from S to D: ${week.items.map((i) => i.label).join(", ")}. You score a point for each one you place where the crowd does. The crowd's ranking is revealed ${revealStamp(week.week_start)}.`;
  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (opts.players !== undefined) fields.push({ name: "Playing so far", value: String(opts.players), inline: true });
  if (opts.answered) fields.push({ name: `✅ ${opts.answered.count} ${week.kind === "survey" ? "answered" : "ranked"} here`, value: answeredNames(opts.answered).slice(0, 1024) });
  if (agenda) fields.push({ name: "Bonus at game nights", value: `${agenda.title}: ${agenda.text}`.slice(0, 1024) });
  return {
    embeds: [{
      title: `Weekly Challenge #${n}`,
      description: [how, opts.footerLine].filter(Boolean).join("\n\n"),
      url: siteLink(),
      color: COLOR,
      fields,
      footer: { text: "Weekly Challenge · a GameShuffle Original" },
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, label: "Play", custom_id: WEEKLY_PLAY },
        { type: 2, style: 2, label: "Last week", custom_id: WEEKLY_LAST },
        linkButton("Open on GameShuffle", siteLink()),
      ],
    }],
  };
}

/** The account a Discord user plays on, or a reply explaining how to get one. */
async function accountFor(user: DiscordUser): Promise<{ userId: string } | { response: Response }> {
  const who = await resolveDiscordUser(user.id, user.username ?? "");
  if (who.gsUserId) return { userId: who.gsUserId };
  return {
    response: reply({
      content: "The Weekly Challenge counts on your GameShuffle account, so your score lands on the leaderboard. Sign in to GameShuffle with Discord once, then tap **Play** here again. Already have an account? Connect Discord under Account › Profile › Connections.",
      components: [{ type: 1, components: [linkButton("Sign in with Discord", `${SITE}/login?redirect=${encodeURIComponent("/weekly")}`), linkButton("Connect Discord", `${SITE}/account?tab=profile`)] }],
    }, true),
  };
}

function notReady(err: unknown): Response | null {
  return err instanceof WeeklyNotReady ? ephemeralMessage("The Weekly Challenge isn't open yet. Check back soon.") : null;
}

export async function handleGsWeekly(interaction: Record<string, unknown>): Promise<Response> {
  const user = callerFrom(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  try {
    const thisWeek = weekOf();
    const [week, players] = await Promise.all([ensureWeek(thisWeek), countEntries(thisWeek)]);
    const isPublic = !!(interaction.guild_id && canManage(interaction));
    if (isPublic) after(async () => recordInteractionPost(interaction, { topic: await weekTopic(week), kind: "weekly", ref: week.week_start, payload: { showPlayers: true } }));
    return reply(weeklyCardMessage(week, { players }), !isPublic);
  } catch (err) {
    const r = notReady(err);
    if (r) return r;
    throw err;
  }
}

// ─── survey weeks ────────────────────────────────────────────────────────────

/** Play → the survey form, or the ranking message on a Tier War week. */
export async function handleWeeklyPlay(interaction: Record<string, unknown>): Promise<Response> {
  const user = callerFrom(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  if (activityLive()) return launchActivity(user.id, "weekly");
  try {
    const account = await accountFor(user);
    if ("response" in account) return account.response;
    const thisWeek = weekOf();
    const [week, mine] = await Promise.all([ensureWeek(thisWeek), getEntry(thisWeek, account.userId)]);
    if (week.status !== "open") return ephemeralMessage("This week's challenge just closed. The next one opens Monday.");
    if (week.kind !== "survey") {
      return Response.json({ type: 4, data: { ...tierMessage(week, ballotFrom(week, mine?.ballot ?? null)), flags: EPHEMERAL | COMPONENTS_V2 } });
    }
    // Labels cap at 45 characters and placeholders at 100, so a long question
    // rides in the placeholder (the card behind the form shows it in full).
    const q = week.title;
    const label = q.length <= 45 ? q : "Your own answer";
    const placeholder = q.length <= 45 ? "First thing that comes to mind" : q.length <= 100 ? q : `${q.slice(0, 99)}…`;
    const input = (id: string, l: string, p: string, value?: string | null, required = true) => ({
      type: 1,
      components: [{ type: 4, custom_id: id, style: 1, label: l, placeholder: p, ...(required ? { min_length: 1 } : {}), max_length: 40, required, ...(value ? { value } : {}) }],
    });
    const guesses = mine?.predictions ?? [];
    // The week's question is also a Chat Brain question: an answer given there fills in here.
    const brainAnswer = !mine?.answer && week.prompt_id ? (await personAnswer(week.prompt_id, { userId: account.userId }).catch(() => null))?.raw ?? null : null;
    return Response.json({
      type: 9,
      data: {
        custom_id: `${WEEKLY_MODAL_PREFIX}${weekNumber(thisWeek)}`,
        title: `Weekly Challenge #${weekNumber(thisWeek)}`,
        components: [
          input("answer", label, placeholder, mine?.answer ?? brainAnswer),
          ...Array.from({ length: SURVEY_PREDICTIONS }, (_, i) => input(`guess${i}`, `Guess a top answer (optional, ${i + 1} of ${SURVEY_PREDICTIONS})`, "What will most people say?", guesses[i], false)),
        ],
      },
    });
  } catch (err) {
    const r = notReady(err);
    if (r) return r;
    throw err;
  }
}

/** A text input's value from a modal submit (classic rows or newer label components). */
function modalValue(data: { components?: unknown[] }, id: string): string {
  for (const c of (data.components ?? []) as { components?: { custom_id?: string; value?: string }[]; component?: { custom_id?: string; value?: string } }[]) {
    for (const inner of [...(c.components ?? []), ...(c.component ? [c.component] : [])]) {
      if (inner.custom_id === id) return inner.value ?? "";
    }
  }
  return "";
}

/** Saved, or why not, with a button to change it and the site link. */
function afterSave(text: string): Response {
  return reply({
    content: text,
    components: [{ type: 1, components: [{ type: 2, style: 2, label: "Change", custom_id: WEEKLY_PLAY }, linkButton("Open on GameShuffle", siteLink())] }],
  }, true);
}

export async function handleWeeklyModalSubmit(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as { custom_id: string; components?: unknown[] };
  const user = callerFrom(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  const thisWeek = weekOf();
  if (data.custom_id.slice(WEEKLY_MODAL_PREFIX.length) !== String(weekNumber(thisWeek))) {
    return afterSave("A new week started while you were answering. Tap **Change** to play this week's.");
  }
  try {
    const account = await accountFor(user);
    if ("response" in account) return account.response;
    const guesses = Array.from({ length: SURVEY_PREDICTIONS }, (_, i) => modalValue(data, `guess${i}`));
    const r = await saveSurvey(account.userId, modalValue(data, "answer"), guesses);
    if (r.ok) {
      after(async () => noteAnswer({ guildId: interaction.guild_id as string | undefined, topic: await weekTopic(await ensureWeek(thisWeek)), person: `u:${account.userId}`, name: interactionName(interaction) }));
      const guessed = r.predictions.length ? ` Your guesses: **${r.predictions.join("**, **")}**.` : " No guesses this week (they're optional).";
      return afterSave(`Saved for this week. Your answer: **${r.answer}**.${guessed} The board is revealed ${revealStamp(thisWeek)}, and you can change these until then.`);
    }
    const why: Record<string, string> = {
      closed: "This week's challenge closed before your answers arrived. The next one opens Monday.",
      not_survey: "This week is a Tier War now. Tap **Change** to rank it.",
      bad_entry: "Give your own answer first. Tap **Change** to try again.",
      blocked: "One of those isn't allowed here. Tap **Change** to try different words.",
    };
    return afterSave(why[r.error] ?? "Couldn't save that. Try again in a moment.");
  } catch (err) {
    const r = notReady(err);
    if (r) return r;
    throw err;
  }
}

// ─── Tier War weeks ──────────────────────────────────────────────────────────

/** A ballot as one character per item: 0-4 for S-D, "-" for not ranked yet. */
function encode(week: WeekRow, ballot: Record<string, number>): string {
  return week.items.map((it) => (ballot[it.id] === undefined ? "-" : String(ballot[it.id]))).join("");
}

function decode(week: WeekRow, enc: string): Record<string, number> {
  const out: Record<string, number> = {};
  week.items.forEach((it, i) => {
    const t = Number(enc[i]);
    if (Number.isInteger(t) && t >= 0 && t < TIERS.length) out[it.id] = t;
  });
  return out;
}

function ballotFrom(week: WeekRow, saved: Record<string, number> | null): Record<string, number> {
  return saved ? decode(week, encode(week, saved)) : {};
}

/** The ranking message: a select per item (the pick shows as "Item: S") and Lock in once all six are ranked. */
function tierMessage(week: WeekRow, ballot: Record<string, number>, note?: string): { components: unknown[] } {
  const n = weekNumber(week.week_start);
  const enc = encode(week, ballot);
  const filled = week.items.filter((it) => ballot[it.id] !== undefined).length;
  const done = filled === week.items.length;
  return {
    components: [
      { type: 10, content: `### Weekly Challenge #${n}: ${week.title}\nRank each one from S to D. You score a point for each one you place where the crowd does. Revealed ${revealStamp(week.week_start)}.${note ? `\n\n${note}` : ""}` },
      ...week.items.map((it, i) => ({
        type: 1,
        components: [{
          type: 3,
          custom_id: `${WEEKLY_TIER_PREFIX}${n}:${i}:${enc}`,
          placeholder: `${it.label}: pick a tier`,
          options: TIERS.map((t, ti) => ({ label: `${it.label}: ${t}`.slice(0, 100), value: String(ti), default: ballot[it.id] === ti })),
        }],
      })),
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: done ? "Lock in" : `Lock in (${filled} of ${week.items.length} ranked)`, custom_id: `${WEEKLY_LOCK_PREFIX}${n}:${enc}`, disabled: !done },
          linkButton("Open on GameShuffle", siteLink()),
        ],
      },
    ],
  };
}

/** Swap the ranking message in place (it stays a Components V2 message). */
function updateV2(components: unknown[]): Response {
  return Response.json({ type: 7, data: { components, flags: COMPONENTS_V2 } });
}

function staleWeek(): Response {
  return updateV2([
    { type: 10, content: "A new week started while you were ranking. Tap **Play** for this week's challenge." },
    { type: 1, components: [{ type: 2, style: 1, label: "Play", custom_id: WEEKLY_PLAY }, linkButton("Open on GameShuffle", siteLink())] },
  ]);
}

/** A tier picked: redraw the message with it. Nothing is saved yet. */
export async function handleWeeklyTierPick(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as { custom_id: string; values?: string[] };
  const [num, idx, enc = ""] = data.custom_id.slice(WEEKLY_TIER_PREFIX.length).split(":");
  try {
    const thisWeek = weekOf();
    if (num !== String(weekNumber(thisWeek))) return staleWeek();
    const week = await ensureWeek(thisWeek);
    const item = week.items[Number(idx)];
    const tier = Number(data.values?.[0]);
    const ballot = decode(week, enc);
    if (item && Number.isInteger(tier) && tier >= 0 && tier < TIERS.length) ballot[item.id] = tier;
    return updateV2(tierMessage(week, ballot).components);
  } catch (err) {
    const r = notReady(err);
    if (r) return r;
    throw err;
  }
}

export async function handleWeeklyLock(interaction: Record<string, unknown>): Promise<Response> {
  const user = callerFrom(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  const [num, enc = ""] = (interaction.data as { custom_id: string }).custom_id.slice(WEEKLY_LOCK_PREFIX.length).split(":");
  try {
    const thisWeek = weekOf();
    if (num !== String(weekNumber(thisWeek))) return staleWeek();
    const account = await accountFor(user);
    if ("response" in account) return account.response;
    const week = await ensureWeek(thisWeek);
    const ballot = decode(week, enc);
    const r = await saveBallot(account.userId, ballot);
    if (!r.ok) {
      return updateV2(tierMessage(week, ballot, r.error === "closed" ? "This week's challenge just closed. The next one opens Monday." : "Rank all six, then lock in.").components);
    }
    after(async () => noteAnswer({ guildId: interaction.guild_id as string | undefined, topic: await weekTopic(week), person: `u:${account.userId}`, name: interactionName(interaction) }));
    const lines = week.items.map((it) => `**${TIERS[r.ballot[it.id]]}** ${it.label}`).join("\n");
    return updateV2([
      { type: 10, content: `### Locked in for Weekly Challenge #${weekNumber(thisWeek)}\n${lines}\n\nThe crowd's ranking is revealed ${revealStamp(thisWeek)}. You can change yours until then.` },
      { type: 1, components: [{ type: 2, style: 2, label: "Change", custom_id: WEEKLY_PLAY }, linkButton("Open on GameShuffle", siteLink())] },
    ]);
  } catch (err) {
    const r = notReady(err);
    if (r) return r;
    throw err;
  }
}

// ─── last week ───────────────────────────────────────────────────────────────

export async function handleWeeklyLast(interaction: Record<string, unknown>): Promise<Response> {
  const user = callerFrom(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't tell who you are. Try again.");
  try {
    const lastWeek = addWeeks(weekOf(), -1);
    const last = await getWeek(lastWeek);
    if (!last) return ephemeralMessage("There's no earlier week yet. This is the first one.");
    if (last.status !== "revealed") return ephemeralMessage("Last week's results are being counted. Try again in a minute.");
    const [top, who] = await Promise.all([leaderboard(lastWeek, 3), resolveDiscordUser(user.id, user.username ?? "")]);
    const mine = who.gsUserId ? await getEntry(lastWeek, who.gsUserId) : null;
    const result = last.kind === "survey"
      ? (last.board ?? []).map((a) => `${a.rank}. ${a.label} (${a.points})`).join("\n") || "No board this time."
      : TIERS.map((t, ti) => {
        const items = last.items.filter((it) => last.crowd?.[it.id] === ti).map((it) => it.label);
        return items.length ? `**${t}** ${items.join(", ")}` : null;
      }).filter(Boolean).join("\n");
    const fields: { name: string; value: string; inline?: boolean }[] = [];
    if (top.length) fields.push({ name: "Top players", value: top.map((p) => `${p.rank}. ${p.name} (${p.total})`).join("\n") });
    if (mine?.rank) fields.push({ name: "You", value: `#${mine.rank} with ${mine.total ?? 0} points`, inline: true });
    return reply({
      embeds: [{
        title: `Weekly Challenge #${weekNumber(lastWeek)}: ${last.title}`.slice(0, 256),
        description: `${last.kind === "survey" ? "**The board**" : "**The crowd's ranking**"}\n${result}\n\n${last.players} played.`,
        url: siteLink(),
        color: COLOR,
        fields,
      }],
      components: [{ type: 1, components: [{ type: 2, style: 1, label: "Play this week", custom_id: WEEKLY_PLAY }, linkButton("Open on GameShuffle", siteLink())] }],
    }, true);
  } catch (err) {
    const r = notReady(err);
    if (r) return r;
    throw err;
  }
}
