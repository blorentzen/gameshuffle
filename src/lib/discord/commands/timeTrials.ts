/**
 * `/gs-tt` — Mario Kart time trials in Discord (free; picks 2026-10-29).
 *   add track time [class] [screenshot] [video]  → saves a time; a screenshot alone is read by Claude and
 *                                                 the player confirms (Add it / Cancel)
 *   track track [class] [board]                  → a track's top ten (this server's when it has times there)
 *   player [name] [game]                         → a player's bests
 * A new best is posted to the channel with Verify (Manage Server only), Report and the track's board.
 * Everything defers (lookups and saves can outrun Discord's 3 seconds); the add itself answers
 * privately, and only a new best goes public. Every message with more than one fact is a card built in ../ttCards.ts
 * (picks 2026-11-12); a card changed in place stays a card.
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { canManageGuild } from "../guildOwner";
import { SITE_URL } from "@/lib/seo";
import { createServiceClient } from "@/lib/supabase/admin";
import { discordActor, type TtActor } from "@/lib/timeTrials/players";
import { addTime, attachShot, boardFor, findPlayers, noteGuildPlayer, playerBests, removeOwnTime, setVideo, timeById, ttReady, unprovenTime, verifyTime, type AddTimeResult, type TtBest } from "@/lib/timeTrials/store";
import { readScreenshot, storeScreenshot, MAX_SCREENSHOT_BYTES } from "@/lib/timeTrials/read";
import { reportFromDiscord } from "@/lib/timeTrials/review";
import { vehicleFor, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import type { TtParts } from "@/lib/timeTrials/parts";
import { COMMUNITY_VOUCHES, formatGap, formatTime, ordinal, parseTime, videoProof, type ProofKind } from "@/lib/timeTrials/rules";
import { lapsAgainst, recordLaps, setVouch } from "@/lib/timeTrials/detail";
import { rateLimit } from "@/lib/ratelimit";
import { vouchCounts } from "@/lib/timeTrials/status";
import { isClassFor, isTtGame, searchTracks, trackFromKey, trackKey, ttTrack, TT_GAMES, type TtClass, type TtGame, type TtTrack } from "@/lib/timeTrials/tracks";
import { trackCode, trackTitle, tracksByCode } from "@/lib/timeTrials/codes";
import { playerPagePath } from "@/lib/timeTrials/playerPath";
import { botTokenFor } from "../apps";
import { appOfApplicationId, commandName } from "../appIds";
import { describePlayers } from "@/lib/daily/boards";
import { serverRecord, type ServerTime } from "@/lib/timeTrials/server";
import { panelFor, postToPanelChannel, refreshPanels } from "../ttPanel";
import { handleTtPanelCommand } from "./ttPanelActions";
import {
  addReplyCard, boardCard, boardUrl, catText, checkCard, clipForm, countedCard, esc, flagEmoji, flagged, lapLines, lapsTitle, lineInPlace, lineMessage,
  modalParts, onCard, playerCard, recordPostCard, statusWord, EPHEMERAL, LINK_LINE, LINK_URL, V2, type BoardLine, type CheckDraft, type Message,
  TT_CLIP_MODAL_PREFIX, TT_CLIP_PREFIX, TT_EVENT_PREFIX, TT_NO_PREFIX, TT_OK_PREFIX, TT_REPORT_PREFIX, TT_UNDO_PREFIX, TT_VERIFY_PREFIX, TT_VOUCH_PREFIX,
} from "../ttCards";

// The custom ids, flag and link lines live with the cards (ttCards.ts); the handler and older imports read them here.
export { boardUrl, flagEmoji, LINK_LINE, LINK_URL, TT_CLIP_MODAL_PREFIX, TT_CLIP_PREFIX, TT_EVENT_PREFIX, TT_NO_PREFIX, TT_OK_PREFIX, TT_REPORT_PREFIX, TT_UNDO_PREFIX, TT_VERIFY_PREFIX, TT_VOUCH_PREFIX };
import { countryOf, isCountryCode, noteAsked, pickCountry, shouldAskCountry } from "@/lib/timeTrials/countries";
import { countryCodes } from "@/lib/lounge/flags";
import { countInEvent, eventsForBoardTimeAll } from "@/lib/tournaments/tt/countIn";
import { countryName } from "@/lib/lounge/countries";

const COUNTRY_CODES = countryCodes().filter((c) => /^[a-z]{2}$/.test(c));

/** Countries matching what's typed (name or code), for /tt country and /tt track's country option. */
function countryChoices(q: string, clear: boolean): { name: string; value: string }[] {
  const t = q.trim().toLowerCase();
  const list = COUNTRY_CODES.map((c) => ({ c, n: countryName(c) }))
    .filter(({ c, n }) => !t || c === t || n.toLowerCase().includes(t))
    .sort((a, b) => Number(b.c === t) - Number(a.c === t) || Number(b.n.toLowerCase().startsWith(t)) - Number(a.n.toLowerCase().startsWith(t)) || a.n.localeCompare(b.n))
    .slice(0, clear ? 24 : 25)
    .map(({ c, n }) => ({ name: `${n} (${c.toUpperCase()})`, value: c }));
  return clear && (!t || "clear my country".includes(t)) ? [{ name: "Clear my country", value: "none" }, ...list] : list;
}

/** The time trial command as typed in the app this interaction came from: /gs-tt in GameShuffle, /tt in GameShuffle Competitive. */
const ttCmd = (appId: string) => `/${commandName(appOfApplicationId(appId), "tt")}`;

const UNDO_MINUTES = 15;

type Opt = { name: string; value?: string | number | boolean; focused?: boolean; options?: Opt[] };
export type Attachment = { url: string; content_type?: string; size: number; filename?: string };

const reply = (data: Record<string, unknown>, ephemeral: boolean) => {
  const flags = (Number(data.flags) || 0) | (ephemeral ? EPHEMERAL : 0);
  return Response.json({ type: 4, data: { ...data, allowed_mentions: { parse: [] }, ...(flags ? { flags } : {}) } });
};
const deferred = (ephemeral: boolean) => Response.json({ type: 5, data: ephemeral ? { flags: EPHEMERAL } : {} });
/** A button that changes its own card later (type 6); on an older message (from before the cards) the answer goes in a
 *  new private message instead, since a message can't switch formats in place. */
export const deferInPlace = (interaction: Record<string, unknown>) => Response.json(onCard(interaction) ? { type: 6 } : { type: 5, data: { flags: EPHEMERAL } });

const WEBHOOKS = "https://discord.com/api/v10/webhooks";
let cardFallbackLogged = false;

/**
 * Fills a deferred reply, or changes the message a deferred button press came from. Not confirmed: whether Discord
 * lets a deferred reply become a card; if it refuses one, the card goes out as a follow-up instead and the empty
 * original is removed (logged once per server instance).
 */
export async function editOriginal(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${WEBHOOKS}/${appId}/${token}/messages/@original`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed_mentions: { parse: [] }, ...data }),
  }).catch(() => null);
  if (!res || res.ok) return;
  const why = await res.text().catch(() => "");
  if (res.status !== 400 || !((Number(data.flags) || 0) & V2)) { console.error("[tt] edit failed:", res.status, why); return; }
  if (!cardFallbackLogged) { cardFallbackLogged = true; console.warn("[tt] a card edit was refused; sending it as a follow-up:", why.slice(0, 300)); }
  await cardAsFollowUp(appId, token, data);
}

async function cardAsFollowUp(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  const original = await fetch(`${WEBHOOKS}/${appId}/${token}/messages/@original`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { id?: string; flags?: number } | null;
  // Unknown counts as private: the safe side for a reply nobody else should see.
  const ephemeral = ((original?.flags ?? EPHEMERAL) & EPHEMERAL) !== 0;
  const res = await fetch(`${WEBHOOKS}/${appId}/${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...data, flags: ((Number(data.flags) || 0) | (ephemeral ? EPHEMERAL : 0)) }),
  }).catch(() => null);
  if (!res?.ok) { console.error("[tt] card follow-up failed:", res?.status, await res?.text().catch(() => "")); return; }
  const sent = await res.json().catch(() => null) as { id?: string } | null;
  // The first follow-up can take the deferred message's place; only remove the original when it's still a separate one.
  if (original?.id && sent?.id && sent.id !== original.id) await fetch(`${WEBHOOKS}/${appId}/${token}/messages/@original`, { method: "DELETE" }).catch(() => null);
}

async function postFollowUp(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${WEBHOOKS}/${appId}/${token}`, {
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
function classText(t: TtTrack, cc: TtClass): string {
  return TT_GAMES[t.game].classes.length > 1 ? ` (${cc}cc)` : "";
}

/** Autocomplete for `track`: both games; a typed code ("rdkj", "MKS") finds its track first, then names. */
export function ttAutocomplete(interaction: Record<string, unknown>): Response {
  const { name: sub, opts } = subOf(interaction);
  const focused = opts.find((o) => o.focused);
  const q = String(focused?.value ?? "");
  if (focused?.name === "country") return Response.json({ type: 8, data: { choices: countryChoices(q, sub === "country") } });
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

/**
 * "New server record" in the server's time trial panel channel, when a new time beats the record that stood before
 * it (pick 3A: only a fallen record is posted for everyone). Shared by /tt and the War room's Time trials tab.
 * A gold card: the time as the heading, the screenshot full width, Verify on its own line for server managers.
 */
export async function postServerRecord(a: {
  guildId: string; actor: TtActor; track: TtTrack; cc: TtClass; items: TtItems; vehicle: TtVehicle; timeMs: number;
  prior: ServerTime; res: Extract<AddTimeResult, { ok: true }>;
  /** The result screenshot, shown full width as the proof. */
  proofUrl?: string | null;
}): Promise<boolean> {
  const { guildId, actor, track, cc, timeMs, prior, res } = a;
  if (timeMs >= prior.timeMs || res.again) return false;
  const was = prior.player === actor.player
    ? `Beat their own ${formatTime(prior.timeMs)}`
    : `Was ${formatTime(prior.timeMs)} by ${esc((await describePlayers([prior.player])).get(prior.player)?.name ?? "a player")}`;
  const [country, server] = await Promise.all([countryOf(actor.player).then((c) => c?.country ?? null), guildName(guildId)]);
  return postToPanelChannel(guildId, track.game, recordPostCard({
    kind: "record", track, category: catText(track.game, cc, a.items, a.vehicle),
    who: `${flagged(country)}${esc(actor.name)}`, timeMs,
    details: [was, ...(a.vehicle === "any" ? [`${ordinal(res.place)} on GameShuffle`] : [])],
    proofUrl: a.proofUrl ?? null, timeId: res.timeId,
    board: { label: "Full board", url: boardUrl(track, cc, a.items, "any") }, server,
  }));
}

async function saveAndAnswer(args: {
  appId: string; token: string; actor: TtActor; guildId: string | null; track: TtTrack; cc: TtClass; timeMs: number;
  proof: ProofKind; proofUrl: string | null; readByAi: boolean; items: TtItems; vehicle: TtVehicle; clip: string | null;
  /** Added from the time trial panel: only a fallen server record is posted for everyone (pick 3A). */
  panel?: boolean;
  /** Round 3: laps and what the screen showed (for the proof checks). */
  laps?: number[] | null; readMs?: number | null;
  /** The parts the screenshot named (kept with the time and checked against the board). */
  parts?: TtParts | null;
}): Promise<void> {
  const { appId, token, actor, guildId, track, cc, timeMs } = args;
  // With a time trial panel in this server, a time that beats the server's record is posted in its channel.
  const panelRef = guildId ? await panelFor(guildId, track.game) : null;
  const prior = panelRef && guildId ? await serverRecord(guildId, track.game, track.id, cc, args.items) : null;
  const res = await addTime({
    player: actor.player, userId: actor.userId, identityId: actor.identityId, game: track.game, track: track.id, cc, items: args.items, vehicle: args.vehicle, timeMs,
    proof: args.proof, proofUrl: args.proofUrl, readByAi: args.readByAi, source: "discord", guildId,
    laps: args.laps ?? null, readMs: args.readMs ?? null, readLaps: args.laps ?? null, parts: args.parts ?? null,
  });
  // The reply is a card from here on (it may be replacing the check, which is one), errors included.
  if (!res.ok) {
    const why = res.error === "not_ready" ? "Time trials aren't open yet. Try again soon."
      : res.error === "faster_than_record" ? `That's faster than the world record on ${trackTitle(track)}. Check the time.`
      : "That time couldn't be saved. Try again in a moment.";
    await editOriginal(appId, token, lineMessage(why));
    return;
  }
  if (args.clip) await setVideo(actor.player, res.timeId, args.clip);
  // A Discord player without a GameShuffle account gets the Link ask on this private reply (3A).
  const unlinked = !actor.userId;
  // A top-ten time shows as Unverified until a reviewer checks a clip of its last 30 seconds (round 2).
  const askClip = res.needsVideo && !args.clip;
  // A time trial event the player is in, open on this track and board: the bot asks whether to count it there too.
  const events = actor.userId && args.proof === "screenshot" && !res.again
    ? (await eventsForBoardTimeAll(actor.userId, { game: track.game, track: track.id, cc, items: args.items, vehicle: res.vehicle }).catch(() => [])).slice(0, 3)
    : [];
  // Splits in Discord (doc asks pick 4, 2026-11-10): each lap against the record's, when both have laps.
  const vs = res.best && args.laps?.length
    ? await lapsAgainst({ timeId: res.timeId, game: track.game, track: track.id, cc, items: args.items, board: args.vehicle, laps: args.laps }).catch(() => null)
    : null;
  const laps = vs && args.laps ? { title: lapsTitle(vs), lines: lapLines(args.laps, vs) } : null;
  // Asked once in Discord (round 4 pick 1A): a player with no country.
  const askCountry = await shouldAskCountry(actor.player, "discord");
  const category = catText(track.game, cc, args.items, args.vehicle);
  await editOriginal(appId, token, addReplyCard({
    track, category, timeMs, timeId: res.timeId, best: res.best, previousMs: res.previousMs, place: res.place, total: res.total, server: res.server,
    laps, askClip, clipSent: !!args.clip, events: events.map((e) => ({ id: e.id, title: e.title })),
    countryCmd: askCountry ? `${ttCmd(appId)} country` : null, unlinked, boardUrl: boardUrl(track, cc, args.items, args.vehicle),
  }));
  if (askCountry) await noteAsked(actor.player, "discord");
  const shot = args.proof === "screenshot" ? args.proofUrl : null;
  const recordPosted = guildId && prior ? await postServerRecord({ guildId, actor, track, cc, items: args.items, vehicle: args.vehicle, timeMs, prior, res, proofUrl: shot }) : false;
  if (guildId) await refreshPanels(guildId, track.game).catch((err) => console.error("[tt panel] refresh failed:", err));
  if (res.best && !res.again && guildId && !args.panel && !recordPosted) {
    await postFollowUp(appId, token, recordPostCard({
      kind: "best", track, category, who: esc(actor.name), timeMs,
      details: [
        res.previousMs != null ? `${formatGap(res.previousMs - timeMs)} faster than before` : "First time on this track",
        ...(res.server ? [`${ordinal(res.server.place)} of ${res.server.total} in this server`] : []),
        `${ordinal(res.place)} of ${res.total} on GameShuffle`,
      ],
      laps, proofUrl: shot, timeId: res.timeId,
      board: { label: "Track board", url: boardUrl(track, cc, args.items, args.vehicle) }, server: await guildName(guildId),
    }));
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
    if (videoText && !video) return reply({ content: "That video link isn't one we take. Use a link from YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram." }, true);
    const attachmentId = optValue(opts, "screenshot");
    const resolved = (interaction.data as { resolved?: { attachments?: Record<string, Attachment> } } | undefined)?.resolved;
    const attachment = attachmentId ? resolved?.attachments?.[String(attachmentId)] ?? null : null;
    if (!attachment) return reply({ content: "Attach a screenshot of the result: it's your proof for every time. Add the time too, or leave it out and I'll read it." }, true);
    const items: TtItems = optValue(opts, "items") === "none" ? "none" : "shrooms";
    const vehicleGiven = optValue(opts, "vehicle") != null;
    const vehicleOpt = String(optValue(opts, "vehicle") ?? "any");
    const vehicle: TtVehicle = vehicleFor(track.game, vehicleOpt);

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
            // The vehicle the screen names picks the board when the vehicle option was left out (picks 2026-11-04).
            const fromShot = !vehicleGiven && read.read.board && read.read.board !== "any" ? vehicleFor(track.game, read.read.board) : null;
            const useVehicle = fromShot ?? vehicle;
            // The screenshot looks like another track: a warning on the check, with Change track below it (pick 13).
            const otherTrack = read.read.trackId && read.read.trackId !== track.id ? ttTrack(read.read.game ?? track.game, read.read.trackId) : null;
            const payload: CheckDraft & Record<string, unknown> = {
              game: track.game, track: track.id, cc: readCc, timeMs: readMs, proofUrl, name: actor.name, items, vehicle: useVehicle, clip: video, readMs, laps: read.read.laps, parts: read.read.parts,
              shotTrack: otherTrack ? { game: otherTrack.game, id: otherTrack.id } : null,
            };
            const { data: draft } = await createServiceClient().from("tt_drafts").insert({ player: actor.player, discord_id: user.id, guild_id: guildId, payload }).select("id").single();
            const draftId = (draft as { id: string } | null)?.id;
            if (!draftId) { await editOriginal(appId, token, { content: "Something went wrong saving that. Try again." }); return; }
            // One check for /tt add and the panel: Add it, Change track, Change time, Cancel.
            await editOriginal(appId, token, checkCard(draftId, payload));
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

  if (sub === "proof") {
    // A screenshot for a time saved without one, like a Quaxly import (players' feedback, picks 2026-11-04, 21A).
    const track = trackFromKey(String(optValue(opts, "track") ?? "")) ?? searchTracks(String(optValue(opts, "track") ?? ""), undefined, 1)[0] ?? null;
    if (!track) return reply({ content: "Pick a track from the list as you type." }, true);
    const ccRaw = Number(String(optValue(opts, "class") ?? "").replace(/cc$/, "")) || TT_GAMES[track.game].classes[0];
    if (!isClassFor(track.game, ccRaw)) return reply({ content: `${TT_GAMES[track.game].label} time trials are ${TT_GAMES[track.game].classes.map((c) => `${c}cc`).join(" or ")}.` }, true);
    const cc = ccRaw as TtClass;
    const items: TtItems = optValue(opts, "items") === "none" ? "none" : "shrooms";
    const resolved = (interaction.data as { resolved?: { attachments?: Record<string, Attachment> } } | undefined)?.resolved;
    const attachmentId = optValue(opts, "screenshot");
    const attachment = attachmentId ? resolved?.attachments?.[String(attachmentId)] ?? null : null;
    if (!attachment) return reply({ content: "Attach the result screenshot." }, true);
    after(async () => {
      try {
        if (!(await ttReady())) { await editOriginal(appId, token, { content: "Time trials aren't open yet. Try again soon." }); return; }
        const actor = await discordActor(user);
        const time = await unprovenTime(actor.player, track.game, track.id, cc, items);
        if (!time) { await editOriginal(appId, token, { content: `You have no time without a screenshot on ${trackTitle(track)}${classText(track, cc)}. ${ttCmd(appId)} add saves a new one.` }); return; }
        const bytes = await fetchAttachment(attachment);
        if (!bytes) { await editOriginal(appId, token, { content: "That screenshot couldn't be opened. Use a PNG or JPEG under 8 MB." }); return; }
        const shot = await storeScreenshot(bytes, actor.player.slice(2));
        if (!shot) { await editOriginal(appId, token, { content: "That screenshot couldn't be saved. Try again in a moment." }); return; }
        const read = await readScreenshot({ jpeg: shot.jpeg, game: track.game, userId: actor.userId, capKey: `d:${user.id}` });
        const readMs = read.ok && !read.read.notResult ? read.read.timeMs ?? null : null;
        const res = await attachShot({ player: actor.player, timeId: time.id, proofUrl: shot.url, readMs });
        if (!res.ok) { await editOriginal(appId, token, { content: res.error === "has_proof" ? "That time has a screenshot already." : "The screenshot couldn't be added. Try again." }); return; }
        const where = `${trackTitle(track)}${classText(track, cc)}`;
        await editOriginal(appId, token, {
          content: res.matched ? `Screenshot added to your **${formatTime(time.timeMs)}** on ${where}.`
            : readMs != null ? `Screenshot added to your **${formatTime(time.timeMs)}** on ${where}. It reads ${formatTime(readMs)}, so an updater will check it.`
              : `Screenshot added to your **${formatTime(time.timeMs)}** on ${where}. I couldn't read the time off it, so an updater will check it.`,
        });
      } catch (err) {
        console.error("[tt] proof failed:", err);
        await editOriginal(appId, token, { content: "Something went wrong adding that. Try again." });
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
    const vehicle: TtVehicle = vehicleFor(track.game, vOpt);
    // A country (round 4 pick 4A): that country's players, everywhere (a server's players from one country is too few).
    const cOpt = String(optValue(opts, "country") ?? "").toLowerCase();
    const country = isCountryCode(cOpt) ? cOpt : null;
    after(async () => {
      try {
        const actor = await discordActor(user);
        if (guildId) await noteGuildPlayer(guildId, actor.player, await guildName(guildId));
        let scope: "server" | "everyone" = want === "everyone" || !guildId || country ? "everyone" : "server";
        let board = await boardFor({ game: track.game, track: track.id, cc, items, vehicle, scope, viewer: actor.player, guildId, limit: 10, country });
        if (scope === "server" && board.total < 2 && want !== "server") {
          scope = "everyone";
          board = await boardFor({ game: track.game, track: track.id, cc, items, vehicle, scope, viewer: actor.player, limit: 10 });
        }
        const line = (r: typeof board.rows[number]): BoardLine => ({ rank: r.rank, name: r.name, country: r.country, timeMs: r.timeMs, status: statusWord(r) });
        // Splits (doc asks pick 4): the record's laps under the board, when it has them.
        const rec = board.rows.length && !country ? await recordLaps({ game: track.game, track: track.id, cc, items, board: vehicle }).catch(() => null) : null;
        const full = boardUrl(track, cc, items, vehicle);
        await editOriginal(appId, token, boardCard({
          track, cc, items, vehicle, total: board.total,
          scopeLabel: country ? `Players from ${countryName(country)}` : scope === "server" ? "This server" : "Everyone on GameShuffle",
          rows: board.rows.map(line), mine: board.mine ? line(board.mine) : null,
          recordLaps: rec ? { name: rec.name, laps: rec.laps } : null,
          empty: `No times yet. Be the first: ${ttCmd(appId)} add`,
          fullUrl: `${full}${country ? `${full.includes("?") ? "&" : "?"}country=${country}` : ""}`,
        }));
      } catch (err) {
        console.error("[tt] board failed:", err);
        await editOriginal(appId, token, { content: "That board couldn't load. Try again in a moment." });
      }
    });
    return deferred(false);
  }

  if (sub === "country") {
    const raw = String(optValue(opts, "country") ?? "").trim().toLowerCase();
    after(async () => {
      try {
        const actor = await discordActor(user);
        if (!raw) {
          const have = (await countryOf(actor.player))?.country ?? null;
          await editOriginal(appId, token, { content: have
            ? `Your country: ${flagged(have)}${countryName(have)}. To change it, use ${ttCmd(appId)} country and pick another.`
            : `You don't have a country yet. Use ${ttCmd(appId)} country and pick one, so your times count on your country's records.` });
          return;
        }
        if (raw === "none") {
          const ok = await pickCountry(actor.player, null);
          await editOriginal(appId, token, { content: ok ? "Your country is cleared." : "That didn't save. Try again in a moment." });
          return;
        }
        const code = isCountryCode(raw) ? raw : COUNTRY_CODES.find((c) => countryName(c).toLowerCase() === raw) ?? null;
        if (!code) { await editOriginal(appId, token, { content: "Pick a country from the list as you type." }); return; }
        const ok = await pickCountry(actor.player, code);
        if (ok) await noteAsked(actor.player, "discord");
        await editOriginal(appId, token, { content: ok
          ? `Saved: ${flagged(code)}${countryName(code)}. Your times count on its records now${actor.userId ? ", and it's your GameShuffle account's country too" : ""}.`
          : "That didn't save. Try again in a moment." });
      } catch (err) {
        console.error("[tt] country failed:", err);
        await editOriginal(appId, token, { content: "That didn't save. Try again in a moment." });
      }
    });
    return deferred(true);
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

  return reply({ content: `Use ${ttCmd(appId)} add, ${ttCmd(appId)} track, ${ttCmd(appId)} player or ${ttCmd(appId)} country.` }, true);
}

/**
 * The /gs-tt player reply (picks 2026-10-30; a card since 2026-11-12): one game (the game option, else the one with
 * the most times), the totals at the top, a label per speed, a code per line, best places first; counts are tracks per
 * speed out of the game's own list. `mine`: My times on the panel (private, Post here first). Null when there's
 * nothing to show.
 */
export function playerReply(who: string, allGames: TtBest[], game: TtGame | null, player: string, profile: string | null, mine: { post: string; unlinked: boolean } | null = null): Message | null {
  // Discord's /tt is Mario Kart only: Kirby Air Riders times stay on the site.
  const all = allGames.filter((b) => isTtGame(b.game));
  const counts = new Map<TtGame, number>();
  for (const b of all) counts.set(b.game, (counts.get(b.game) ?? 0) + 1);
  const g: TtGame | null = game ?? ([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
  const bests = g ? all.filter((b) => b.game === g) : [];
  if (!g || !bests.length) return null;
  const classes = TT_GAMES[g].classes;
  const per = classes.length > 1 ? 8 : 12;
  const speeds: { cc: TtClass; lines: string[]; more: number; tracks: number }[] = [];
  for (const cc of classes) {
    const rows = bests.filter((b) => b.cc === cc).sort((a, b) => a.place - b.place || a.timeMs - b.timeMs);
    if (!rows.length) continue;
    const lines = rows.slice(0, per).map((b) => {
      const t = ttTrack(b.game, b.track)!;
      return `\`${trackCode(t) ?? t.name}\` **${formatTime(b.timeMs)}** · ${ordinal(b.place)} of ${b.total}`;
    });
    speeds.push({ cc, lines, more: Math.max(0, rows.length - per), tracks: new Set(rows.map((r) => r.track)).size });
  }
  return playerCard({
    who, game: g, speeds, records: bests.filter((b) => b.place === 1).length,
    allUrl: `${SITE_URL}${playerPagePath(player, profile)}?game=${g}`, mine,
  });
}

/** The "Add your clip" form: the link goes to the review queue (round 2). */
export async function handleTtClipModal(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const user = getDiscordUser(interaction);
  if (!user?.id) return reply({ content: "Couldn't tell who you are." }, true);
  const timeId = customId.slice(TT_CLIP_MODAL_PREFIX.length);
  // Either form style: the labeled one (since 2026-11-12) or the older rows of inputs still open on someone's screen.
  const raw = String(modalParts(interaction).get("url")?.value ?? "");
  const url = videoProof(raw);
  if (!url) return reply({ content: "That link isn't one we take. Use a link from YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram." }, true);
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
    const draft = data as { player: string; discord_id: string; guild_id: string | null; payload: { game: TtGame; track: string | null; cc: TtClass; timeMs: number | null; proofUrl: string | null; name: string; items?: TtItems; vehicle?: TtVehicle; parts?: TtParts | null; clip?: string | null; via?: "panel"; read?: boolean; readMs?: number | null; laps?: number[] | null }; expires_at: string } | null;
    if (!draft || draft.discord_id !== user.id) return reply({ content: "That isn't yours to confirm." }, true);
    const fromPanel = draft.payload.via === "panel";
    if (ok && (!draft.payload.track || !draft.payload.timeMs)) return reply({ content: "Pick the track and add the time first." }, true);
    await db.from("tt_drafts").delete().eq("id", draftId);
    // The check is a card, so its one-line answers are too (an older plain check gets plain lines).
    if (!ok) return Response.json({ type: 7, data: lineInPlace(interaction, "Cancelled. Nothing was saved.") });
    if (new Date(draft.expires_at).getTime() < Date.now()) return Response.json({ type: 7, data: lineInPlace(interaction, fromPanel ? "That waited too long. Press Add a time on the panel again." : `That waited too long. Run ${ttCmd(appId)} add again.`) });
    const track = ttTrack(draft.payload.game, draft.payload.track!);
    if (!track) return Response.json({ type: 7, data: lineInPlace(interaction, "That track isn't on our list any more.") });
    const timeMs = draft.payload.timeMs!;
    after(async () => {
      const actor = await discordActor(user);
      await saveAndAnswer({
        appId, token, actor, guildId: draft.guild_id, track, cc: draft.payload.cc, timeMs,
        // Read by AI unless the time was typed: the panel says which; /tt add's read is AI's until Change time sets read false.
        proof: draft.payload.proofUrl ? "screenshot" : "none", proofUrl: draft.payload.proofUrl, readByAi: draft.payload.read ?? !fromPanel,
        items: draft.payload.items ?? "shrooms", vehicle: draft.payload.vehicle ?? "any", clip: draft.payload.clip ?? null,
        panel: fromPanel, laps: draft.payload.laps ?? null, readMs: draft.payload.readMs ?? null, parts: draft.payload.parts ?? null,
      });
    });
    return deferInPlace(interaction);
  }

  if (customId.startsWith(TT_EVENT_PREFIX)) {
    const [timeId, eventId] = customId.slice(TT_EVENT_PREFIX.length).split(":");
    after(async () => {
      const actor = await discordActor(user);
      if (!actor.userId) { await editOriginal(appId, token, { content: "Link your GameShuffle account first: events count times for accounts." }); return; }
      const r = await countInEvent(eventId, actor.userId, timeId);
      if (!r.ok) { await editOriginal(appId, token, { content: r.message }); return; }
      const t = ttTrack(r.game, r.track);
      const detail = r.kind === "match"
        ? r.settled ? (r.won > r.lost ? `You won the match, ${r.won} to ${r.lost} in tracks.` : `You lost the match, ${r.won} to ${r.lost} in tracks.`) : r.held ? `${r.won > r.lost ? "You won" : "You lost"} ${r.won} to ${r.lost} in tracks. It counts once the clips are checked.` : r.won > r.lost ? `You lead ${r.won} to ${r.lost} in tracks.` : r.won < r.lost ? `You trail ${r.won} to ${r.lost} in tracks.` : `Level at ${r.won} to ${r.lost} in tracks.`
        : r.runoff ? "As your run-off time." : `${ordinal(r.place)} of ${r.total} on ${t ? trackTitle(t) : "this track"} so far.`;
      const clipAsk = !r.needsClip ? null : r.kind === "event"
        ? "The organizer asks for a clip of this run's last 30 seconds before the results are final: add it on the event page."
        : "The organizer asks for a clip of this run's last 30 seconds before your match counts: add it on the tournament page.";
      await editOriginal(appId, token, countedCard({ title: r.title, detail, clipAsk, eventUrl: `${SITE_URL}/tournament/${eventId}` }));
    });
    return Response.json({ type: 5, data: { flags: 64 } });
  }

  const timeId = customId.slice(customId.indexOf(":") + 1);

  if (customId.startsWith(TT_CLIP_PREFIX)) {
    return Response.json({ type: 9, data: clipForm(timeId) });
  }

  if (customId.startsWith(TT_UNDO_PREFIX)) {
    const t = await timeById(timeId);
    const actor = await discordActor(user);
    if (!t || t.player !== actor.player) return reply({ content: "That isn't your time." }, true);
    if (Date.now() - new Date(t.createdAt).getTime() > UNDO_MINUTES * 60_000) return reply({ content: "Too late to undo here. Remove it on gameshuffle.co/time-trials instead." }, true);
    const removed = await removeOwnTime(actor.player, timeId);
    return Response.json({ type: 7, data: lineInPlace(interaction, removed ? "Removed. That time isn't on any board." : "That time was already removed.") });
  }

  if (customId.startsWith(TT_VERIFY_PREFIX)) {
    if (!guildId || !canManageGuild(interaction)) return reply({ content: "Only people who can manage this server can verify times." }, true);
    const name = await guildName(guildId);
    const ok = await verifyTime(timeId, guildId, name, user.id);
    return reply({ content: ok ? `Verified${name ? ` in ${name}` : ""}. It shows on the boards.` : "That time isn't there any more." }, true);
  }

  if (customId.startsWith(TT_VOUCH_PREFIX)) {
    const actor = await discordActor(user);
    if (!(await rateLimit(`tt-vouch:${actor.player}`, { max: 60, windowMs: 60 * 60_000 })).ok) return reply({ content: "That's a lot of vouches. Try again later." }, true);
    const res = await setVouch(timeId, actor.player, true);
    if (res === "own") return reply({ content: "That's your own time." }, true);
    if (res !== "ok") return reply({ content: res === "gone" ? "That time isn't on the board any more." : "Vouching isn't open yet. Try again soon." }, true);
    const n = (await vouchCounts([timeId])).get(timeId) ?? 0;
    const left = COMMUNITY_VOUCHES - n;
    return reply({ content: `Vouched. ${n} ${n === 1 ? "player has" : "players have"} vouched for this time${left > 0 ? `; ${left} more and it's Community verified.` : ", so it's Community verified."}` }, true);
  }

  if (customId.startsWith(TT_REPORT_PREFIX)) {
    const ok = await reportFromDiscord(timeId, user.id);
    return reply({ content: ok ? "Reported. GameShuffle staff will take a look." : "That time isn't there any more." }, true);
  }

  return reply({ content: "Unknown button." }, true);
}
