/**
 * /cans (GameShuffle Competitive; picks 2026-11-04, 11A to 18A, https://claude.ai/artifact/6yTPsw5wAEpUXRAcv74mXz).
 * A team leader posts one war time; players tap Can, Sub, Maybe or Can't on the post, which keeps count with names.
 * The time is typed in the captain's own time zone (asked once) and Discord shows it to each reader in theirs.
 * When it's full the captain is pinged; Lock lineup pings the players, and a reminder goes out 15 minutes before
 * (/api/cron/cans). Free, like the rest of GS Comp.
 *   /cans post time day? vs? size? team?
 *   /cans setup team tag? remove?     (people who can manage the server)
 *   /cans timezone zone               (autocomplete over every time zone)
 *   /cans hours                       (opens the War room's Cans tab: usual hours)
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { appOfApplicationId } from "../appIds";
import { canManageGuild } from "../guildOwner";
import {
  ANSWERS, DEFAULT_SIZE, MAX_SIZE, MIN_SIZE, TZ_CHOICES, discordTime, grouped, isAnswer, isCanDay, isFull, isTimeZone, lineupOf, parseTime, startFor,
  type CanDay, type CanRow,
} from "@/lib/cans/rules";
import {
  addTeam, answersFor, cancelCheck, cansReady, checkById, createCheck, lockCheck, removeTeam, rosterFor, setAnswer, setMessage, setZone, teamsFor, zoneFor, type CanCheck,
} from "@/lib/cans/store";

export const CANS_PREFIX = "cans:";

const EPHEMERAL = 64;
const say = (content: string, components: unknown[] = []) => Response.json({ type: 4, data: { content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });
const row = (...components: unknown[]) => ({ type: 1, components });

type Option = { name: string; value?: unknown; focused?: boolean; options?: Option[]; type?: number };
const subOf = (interaction: Record<string, unknown>) => (((interaction.data as { options?: Option[] } | undefined)?.options) ?? [])[0];

/** The name people see: the server nickname, else their display name. */
function whoIs(interaction: Record<string, unknown>): { id: string; name: string } | null {
  const user = getDiscordUser(interaction);
  if (!user?.id) return null;
  const nick = (interaction.member as { nick?: string | null } | undefined)?.nick;
  return { id: user.id, name: (nick || user.global_name || user.username || "Someone").slice(0, 32) };
}
const channelOf = (interaction: Record<string, unknown>) => (interaction.channel_id as string | undefined) ?? ((interaction.channel as { id?: string } | undefined)?.id ?? null);
const cleanVs = (v: unknown) => String(v ?? "").replace(/[|<>@#*_`~]/g, "").trim().slice(0, 12) || null;

// ── The post ────────────────────────────────────────────────────────────────

const COLOR = { open: 0xe8b923, full: 0x248046, locked: 0x3f5cff, cancelled: 0x6b7080 };
const list = (rows: CanRow[]) => (rows.length ? rows.map((r) => r.name).join(", ") : "Nobody yet").slice(0, 1024);

function titleOf(c: CanCheck): string {
  return `${c.teamTag ?? "War"}${c.vs ? ` vs ${c.vs}` : ""} · ${c.size}v${c.size}`;
}

/** The check's embed and buttons, from its answers and the team's known players. */
export function checkMessage(c: CanCheck, rows: CanRow[], roster: { userId: string; name: string }[]): { embeds: unknown[]; components: unknown[] } {
  const g = grouped(rows);
  const full = isFull(rows, c.size);
  const when = `${discordTime(c.startsAt, "F")}, ${discordTime(c.startsAt, "R")}`;
  const answered = new Set(rows.map((r) => r.userId));
  const waiting = roster.filter((p) => !answered.has(p.userId)).map((p) => p.name);
  const foot = [waiting.length ? `Not answered: ${waiting.slice(0, 12).join(", ")}${waiting.length > 12 ? ` and ${waiting.length - 12} more` : ""}` : null, "The time shows in your own time zone"].filter(Boolean).join(" · ");
  if (c.status === "locked" && c.lineup) {
    const name = (id: string) => rows.find((r) => r.userId === id)?.name ?? "A player";
    return {
      embeds: [{
        title: `${titleOf(c)} · Lineup locked`, color: COLOR.locked, description: when,
        fields: [
          { name: `Lineup (${c.lineup.players.length} of ${c.size})`, value: c.lineup.players.map(name).join(", ") || "Nobody", inline: false },
          ...(c.lineup.subs.length ? [{ name: "Subs", value: c.lineup.subs.map(name).join(", "), inline: false }] : []),
        ],
        footer: { text: "The time shows in your own time zone" },
      }],
      components: [row(btn("Open the War room", `${CANS_PREFIX}room`, 2))],
    };
  }
  if (c.status === "cancelled") {
    return { embeds: [{ title: `${titleOf(c)} · Called off`, color: COLOR.cancelled, description: when }], components: [] };
  }
  return {
    embeds: [{
      title: `${titleOf(c)}${full ? " · Full" : ""}`, color: full ? COLOR.full : COLOR.open, description: when,
      fields: [
        { name: `Can (${g.can.length} of ${c.size})`, value: list(g.can), inline: false },
        { name: `Sub (${g.sub.length})`, value: list(g.sub), inline: false },
        { name: `Maybe (${g.maybe.length})`, value: list(g.maybe), inline: false },
        { name: `Can't (${g.cant.length})`, value: list(g.cant), inline: false },
      ],
      footer: { text: foot.slice(0, 2048) },
    }],
    components: [
      row(...ANSWERS.map((a) => btn(a.label, `${CANS_PREFIX}a:${a.id}:${c.id}`, a.style))),
      row(btn("Lock lineup", `${CANS_PREFIX}lock:${c.id}`, 2), btn("Call it off", `${CANS_PREFIX}off:${c.id}`, 2), btn("Open the War room", `${CANS_PREFIX}room`, 2)),
    ],
  };
}

async function webhook(appId: string, token: string, method: "POST" | "PATCH" | "GET", path: string, body?: unknown): Promise<{ id?: string } | null> {
  const res = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as { id?: string } | null;
}

/** The post's opening line: the team role, pinged (16A), when there is one. */
const pingLine = (c: CanCheck) => (c.roleId ? `<@&${c.roleId}> war time` : "War time");

// ── /cans ──────────────────────────────────────────────────────────────────

interface PostArgs { time: string; day: CanDay; vs: string | null; size: number; roleId: string | null }

/** A packed post for the time zone question's menu (custom ids stop at 100 characters). */
const pack = (a: PostArgs) => [a.time.slice(0, 10), a.day, a.vs ?? "", a.size, a.roleId ?? ""].join("|");
function unpack(s: string): PostArgs | null {
  const [time, day, vs, size, roleId] = s.split("|");
  if (!time || !isCanDay(day)) return null;
  const n = Number(size);
  return { time, day, vs: vs || null, size: Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE ? n : DEFAULT_SIZE, roleId: roleId || null };
}

export async function handleCansCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("Cans come with GameShuffle Competitive.");
  const guildId = interaction.guild_id as string | undefined;
  const channelId = channelOf(interaction);
  const who = whoIs(interaction);
  if (!guildId || !channelId || !who) return say("Cans work in a server channel.");
  if (!(await cansReady())) return say("Cans aren't open yet. Try again soon.");
  const sub = subOf(interaction);
  const opt = (name: string) => sub?.options?.find((o) => o.name === name)?.value;

  if (sub?.name === "setup") {
    if (!canManageGuild(interaction)) return say("Only people who can manage this server can set up teams.");
    const roleId = String(opt("team") ?? "");
    if (!/^\d{5,25}$/.test(roleId)) return say("Pick the team's role.");
    if (opt("remove") === true) {
      await removeTeam(guildId, roleId);
      return say(`<@&${roleId}> isn't a cans team here any more.`);
    }
    const tag = cleanVs(opt("tag"));
    const ok = await addTeam(guildId, roleId, tag, who.id);
    if (!ok) return say("That didn't save. Try again in a moment.");
    const teams = await teamsFor(guildId);
    return say(`<@&${roleId}>${tag ? ` (${tag})` : ""} is set up. It's pinged when a can check goes up, and the check lists who hasn't answered.${teams.length > 1 ? ` With ${teams.length} teams here, pick one with team: when you post.` : ""}`);
  }

  if (sub?.name === "timezone") {
    const tz = String(opt("zone") ?? "");
    if (!isTimeZone(tz)) return say("Pick a time zone from the list as you type, like America/New_York.");
    await setZone(who.id, tz);
    const now = new Date().toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    return say(`Saved: ${tz} (it's ${now} there now). Times you type with /cans post are read in it.`);
  }

  if (sub?.name === "hours") {
    return say("Mark the hours you can usually race in the War room's Cans tab. Your captain sees the team's best times there.", [row(btn("Open the War room", `${CANS_PREFIX}room`, 1))]);
  }

  // post
  const time = String(opt("time") ?? "").trim();
  if (!parseTime(time)) return say("Type the time like 7pm, 7:30pm or 19:30.");
  const day: CanDay = isCanDay(opt("day")) ? (opt("day") as CanDay) : "today";
  const n = Number(opt("size") ?? DEFAULT_SIZE);
  const size = Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE ? n : DEFAULT_SIZE;
  const teams = await teamsFor(guildId);
  let roleId = typeof opt("team") === "string" ? String(opt("team")) : null;
  if (roleId && !teams.some((t) => t.roleId === roleId)) {
    if (!canManageGuild(interaction)) return say(`<@&${roleId}> isn't set up as a team here. Someone who manages the server can add it with /cans setup.`);
    await addTeam(guildId, roleId, null, who.id);
  }
  if (!roleId && teams.length === 1) roleId = teams[0].roleId;
  if (!roleId && teams.length > 1) return say(`This server has ${teams.length} teams: pick one with team: (${teams.map((t) => `<@&${t.roleId}>`).join(", ")}).`);
  const args: PostArgs = { time, day, vs: cleanVs(opt("vs")), size, roleId };

  const tz = await zoneFor(who.id);
  if (!tz) {
    // Asked once (15A): the menu carries the post, and the answer posts it.
    return Response.json({ type: 4, data: {
      flags: EPHEMERAL,
      content: `Which time zone is ${time} in? I'll remember it. (Not listed? Use /cans timezone.)`,
      components: [row({ type: 3, custom_id: `${CANS_PREFIX}tz:${pack(args)}`, placeholder: "Your time zone", options: TZ_CHOICES.map((z) => ({ label: z.label, value: z.value })) })],
    } });
  }
  return postCheck(interaction, args, tz, who, guildId, channelId, "reply");
}

/** Makes the check and posts it: as the reply to /cans post, or (after the time zone question) as a new message. */
async function postCheck(interaction: Record<string, unknown>, a: PostArgs, tz: string, who: { id: string; name: string }, guildId: string, channelId: string, as: "reply" | "followup"): Promise<Response> {
  const t = parseTime(a.time)!;
  const at = startFor(a.day, t, tz);
  if (at === "past") return say(`${a.time} has already gone today in your time zone (${tz}). Pick tomorrow or a day.`);
  const teams = await teamsFor(guildId);
  const tag = teams.find((x) => x.roleId === a.roleId)?.tag ?? null;
  const check = await createCheck({ guildId, channelId, roleId: a.roleId, teamTag: tag, vs: a.vs, size: a.size, startsAt: at, by: who.id, byName: who.name });
  if (!check) return say("The check couldn't be made. Try again in a moment.");
  const roster = await rosterFor(guildId, a.roleId, channelId);
  const body = { content: pingLine(check), ...checkMessage(check, [], roster), allowed_mentions: { roles: a.roleId ? [a.roleId] : [] } };
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  if (as === "reply") {
    after(async () => {
      const msg = await webhook(appId, token, "GET", "/messages/@original");
      if (msg?.id) await setMessage(check.id, msg.id);
    });
    return Response.json({ type: 4, data: body });
  }
  after(async () => {
    const msg = await webhook(appId, token, "POST", "", body);
    if (msg?.id) await setMessage(check.id, msg.id);
  });
  return Response.json({ type: 7, data: { content: `Saved your time zone: ${tz}. The check is posted.`, components: [] } });
}

// ── Buttons and the time zone menu ───────────────────────────────────────────

export async function handleCansComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const who = whoIs(interaction);
  const guildId = interaction.guild_id as string | undefined;
  const channelId = channelOf(interaction);
  if (!who || !guildId || !channelId) return say("That only works in a server channel.");
  const rest = customId.slice(CANS_PREFIX.length);

  if (rest === "room") return Response.json({ type: 12 });

  if (rest.startsWith("tz:")) {
    const args = unpack(rest.slice(3));
    const tz = ((interaction.data as { values?: string[] } | undefined)?.values ?? [])[0];
    if (!args || !isTimeZone(tz)) return say("That didn't work. Run /cans post again.");
    await setZone(who.id, tz);
    return postCheck(interaction, args, tz, who, guildId, channelId, "followup");
  }

  const [kind, a, b] = rest.split(":");
  const id = kind === "a" ? b : a;
  const check = id ? await checkById(id) : null;
  if (!check || check.guildId !== guildId) return say("That check isn't there any more.");
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");

  if (kind === "a") {
    if (!isAnswer(a)) return say("Unknown answer.");
    const res = await setAnswer(check, who.id, who.name, a);
    if (res === "closed") return say(check.status === "locked" ? "The lineup is locked. Ask the captain if you need in." : "This check was called off.");
    const roster = await rosterFor(guildId, check.roleId, channelId);
    if (res.full) {
      // Full (17A): the captain hears it, once.
      after(async () => {
        await webhook(appId, token, "POST", "", {
          content: `<@${check.createdBy}> ${titleOf(check)} is full: ${check.size} can. Press Lock lineup when you're ready.`,
          allowed_mentions: { users: [check.createdBy] },
        });
      });
    }
    return Response.json({ type: 7, data: { ...checkMessage(check, res.rows, roster), allowed_mentions: { parse: [] } } });
  }

  const captain = who.id === check.createdBy || canManageGuild(interaction);
  if (kind === "lock") {
    if (!captain) return say("Only the captain who posted it, or someone who manages the server, can lock the lineup.");
    if (check.status !== "open") return say("The lineup is already locked.");
    const rows = await answersFor(check.id);
    const l = lineupOf(rows, check.size);
    if (!l.players.length) return say("Nobody can yet, so there's no lineup to lock.");
    const locked = await lockCheck(check, { players: l.players.map((r) => r.userId), subs: l.subs.map((r) => r.userId) });
    if (!locked) return say("Someone locked it a moment ago.");
    const short = l.players.length < check.size ? ` (${l.players.length} of ${check.size})` : "";
    after(async () => {
      await webhook(appId, token, "POST", "", {
        content: `**Lineup for ${discordTime(check.startsAt, "t")}${check.vs ? ` vs ${check.vs}` : ""}**${short}\n${l.players.map((r) => `<@${r.userId}>`).join(" ")}${l.subs.length ? ` · sub ${l.subs.map((r) => `<@${r.userId}>`).join(" ")}` : ""}\nI'll ping you all 15 minutes before.`,
        allowed_mentions: { users: [...l.players, ...l.subs].map((r) => r.userId) },
      });
    });
    return Response.json({ type: 7, data: { ...checkMessage(locked, rows, []), allowed_mentions: { parse: [] } } });
  }

  if (kind === "off") {
    if (!captain) return say("Only the captain who posted it, or someone who manages the server, can call it off.");
    const off = await cancelCheck(check);
    if (!off) return say("It's already called off.");
    return Response.json({ type: 7, data: { ...checkMessage(off, [], []), allowed_mentions: { parse: [] } } });
  }

  return say("Unknown button.");
}

// ── Autocomplete: /cans timezone ──────────────────────────────────────────────

let ZONES: string[] | null = null;
function allZones(): string[] {
  if (!ZONES) {
    try { ZONES = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone"); } catch { ZONES = TZ_CHOICES.map((z) => z.value); }
  }
  return ZONES;
}

export function cansAutocomplete(interaction: Record<string, unknown>): Response {
  const sub = subOf(interaction);
  const focused = sub?.options?.find((o) => o.focused);
  const q = String(focused?.value ?? "").trim().toLowerCase();
  const labelled = TZ_CHOICES.filter((z) => !q || z.label.toLowerCase().includes(q) || z.value.toLowerCase().includes(q)).map((z) => ({ name: z.label, value: z.value }));
  const more = q ? allZones().filter((z) => z.toLowerCase().replace(/_/g, " ").includes(q.replace(/_/g, " ")) && !labelled.some((l) => l.value === z)).map((z) => ({ name: z.replace(/_/g, " "), value: z })) : [];
  return Response.json({ type: 8, data: { choices: [...labelled, ...more].slice(0, 25) } });
}
