/**
 * `/gs-tt` — Mario Kart time trials in Discord (free; picks 2026-10-29).
 *   add track time [class] [screenshot] [video]  → saves a time; a screenshot alone is read by Claude and
 *                                                 the player confirms (Add it / Cancel)
 *   track track [class] [board]                  → a track's top ten (this server's when it has times there)
 *   player [name] [game]                         → a player's bests
 * A new best is posted to the channel with Verify (Manage Server only), Report and the track's board.
 * Everything defers (lookups and saves can outrun Discord's 3 seconds); the add itself answers
 * privately, and only a new best goes public.
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { canManageGuild } from "../guildOwner";
import { SITE_URL } from "@/lib/seo";
import { createServiceClient } from "@/lib/supabase/admin";
import { discordActor, type TtActor } from "@/lib/timeTrials/players";
import { addTime, boardFor, findPlayers, noteGuildPlayer, playerBests, removeOwnTime, setVideo, timeById, ttReady, verifyTime, type AddTimeResult, type TtBest } from "@/lib/timeTrials/store";
import { readScreenshot, storeScreenshot, MAX_SCREENSHOT_BYTES } from "@/lib/timeTrials/read";
import { reportFromDiscord } from "@/lib/timeTrials/review";
import { categoryText, isVehicle, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import { formatGap, formatTime, ordinal, parseTime, videoProof, type ProofKind } from "@/lib/timeTrials/rules";
import { isClassFor, searchTracks, trackFromKey, trackKey, trackPath, ttTrack, ttTracks, TT_GAMES, type TtClass, type TtGame, type TtTrack } from "@/lib/timeTrials/tracks";
import { trackCode, trackTitle, tracksByCode } from "@/lib/timeTrials/codes";
import { playerPagePath } from "@/lib/timeTrials/playerPath";
import { botTokenFor } from "../apps";
import { appOfApplicationId, commandName } from "../appIds";
import { describePlayers } from "@/lib/daily/boards";
import { serverRecord } from "@/lib/timeTrials/server";
import { COMP_COLOR, panelFor, postToPanelChannel, refreshPanels } from "../ttPanel";
import { handleTtPanelCommand } from "./ttPanelActions";

/** The time trial command as typed in the app this interaction came from: /gs-tt in GameShuffle, /tt in GameShuffle Competitive. */
const ttCmd = (appId: string) => `/${commandName(appOfApplicationId(appId), "tt")}`;

export const TT_OK_PREFIX = "ttok:";
export const TT_NO_PREFIX = "ttno:";
export const TT_VERIFY_PREFIX = "ttv:";
export const TT_REPORT_PREFIX = "ttr:";
export const TT_UNDO_PREFIX = "ttu:";
/** "Add clip" on a top-ten time, and the form it opens (round 2). */
export const TT_CLIP_PREFIX = "ttclip:";
export const TT_CLIP_MODAL_PREFIX = "ttclipm:";

const COLOR = 0x2b52d6;
/** Where "Link to GameShuffle" goes, and the line beside it (picks 2026-10-29, 3A). */
export const LINK_URL = `${SITE_URL}/time-trials/link`;
export const LINK_LINE = "Link your GameShuffle account so these times sit with your site times and show on your profile.";
const EPHEMERAL = 64;
const FOOTER = { text: "Time trials · gameshuffle.co/time-trials" };
const UNDO_MINUTES = 15;

type Opt = { name: string; value?: string | number | boolean; focused?: boolean; options?: Opt[] };
export type Attachment = { url: string; content_type?: string; size: number; filename?: string };

const link = (label: string, url: string) => ({ type: 2, style: 5, label, url });
const btn = (label: string, customId: string, style: 1 | 2 | 3 | 4 = 2) => ({ type: 2, style, label, custom_id: customId });
const row = (...components: unknown[]) => ({ type: 1, components });
const reply = (data: Record<string, unknown>, ephemeral: boolean) =>
  Response.json({ type: 4, data: { ...data, allowed_mentions: { parse: [] }, ...(ephemeral ? { flags: EPHEMERAL } : {}) } });
const deferred = (ephemeral: boolean) => Response.json({ type: 5, data: ephemeral ? { flags: EPHEMERAL } : {} });

export async function editOriginal(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed_mentions: { parse: [] }, ...data }),
  }).catch(() => null);
  if (res && !res.ok) console.error("[tt] edit failed:", res.status, await res.text().catch(() => ""));
}
async function postFollowUp(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed_mentions: { parse: [] }, ...data }),
  }).catch(() => null);
  if (res && !res.ok) console.error("[tt] follow-up failed:", res.status, await res.text().catch(() => ""));
}

const guildNames = new Map<string, string | null>();
/** The server's name (for "Verified in …" and server boards), when the bot can see it. */
export async function guildName(guildId: string): Promise<string | null> {
  if (guildNames.has(guildId)) return guildNames.get(guildId) ?? null;
  const token = botTokenFor();
  let name: string | null = null;
  if (token) {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, { headers: { Authorization: `Bot ${token}` } }).catch(() => null);
    if (res?.ok) name = ((await res.json()) as { name?: string }).name ?? null;
  }
  if (!name) {
    const { data } = await createServiceClient().from("discord_guilds").select("guild_name").eq("guild_id", guildId).maybeSingle();
    name = (data as { guild_name?: string | null } | null)?.guild_name ?? null;
  }
  guildNames.set(guildId, name);
  return name;
}

function subOf(interaction: Record<string, unknown>): { name: string; opts: Opt[] } {
  const top = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? [])[0];
  return { name: top?.name ?? "", opts: top?.options ?? [] };
}
const optValue = (opts: Opt[], name: string) => opts.find((o) => o.name === name)?.value;

/** A picker choice: code, name, game ("rMMM · Wii Moo Moo Meadows · MK8DX"; picks 2026-10-30). */
function trackLabel(t: TtTrack): string {
  const c = trackCode(t);
  return `${c ? `${c} · ` : ""}${t.name} · ${TT_GAMES[t.game].short}`;
}
export function boardUrl(t: TtTrack, cc: TtClass, items: TtItems = "shrooms", vehicle: TtVehicle = "any"): string {
  return `${SITE_URL}${trackPath(t, cc, { items, vehicle })}`;
}
function classText(t: TtTrack, cc: TtClass): string {
  return TT_GAMES[t.game].classes.length > 1 ? ` (${cc}cc)` : "";
}

/** Autocomplete for `track`: both games; a typed code ("rdkj", "MKS") finds its track first, then names. */
export function ttAutocomplete(interaction: Record<string, unknown>): Response {
  const { opts } = subOf(interaction);
  const focused = opts.find((o) => o.focused);
  const q = String(focused?.value ?? "");
  const seen = new Set<string>();
  const found = [...tracksByCode(q), ...searchTracks(q, undefined, 25)].filter((t) => {
    const k = trackKey(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 25);
  const choices = found.map((t) => ({ name: trackLabel(t).slice(0, 100), value: trackKey(t) }));
  return Response.json({ type: 8, data: { choices } });
}

function resultLines(t: TtTrack, cc: TtClass, timeMs: number, res: Extract<AddTimeResult, { ok: true }>, items: TtItems = "shrooms", vehicle: TtVehicle = "any"): string[] {
  const lines = [`**${formatTime(timeMs)}** on ${trackTitle(t)}, ${categoryText(t.game, cc, items, vehicle, TT_GAMES[t.game].classes.length > 1)}.`];
  if (res.best && res.previousMs != null) lines.push(`New best, ${formatGap(res.previousMs - timeMs)} faster than before.`);
  else if (res.best) lines.push("Your first time on this track.");
  else if (res.previousMs != null) lines.push(`Your best is still ${formatTime(res.previousMs)}.`);
  const where = [`${ordinal(res.place)} of ${res.total} on GameShuffle`];
  if (res.server) where.unshift(`${ordinal(res.server.place)} of ${res.server.total} in this server`);
  lines.push(where.join(", ") + ".");
  return lines;
}

async function saveAndAnswer(args: {
  appId: string; token: string; actor: TtActor; guildId: string | null; track: TtTrack; cc: TtClass; timeMs: number;
  proof: ProofKind; proofUrl: string | null; readByAi: boolean; items: TtItems; vehicle: TtVehicle; clip: string | null;
  /** Added from the time trial panel: only a fallen server record is posted for everyone (pick 3A). */
  panel?: boolean;
}): Promise<void> {
  const { appId, token, actor, guildId, track, cc, timeMs } = args;
  // With a time trial panel in this server, a time that beats the server's record is posted in its channel.
  const panelRef = guildId ? await panelFor(guildId, track.game) : null;
  const prior = panelRef && guildId ? await serverRecord(guildId, track.game, track.id, cc, args.items) : null;
  const res = await addTime({
    player: actor.player, userId: actor.userId, identityId: actor.identityId, game: track.game, track: track.id, cc, items: args.items, vehicle: args.vehicle, timeMs,
    proof: args.proof, proofUrl: args.proofUrl, readByAi: args.readByAi, source: "discord", guildId,
  });
  if (!res.ok) {
    const why = res.error === "not_ready" ? "Time trials aren't open yet. Try again soon."
      : res.error === "faster_than_record" ? `That's faster than the world record on ${trackTitle(track)}. Check the time.`
      : "That time couldn't be saved. Try again in a moment.";
    await editOriginal(appId, token, { content: why, components: [] });
    return;
  }
  if (args.clip) await setVideo(actor.player, res.timeId, args.clip);
  // A Discord player without a GameShuffle account gets the Link button on this private reply (3A).
  const unlinked = !actor.userId;
  // A top-ten time shows as Unverified until a reviewer checks a clip of its last 30 seconds (round 2).
  const askClip = res.needsVideo && !args.clip;
  const clipLine = askClip ? "That's a top-ten time. It shows as Unverified until a reviewer checks a clip of the run's last 30 seconds: press Add clip."
    : args.clip ? "Your clip is in the review queue. The time shows as Verified once it's checked." : null;
  await editOriginal(appId, token, {
    content: [...resultLines(track, cc, timeMs, res, args.items, args.vehicle), ...(clipLine ? [clipLine] : []), ...(unlinked ? [LINK_LINE] : [])].join("\n"),
    components: [row(
      ...(askClip ? [btn("Add clip", `${TT_CLIP_PREFIX}${res.timeId}`, 1)] : []),
      btn("Undo", `${TT_UNDO_PREFIX}${res.timeId}`, 2),
      link("Track board", boardUrl(track, cc, args.items, args.vehicle)),
      ...(unlinked ? [link("Link to GameShuffle", LINK_URL)] : []),
    )],
  });
  let recordPosted = false;
  if (guildId && prior && timeMs < prior.timeMs && !res.again) {
    const was = prior.player === actor.player
      ? `Beat their own ${formatTime(prior.timeMs)}`
      : `Was ${formatTime(prior.timeMs)} by ${(await describePlayers([prior.player])).get(prior.player)?.name ?? "a player"}`;
    recordPosted = await postToPanelChannel(guildId, track.game, {
      embeds: [{
        title: `New server record on ${trackTitle(track)}`,
        description: [
          `**${actor.name}** · ${formatTime(timeMs)} · ${categoryText(track.game, cc, args.items, args.vehicle, TT_GAMES[track.game].classes.length > 1)}`,
          `${was}${args.vehicle === "any" ? ` · ${ordinal(res.place)} on GameShuffle` : ""}`,
        ].join("\n"),
        color: COMP_COLOR,
        ...(track.image ? { thumbnail: { url: track.image } } : {}),
        footer: FOOTER,
      }],
      components: [row(btn("Verify", `${TT_VERIFY_PREFIX}${res.timeId}`, 3), btn("Report", `${TT_REPORT_PREFIX}${res.timeId}`, 2), link("Full board", boardUrl(track, cc, args.items, "any")))],
    });
  }
  if (guildId) await refreshPanels(guildId, track.game).catch((err) => console.error("[tt panel] refresh failed:", err));
  if (res.best && !res.again && guildId && !args.panel && !recordPosted) {
    const fields = [
      ...(res.server ? [{ name: "This server", value: `${ordinal(res.server.place)} of ${res.server.total}`, inline: true }] : []),
      { name: "GameShuffle", value: `${ordinal(res.place)} of ${res.total}`, inline: true },
      ...(args.proof !== "none" ? [{ name: "Proof", value: args.proof === "video" ? "Video" : "Screenshot", inline: true }] : []),
    ];
    await postFollowUp(appId, token, {
      embeds: [{
        title: `New best on ${trackTitle(track)} · ${categoryText(track.game, cc, args.items, args.vehicle, TT_GAMES[track.game].classes.length > 1)}`,
        description: `${actor.name} · **${formatTime(timeMs)}**${res.previousMs != null ? `, ${formatGap(res.previousMs - timeMs)} faster than before` : ""}`,
        color: COLOR,
        fields,
        ...(track.image ? { thumbnail: { url: track.image } } : {}),
        ...(args.proof === "screenshot" && args.proofUrl ? { image: { url: args.proofUrl } } : {}),
        footer: FOOTER,
      }],
      components: [row(btn("Verify", `${TT_VERIFY_PREFIX}${res.timeId}`, 3), btn("Report", `${TT_REPORT_PREFIX}${res.timeId}`, 2), link("Track board", boardUrl(track, cc, args.items, args.vehicle)))],
    });
  }
}

export async function fetchAttachment(a: Attachment): Promise<Uint8Array | null> {
  let host = "";
  try { host = new URL(a.url).hostname; } catch { return null; }
  if (host !== "cdn.discordapp.com" && host !== "media.discordapp.net") return null;
  if (a.size > MAX_SCREENSHOT_BYTES || !/^image\/(png|jpe?g|webp)/.test(a.content_type ?? "")) return null;
  const res = await fetch(a.url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf.byteLength <= MAX_SCREENSHOT_BYTES ? buf : null;
}

export async function handleGsTt(interaction: Record<string, unknown>): Promise<Response> {
  const user = getDiscordUser(interaction);
  if (!user?.id) return reply({ content: "Couldn't tell who you are." }, true);
  const { name: sub, opts } = subOf(interaction);
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  const guildId = (interaction.guild_id as string | undefined) ?? null;

  if (sub === "panel") return handleTtPanelCommand(interaction, String(optValue(opts, "game") ?? ""));

  if (sub === "add") {
    const track = trackFromKey(String(optValue(opts, "track") ?? "")) ?? searchTracks(String(optValue(opts, "track") ?? ""), undefined, 1)[0] ?? null;
    if (!track) return reply({ content: "Pick a track from the list as you type." }, true);
    const ccRaw = Number(String(optValue(opts, "class") ?? "").replace(/cc$/, "")) || TT_GAMES[track.game].classes[0];
    if (!isClassFor(track.game, ccRaw)) return reply({ content: `${TT_GAMES[track.game].label} time trials are ${TT_GAMES[track.game].classes.map((c) => `${c}cc`).join(" or ")}.` }, true);
    const cc = ccRaw as TtClass;
    const timeText = String(optValue(opts, "time") ?? "").trim();
    const timeMs = timeText ? parseTime(timeText) : null;
    if (timeText && !timeMs) return reply({ content: `Couldn't read "${timeText.slice(0, 20)}" as a time. Type it like 1:52.384.` }, true);
    const videoText = String(optValue(opts, "video") ?? "").trim();
    const video = videoText ? videoProof(videoText) : null;
    if (videoText && !video) return reply({ content: "That video link isn't one we take. Use a YouTube, Twitch, Streamable or Medal link." }, true);
    const attachmentId = optValue(opts, "screenshot");
    const resolved = (interaction.data as { resolved?: { attachments?: Record<string, Attachment> } } | undefined)?.resolved;
    const attachment = attachmentId ? resolved?.attachments?.[String(attachmentId)] ?? null : null;
    if (!attachment) return reply({ content: "Attach a screenshot of the result: it's your proof for every time. Add the time too, or leave it out and I'll read it." }, true);
    const items: TtItems = optValue(opts, "items") === "none" ? "none" : "shrooms";
    const vehicleOpt = String(optValue(opts, "vehicle") ?? "any");
    const vehicle: TtVehicle = track.game === "mk8dx" && isVehicle(vehicleOpt) ? vehicleOpt : "any";

    after(async () => {
      try {
        if (!(await ttReady())) { await editOriginal(appId, token, { content: "Time trials aren't open yet. Try again soon." }); return; }
        const actor = await discordActor(user);
        if (guildId) await noteGuildPlayer(guildId, actor.player, await guildName(guildId));
        let readMs: number | null = null;
        const bytes = await fetchAttachment(attachment);
        if (!bytes) { await editOriginal(appId, token, { content: "That screenshot couldn't be opened. Use a PNG or JPEG under 8 MB." }); return; }
        const shot = await storeScreenshot(bytes, actor.player.slice(2));
        if (!shot) { await editOriginal(appId, token, { content: "That screenshot couldn't be saved. Try again in a moment." }); return; }
        const proof: ProofKind = "screenshot";
        const proofUrl: string = shot.url;
        {
          if (!timeMs) {
            const read = await readScreenshot({ jpeg: shot.jpeg, game: track.game, userId: actor.userId, capKey: `d:${user.id}` });
            if (!read.ok) {
              await editOriginal(appId, token, { content: read.error === "cap" ? `That's all the screenshots I can read for you today. Add the time yourself: ${ttCmd(appId)} add with time:` : `I couldn't read that screenshot. Add the time yourself: ${ttCmd(appId)} add with time:` });
              return;
            }
            if (read.read.notResult || !read.read.timeMs) {
              await editOriginal(appId, token, { content: read.read.notResult ? `That doesn't look like a time trial result. Add the time yourself: ${ttCmd(appId)} add with time:` : `I couldn't read every digit of the time. Add it yourself: ${ttCmd(appId)} add with time:` });
              return;
            }
            readMs = read.read.timeMs;
            const readCc = read.read.cc ?? cc;
            const { data: draft } = await createServiceClient().from("tt_drafts").insert({
              player: actor.player, discord_id: user.id, guild_id: guildId,
              payload: { game: track.game, track: track.id, cc: readCc, timeMs: readMs, proofUrl, name: actor.name, items, vehicle, clip: video },
            }).select("id").single();
            const draftId = (draft as { id: string } | null)?.id;
            if (!draftId) { await editOriginal(appId, token, { content: "Something went wrong saving that. Try again." }); return; }
            const otherTrack = read.read.trackId && read.read.trackId !== track.id ? ttTrack(read.read.game ?? track.game, read.read.trackId) : null;
            await editOriginal(appId, token, {
              content: [
                `From your screenshot: **${formatTime(readMs)}** on ${trackTitle(track)}${classText(track, readCc)}. Is that right?`,
                ...(otherTrack ? [`(The screenshot looks like ${trackTitle(otherTrack)}. If so, run ${ttCmd(appId)} add again with that track.)`] : []),
              ].join("\n"),
              components: [row(btn("Add it", `${TT_OK_PREFIX}${draftId}`, 3), btn("Cancel", `${TT_NO_PREFIX}${draftId}`, 2))],
            });
            return;
          }
        }
        await saveAndAnswer({ appId, token, actor, guildId, track, cc, timeMs: timeMs!, proof, proofUrl, readByAi: false, items, vehicle, clip: video });
      } catch (err) {
        console.error("[tt] add failed:", err);
        await editOriginal(appId, token, { content: "Something went wrong saving that. Try again." });
      }
    });
    return deferred(true);
  }

  if (sub === "track") {
    const track = trackFromKey(String(optValue(opts, "track") ?? "")) ?? searchTracks(String(optValue(opts, "track") ?? ""), undefined, 1)[0] ?? null;
    if (!track) return reply({ content: "Pick a track from the list as you type." }, true);
    const ccRaw = Number(String(optValue(opts, "class") ?? "").replace(/cc$/, "")) || TT_GAMES[track.game].classes[0];
    const cc = (isClassFor(track.game, ccRaw) ? ccRaw : TT_GAMES[track.game].classes[0]) as TtClass;
    const want = String(optValue(opts, "board") ?? "");
    const items: TtItems = optValue(opts, "items") === "none" ? "none" : "shrooms";
    const vOpt = String(optValue(opts, "vehicle") ?? "any");
    const vehicle: TtVehicle = track.game === "mk8dx" && isVehicle(vOpt) ? vOpt : "any";
    after(async () => {
      try {
        const actor = await discordActor(user);
        if (guildId) await noteGuildPlayer(guildId, actor.player, await guildName(guildId));
        let scope: "server" | "everyone" = want === "everyone" || !guildId ? "everyone" : "server";
        let board = await boardFor({ game: track.game, track: track.id, cc, items, vehicle, scope, viewer: actor.player, guildId, limit: 10 });
        if (scope === "server" && board.total < 2 && want !== "server") {
          scope = "everyone";
          board = await boardFor({ game: track.game, track: track.id, cc, items, vehicle, scope, viewer: actor.player, limit: 10 });
        }
        const lines = board.rows.map((r) => `${r.rank}. ${r.name} · **${formatTime(r.timeMs)}**${r.video === "checked" ? " · ✓ Verified" : ""}${r.verifiedIn.length ? " · vouched for here" : ""}`);
        if (board.mine) lines.push(`…\n${board.mine.rank}. ${board.mine.name} · **${formatTime(board.mine.timeMs)}**`);
        await editOriginal(appId, token, {
          embeds: [{
            title: `${trackTitle(track)} · ${categoryText(track.game, cc, items, vehicle, TT_GAMES[track.game].classes.length > 1)}`,
            description: lines.length ? lines.join("\n") : `No times yet. Be the first: ${ttCmd(appId)} add`,
            color: COLOR,
            ...(track.image ? { thumbnail: { url: track.image } } : {}),
            footer: { text: `${scope === "server" ? "This server" : "Everyone on GameShuffle"} · ${board.total} ${board.total === 1 ? "player" : "players"} · gameshuffle.co/time-trials` },
          }],
          components: [row(link("Full board", boardUrl(track, cc, items, vehicle)))],
        });
      } catch (err) {
        console.error("[tt] board failed:", err);
        await editOriginal(appId, token, { content: "That board couldn't load. Try again in a moment." });
      }
    });
    return deferred(false);
  }

  if (sub === "player") {
    const name = String(optValue(opts, "name") ?? "").trim().replace(/^@/, "").slice(0, 40);
    const gameOpt = String(optValue(opts, "game") ?? "");
    const game: TtGame | null = gameOpt === "mkworld" || gameOpt === "mk8dx" ? gameOpt : null;
    after(async () => {
      try {
        let player: string;
        let who: string;
        let profile: string | null = null;
        if (name) {
          const found = (await findPlayers(name, 1))[0];
          if (!found) { await editOriginal(appId, token, { content: `No one called "${name}" has a time yet.` }); return; }
          player = found.player; who = found.name; profile = found.profile;
        } else {
          const actor = await discordActor(user);
          player = actor.player; who = actor.name;
        }
        const all = (await playerBests(player as TtActor["player"])).filter((b) => b.items === "shrooms" && b.vehicle === "any");
        const msg = playerReply(who, all, game, player, profile);
        if (!msg) { await editOriginal(appId, token, { content: name ? `${who} has no times${game ? ` in ${TT_GAMES[game].label}` : ""} yet.` : `You have no times yet. Add one: ${ttCmd(appId)} add` }); return; }
        await editOriginal(appId, token, msg);
      } catch (err) {
        console.error("[tt] player failed:", err);
        await editOriginal(appId, token, { content: "That lookup couldn't load. Try again in a moment." });
      }
    });
    return deferred(false);
  }

  return reply({ content: `Use ${ttCmd(appId)} add, ${ttCmd(appId)} track or ${ttCmd(appId)} player.` }, true);
}

/**
 * The /gs-tt player reply (picks 2026-10-30): one game (the game option, else the one with the most
 * times), grouped by speed, a code per line, best places first; counts are tracks per speed out of the
 * game's own list. Null when there's nothing to show.
 */
export function playerReply(who: string, all: TtBest[], game: TtGame | null, player: string, profile: string | null): Record<string, unknown> | null {
  const counts = new Map<TtGame, number>();
  for (const b of all) counts.set(b.game, (counts.get(b.game) ?? 0) + 1);
  const g: TtGame | null = game ?? ([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
  const bests = g ? all.filter((b) => b.game === g) : [];
  if (!g || !bests.length) return null;
  const classes = TT_GAMES[g].classes;
  const per = classes.length > 1 ? 8 : 12;
  const total = ttTracks(g).length;
  const sections: string[] = [];
  const fields: { name: string; value: string; inline: boolean }[] = [];
  for (const cc of classes) {
    const rows = bests.filter((b) => b.cc === cc).sort((a, b) => a.place - b.place || a.timeMs - b.timeMs);
    if (!rows.length) continue;
    const lines = rows.slice(0, per).map((b) => {
      const t = ttTrack(b.game, b.track)!;
      return `\`${trackCode(t) ?? t.name}\` **${formatTime(b.timeMs)}** · ${ordinal(b.place)} of ${b.total}`;
    });
    if (rows.length > per) lines.push(`*and ${rows.length - per} more*`);
    sections.push(`${classes.length > 1 ? `**${cc}cc**\n` : ""}${lines.join("\n")}`);
    fields.push({ name: classes.length > 1 ? `${cc}cc` : "Tracks", value: `${new Set(rows.map((r) => r.track)).size} of ${total}`, inline: true });
  }
  fields.push({ name: "Records", value: String(bests.filter((b) => b.place === 1).length), inline: true });
  return {
    embeds: [{
      title: `${who}'s time trials · ${TT_GAMES[g].short}`,
      description: sections.join("\n\n"),
      color: COLOR,
      fields,
      footer: { text: "Mushrooms · gameshuffle.co/time-trials" },
    }],
    components: [row(link("All times", `${SITE_URL}${playerPagePath(player, profile)}?game=${g}`))],
  };
}

/** The "Add your clip" form: the link goes to the review queue (round 2). */
export async function handleTtClipModal(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const user = getDiscordUser(interaction);
  if (!user?.id) return reply({ content: "Couldn't tell who you are." }, true);
  const timeId = customId.slice(TT_CLIP_MODAL_PREFIX.length);
  const rows = ((interaction.data as { components?: { components?: { custom_id?: string; value?: string }[] }[] } | undefined)?.components ?? []);
  const raw = rows.flatMap((r) => r.components ?? []).find((c) => c.custom_id === "url")?.value ?? "";
  const url = videoProof(raw);
  if (!url) return reply({ content: "That link isn't one we take. Use a YouTube, Twitch, Streamable or Medal link." }, true);
  const actor = await discordActor(user);
  const ok = await setVideo(actor.player, timeId, url);
  return reply({ content: ok ? "Clip added. A reviewer will check it, and the time shows as Verified once it's done." : "That clip couldn't be added to this time." }, true);
}

/** The buttons on /gs-tt messages. */
export async function handleTtButton(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const user = getDiscordUser(interaction);
  if (!user?.id) return reply({ content: "Couldn't tell who you are." }, true);
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const db = createServiceClient();

  if (customId.startsWith(TT_OK_PREFIX) || customId.startsWith(TT_NO_PREFIX)) {
    const ok = customId.startsWith(TT_OK_PREFIX);
    const draftId = customId.slice(ok ? TT_OK_PREFIX.length : TT_NO_PREFIX.length);
    const { data } = await db.from("tt_drafts").select("player, discord_id, guild_id, payload, expires_at").eq("id", draftId).maybeSingle();
    const draft = data as { player: string; discord_id: string; guild_id: string | null; payload: { game: TtGame; track: string | null; cc: TtClass; timeMs: number | null; proofUrl: string | null; name: string; items?: TtItems; vehicle?: TtVehicle; clip?: string | null; via?: "panel"; read?: boolean }; expires_at: string } | null;
    if (!draft || draft.discord_id !== user.id) return reply({ content: "That isn't yours to confirm." }, true);
    const fromPanel = draft.payload.via === "panel";
    if (ok && (!draft.payload.track || !draft.payload.timeMs)) return reply({ content: "Pick the track and add the time first." }, true);
    await db.from("tt_drafts").delete().eq("id", draftId);
    if (!ok) return Response.json({ type: 7, data: { content: "Cancelled. Nothing was saved.", components: [] } });
    if (new Date(draft.expires_at).getTime() < Date.now()) return Response.json({ type: 7, data: { content: fromPanel ? "That waited too long. Press Add a time on the panel again." : `That waited too long. Run ${ttCmd(appId)} add again.`, components: [] } });
    const track = ttTrack(draft.payload.game, draft.payload.track!);
    if (!track) return Response.json({ type: 7, data: { content: "That track isn't on our list any more.", components: [] } });
    const timeMs = draft.payload.timeMs!;
    after(async () => {
      const actor = await discordActor(user);
      await saveAndAnswer({
        appId, token, actor, guildId: draft.guild_id, track, cc: draft.payload.cc, timeMs,
        proof: draft.payload.proofUrl ? "screenshot" : "none", proofUrl: draft.payload.proofUrl, readByAi: fromPanel ? draft.payload.read === true : true,
        items: draft.payload.items ?? "shrooms", vehicle: draft.payload.vehicle ?? "any", clip: draft.payload.clip ?? null,
        panel: fromPanel,
      });
    });
    return Response.json({ type: 6 });
  }

  const timeId = customId.slice(customId.indexOf(":") + 1);

  if (customId.startsWith(TT_CLIP_PREFIX)) {
    return Response.json({ type: 9, data: {
      custom_id: `${TT_CLIP_MODAL_PREFIX}${timeId}`,
      title: "Add your clip",
      components: [{ type: 1, components: [{ type: 4, custom_id: "url", label: "Clip of the run's last 30 seconds", style: 1, placeholder: "YouTube, Twitch, Streamable or Medal link", required: true, max_length: 300 }] }],
    } });
  }

  if (customId.startsWith(TT_UNDO_PREFIX)) {
    const t = await timeById(timeId);
    const actor = await discordActor(user);
    if (!t || t.player !== actor.player) return reply({ content: "That isn't your time." }, true);
    if (Date.now() - new Date(t.createdAt).getTime() > UNDO_MINUTES * 60_000) return reply({ content: "Too late to undo here. Remove it on gameshuffle.co/time-trials instead." }, true);
    const removed = await removeOwnTime(actor.player, timeId);
    return Response.json({ type: 7, data: { content: removed ? "Removed. That time isn't on any board." : "That time was already removed.", components: [] } });
  }

  if (customId.startsWith(TT_VERIFY_PREFIX)) {
    if (!guildId || !canManageGuild(interaction)) return reply({ content: "Only people who can manage this server can verify times." }, true);
    const name = await guildName(guildId);
    const ok = await verifyTime(timeId, guildId, name, user.id);
    return reply({ content: ok ? `Verified${name ? ` in ${name}` : ""}. It shows on the boards.` : "That time isn't there any more." }, true);
  }

  if (customId.startsWith(TT_REPORT_PREFIX)) {
    const ok = await reportFromDiscord(timeId, user.id);
    return reply({ content: ok ? "Reported. GameShuffle staff will take a look." : "That time isn't there any more." }, true);
  }

  return reply({ content: "Unknown button." }, true);
}
