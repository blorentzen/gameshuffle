/**
 * GameShuffle Competitive's time trial messages as cards (picks 2026-11-12, all 15 as recommended; review page
 * "Time trials bot: dividers and spacing"). Pure: the handlers in commands/timeTrials.ts, commands/ttPanelActions.ts,
 * commands/ttImport.ts, ttPanel.ts and timeTrials/asks.ts do the reading and sending, and build every message here.
 *
 *   1  Anything with more than one fact is one Components V2 container; a single sentence stays a plain line.
 *   2  The same order every time: header, body, proof, asks, then buttons. A line only for server managers goes last.
 *   3  A full divider between different kinds of content (after the header, the body, the proof): three at most.
 *   4  Space without a line between groups of one kind (150cc and 200cc, the list and your place, a result and laps).
 *   5  ## on posts in a channel, ### on private replies and for labels inside a message.
 *   6  Small print (-#) for details only (category, scope, counts, when, where the proof came from), never for
 *      something the player must do. No site address footers.
 *   7  An ask (Add clip, Count it, Check them, Link, Verify) is a section with its button beside it; the message's own
 *      buttons are one row at the bottom, main one first, links last. Board switches sit above the list in pairs.
 *   8  Competitive ice for everything, gold for a fallen server record, amber when someone has to act.
 *   9  Track art small beside the title; the result screenshot full width in its own gallery.
 *
 * Discord's rules for cards: no content or embeds beside them; 40 components and 4,000 characters of text at most;
 * and a message can't switch between a card and the old format when it's changed in place, so every in-place update
 * of a card is a card (lineMessage for a one-line answer). The custom ids are the ones the buttons always had, so
 * buttons on older posts keep working.
 */

import { SITE_URL } from "@/lib/seo";
import { categoryText, vehicleFor, vehicleLabel, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import { partsText, type TtParts } from "@/lib/timeTrials/parts";
import { COMMUNITY_VOUCHES, formatGap, formatLap, formatTime, lapsAddUp, ordinal } from "@/lib/timeTrials/rules";
import { trackCode, trackTitle } from "@/lib/timeTrials/codes";
import { isClassFor, trackPath, ttCups, ttTrack, ttTracks, TT_GAMES, TT_GAME_ORDER, type TtClass, type TtGame, type TtTrack } from "@/lib/timeTrials/tracks";

// ── Flags, colors and custom ids ───────────────────────────────────────────────────────────────

export const V2 = 1 << 15;
export const EPHEMERAL = 64;
/** Competitive ice: the Master division's ice (the app's icon and banner are black and ice). */
export const ICE = 0xcfe2ee;
/** A fallen server record. */
export const GOLD = 0xe0b13a;
/** Someone has to act: a check with a warning, a reviewer's ask. */
export const AMBER = 0xf0a020;

// Every custom id the time trial messages use, unchanged from before the cards (older posts keep working).
export const TT_PANEL_PREFIX = "ttp:";
export const TT_OK_PREFIX = "ttok:";
export const TT_NO_PREFIX = "ttno:";
export const TT_VERIFY_PREFIX = "ttv:";
export const TT_REPORT_PREFIX = "ttr:";
export const TT_UNDO_PREFIX = "ttu:";
/** Vouch for a time from the bot's record posts (anyone in Discord, never your own time; picks 2026-11-04, 20A). */
export const TT_VOUCH_PREFIX = "ttw:";
/** "Add clip" on a top-ten time, and the form it opens (round 2). */
export const TT_CLIP_PREFIX = "ttclip:";
export const TT_CLIP_MODAL_PREFIX = "ttclipm:";
/** "Count it": a /tt add time also counts in a time trial event the player is running (events pick 10A). */
export const TT_EVENT_PREFIX = "tteva:";
export const TT_PANEL_MODAL = "ttpm:";
export const TT_CUP_PREFIX = "ttpc:";
export const TT_TRACK_PREFIX = "ttpt:";
export const TT_VIEW_PREFIX = "ttpv:";
export const TT_BOARD_PREFIX = "ttpb:";
export const TT_POST_PREFIX = "ttpp:";
export const TT_MINE_POST = "ttpme:";
export const TT_FIXTRACK_PREFIX = "ttpk:";
export const TT_FIXTIME_PREFIX = "ttpx:";
export const TT_FIXTIME_MODAL = "ttpxm:";
export const TT_IMPORT_PREFIX = "ttq:";

/** Where "Link to GameShuffle" goes, and the sentence beside it (picks 2026-10-29, 3A). */
export const LINK_URL = `${SITE_URL}/time-trials/link`;
export const LINK_LINE = "Link your GameShuffle account so these times sit with your site times and show on your profile.";

export type PanelGame = TtGame | "both";

// ── Parts ───────────────────────────────────────────────────────────────────────────────────────

export type Part = Record<string, unknown>;
export type Message = Record<string, unknown>;

export const text = (content: string): Part => ({ type: 10, content });
/** Small print: each line prefixed with -#. */
export const small = (...lines: string[]): string => lines.filter(Boolean).map((l) => `-# ${l}`).join("\n");
export const divider = (): Part => ({ type: 14, divider: true, spacing: 1 });
export const space = (): Part => ({ type: 14, divider: false, spacing: 1 });
export const thumb = (url: string, description?: string): Part => ({ type: 11, media: { url }, ...(description ? { description: description.slice(0, 1024) } : {}) });
export const gallery = (url: string, description: string): Part => ({ type: 12, items: [{ media: { url }, description: description.slice(0, 1024) }] });
export const btn = (label: string, customId: string, style: 1 | 2 | 3 | 4 = 2, disabled = false): Part =>
  ({ type: 2, style, label: label.slice(0, 80), custom_id: customId, ...(disabled ? { disabled: true } : {}) });
export const link = (label: string, url: string): Part => ({ type: 2, style: 5, label: label.slice(0, 80), url });
export const row = (...components: Part[]): Part => ({ type: 1, components });
/** A section: up to three lines of text with a button or a thumbnail beside them. */
export const section = (lines: string | string[], accessory: Part): Part =>
  ({ type: 9, components: (Array.isArray(lines) ? lines : [lines]).filter(Boolean).slice(0, 3).map(text), accessory });
/** A header: the title lines, with the track's art beside them when there is some. */
export const head = (lines: string[], image?: string | null, alt?: string): Part =>
  (image ? section(lines.join("\n"), thumb(image, alt)) : text(lines.join("\n")));
export const container = (parts: Part[], accent: number = ICE): Part => ({ type: 17, accent_color: accent, components: parts });

/** A card: one container. Add EPHEMERAL for a new private reply (`privately`). */
export function cardMessage(parts: Part[], accent: number = ICE): Message {
  return { flags: V2, components: [container(parts, accent)], allowed_mentions: { parse: [] } };
}
/** A one-line answer that can stand in for a card (in place of one, the line has to be a card too). */
export function lineMessage(content: string): Message {
  return { flags: V2, components: [text(content)], allowed_mentions: { parse: [] } };
}
/** The same message as a new private reply. */
export const privately = (m: Message): Message => ({ ...m, flags: ((Number(m.flags) || 0) | EPHEMERAL) });

const flagsOf = (interaction: Record<string, unknown>): number | null => {
  const m = interaction.message as { flags?: number } | undefined;
  return m ? m.flags ?? 0 : null;
};
/** Whether the message a button or form came from is a card (a form without a message counts as one). */
export const onCard = (interaction: Record<string, unknown>): boolean => ((flagsOf(interaction) ?? V2) & V2) !== 0;
/** Whether the message a button came from is private. */
export const onPrivate = (interaction: Record<string, unknown>): boolean => ((flagsOf(interaction) ?? 0) & EPHEMERAL) !== 0;

/** A one-line answer in place of the message a button came from: a card line on a card, plain text on an older one. */
export function lineInPlace(interaction: Record<string, unknown>, content: string): Message {
  return onCard(interaction) ? lineMessage(content) : { content, components: [], embeds: [], allowed_mentions: { parse: [] } };
}

/** Names as plain text (no stray bold or italics from an underscore). */
export const esc = (s: string): string => s.replace(/([\\*_~|`>])/g, "\\$1");
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const when = (iso: string) => `<t:${Math.floor(Date.parse(iso) / 1000)}:R>`;
const twoSpeeds = (game: TtGame) => TT_GAMES[game].classes.length > 1;
export const catText = (game: TtGame, cc: TtClass, items: TtItems, vehicle: TtVehicle = "any") => categoryText(game, cc, items, vehicle, twoSpeeds(game));

/** A country's flag as emoji (Discord draws these on every platform). */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || !/^[a-z]{2}$/i.test(code)) return "";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
export const flagged = (code: string | null | undefined) => (code ? `${flagEmoji(code)} ` : "");

export function boardUrl(t: TtTrack, cc: TtClass, items: TtItems = "shrooms", vehicle: TtVehicle = "any"): string {
  return `${SITE_URL}${trackPath(t, cc, { items, vehicle })}`;
}

/** The same status words everywhere (pick 14): Verified, Legacy, Community verified, Unverified (a top-ten time). */
export function statusWord(r: { video: string; sheet?: boolean; vouches: number; top: boolean }): string {
  if (r.video === "checked") return "Verified";
  if (r.sheet) return "Legacy";
  if (r.vouches >= COMMUNITY_VOUCHES) return "Community verified";
  if (r.top) return "Unverified";
  return "";
}

/** Laps against another time, a line each: "Lap 2 **36.011** +0.171" (pick 12). */
export function lapLines(mine: number[], vs: { laps: number[] }): string[] {
  return mine.map((lap, i) => {
    const other = vs.laps[i];
    if (other == null) return `Lap ${i + 1} **${formatLap(lap)}**`;
    const gap = lap - other;
    return `Lap ${i + 1} **${formatLap(lap)}** ${gap === 0 ? "even" : `${gap < 0 ? "−" : "+"}${formatGap(Math.abs(gap))}`}`;
  });
}
/** The small line over the laps: whose time they're against. */
export function lapsTitle(vs: { name: string; timeMs: number; record: boolean }): string {
  return `Laps against ${vs.record ? "the record" : `${esc(vs.name)}'s time`} (${vs.record ? `${esc(vs.name)}, ` : ""}${formatTime(vs.timeMs)})`;
}

// ── The panel ───────────────────────────────────────────────────────────────────────────────────

export interface PanelRecord { game: TtGame; track: string; cc: TtClass; items: TtItems; timeMs: number; at: string; name: string }

/** The panel's components (one container). The title steps up, the month's numbers are small print, and each record
 *  has its category and when on a small line under it. */
export function panelCard(a: { serverTitle: string | null; games: TtGame[]; game: PanelGame; monthTimes: number; monthPlayers: number; records: PanelRecord[]; boardUrl: string }): Part[] {
  const gameLine = a.games.map((g) => TT_GAMES[g].label).join(" and ");
  const month = a.monthTimes ? `${plural(a.monthTimes, "time", "times")} from ${plural(a.monthPlayers, "player", "players")} this month` : "no times yet this month";
  const lines = a.records.map((r) => {
    const t = ttTrack(r.game, r.track);
    const name = t ? trackCode(t) ?? t.name : r.track;
    const detail = [catText(r.game, r.cc, r.items), a.game === "both" ? TT_GAMES[r.game].short : null, when(r.at)].filter(Boolean).join(" · ");
    return `\`${name}\` **${formatTime(r.timeMs)}** · ${esc(r.name)}\n${small(detail)}`;
  });
  return [container([
    text(`## Time trials in ${esc(a.serverTitle || "this server")}\n${small(`${gameLine} · ${month}`)}`),
    divider(),
    text(`### Newest server records\n${lines.length ? lines.join("\n") : "None yet. Add the first time."}`),
    divider(),
    row(
      btn("Add a time", `${TT_PANEL_PREFIX}add:${a.game}`, 3),
      btn("Top ten", `${TT_PANEL_PREFIX}top:${a.game}`),
      btn("My times", `${TT_PANEL_PREFIX}me:${a.game}`),
      link("Server board", a.boardUrl),
    ),
  ])];
}

// ── Record posts: a fallen server record, and a new best after /tt add ─────────────────────────

export interface RecordPost {
  kind: "record" | "best";
  track: TtTrack;
  category: string;
  /** The player, flag first when known. */
  who: string;
  timeMs: number;
  /** Small print under the time ("Was 2:25.905 by Quinn", "2nd of 6 in this server"…). */
  details: string[];
  laps?: { title: string; lines: string[] } | null;
  proofUrl: string | null;
  timeId: string;
  board: { label: string; url: string };
  /** The server's name for the managers' line. */
  server: string | null;
}

/** One layout for both posts: the time is the heading, the screenshot gets its own block, and Verify sits on its own
 *  line at the foot for server managers. Gold marks a server record. */
export function recordPostCard(p: RecordPost): Message {
  const parts: Part[] = [
    head([`## ${p.kind === "record" ? "New server record" : "New best"}`, `${trackTitle(p.track)} · ${p.category}`], p.track.image, p.track.name),
    divider(),
    text(`### ${p.who} · ${formatTime(p.timeMs)}${p.details.length ? `\n${small(p.details.join(" · "))}` : ""}`),
  ];
  if (p.laps?.lines.length) parts.push(space(), text(`${small(p.laps.title)}\n${p.laps.lines.join("\n")}`));
  if (p.proofUrl) parts.push(divider(), text(small("Proof · result screenshot")), gallery(p.proofUrl, `Result screenshot: ${formatTime(p.timeMs)} on ${p.track.name}`));
  parts.push(
    divider(),
    row(btn("Vouch", `${TT_VOUCH_PREFIX}${p.timeId}`), btn("Report", `${TT_REPORT_PREFIX}${p.timeId}`), link(p.board.label, p.board.url)),
    section(small(`Server managers can check this time${p.server ? ` for ${esc(p.server)}` : ""}.`), btn("Verify", `${TT_VERIFY_PREFIX}${p.timeId}`)),
  );
  return cardMessage(parts, p.kind === "record" ? GOLD : ICE);
}

// ── The reply after /tt add (and Add it) ────────────────────────────────────────────────────────

export interface AddReply {
  track: TtTrack;
  category: string;
  timeMs: number;
  timeId: string;
  best: boolean;
  previousMs: number | null;
  place: number;
  total: number;
  server: { place: number; total: number } | null;
  laps: { title: string; lines: string[] } | null;
  /** A top-ten time without a clip: Add clip. */
  askClip: boolean;
  /** A clip came with it: it's in the review queue. */
  clipSent: boolean;
  events: { id: string; title: string }[];
  /** "/tt country" when the player has no country yet. */
  countryCmd: string | null;
  unlinked: boolean;
  boardUrl: string;
}

/** The result, its laps and the asks each get their own block, each ask's button beside its sentence; Undo and the
 *  board stay at the bottom. */
export function addReplyCard(a: AddReply): Message {
  const result = a.best && a.previousMs != null ? `**New best**, ${formatGap(a.previousMs - a.timeMs)} faster than before`
    : a.best ? "**New best**: your first time on this track"
    : `Your best is still **${formatTime(a.previousMs ?? a.timeMs)}**`;
  const where = [a.server ? `${ordinal(a.server.place)} of ${a.server.total} in this server` : null, `${ordinal(a.place)} of ${a.total} on GameShuffle`].filter(Boolean).join(" · ");
  const parts: Part[] = [
    head([`### Saved: ${formatTime(a.timeMs)}`, trackTitle(a.track), small(a.category)], a.track.image, a.track.name),
    divider(),
    text(`${result}\n${where}`),
  ];
  if (a.laps?.lines.length) parts.push(space(), text(`${small(a.laps.title)}\n${a.laps.lines.join("\n")}`));
  const asks: Part[] = [];
  if (a.askClip) asks.push(section("That's a top-ten time. It shows as Unverified until a reviewer checks a clip of the run's last 30 seconds.", btn("Add clip", `${TT_CLIP_PREFIX}${a.timeId}`, 1)));
  else if (a.clipSent) asks.push(text("Your clip is in the review queue. The time shows as Verified once it's checked."));
  if (a.events.length === 1) {
    asks.push(section(`You're in ${esc(a.events[0].title)} on this track. Count this run there too?`, btn("Count it", `${TT_EVENT_PREFIX}${a.timeId}:${a.events[0].id}`, 1)));
  } else if (a.events.length > 1) {
    asks.push(text(`You're in ${a.events.length} time trial events on this track. Count this run there too?`));
    for (const e of a.events) asks.push(section(`**${esc(e.title)}**`, btn("Count it", `${TT_EVENT_PREFIX}${a.timeId}:${e.id}`, 1)));
  }
  if (a.countryCmd) asks.push(text(`Add your country with \`${a.countryCmd}\` so your times count on its records.`));
  if (a.unlinked) asks.push(section(LINK_LINE, link("Link to GameShuffle", LINK_URL)));
  if (asks.length) parts.push(divider(), ...asks);
  parts.push(divider(), row(btn("Undo", `${TT_UNDO_PREFIX}${a.timeId}`), link("Track board", a.boardUrl)));
  return cardMessage(parts);
}

/** "Counted in …" after Count it. */
export function countedCard(a: { title: string; detail: string; clipAsk: string | null; eventUrl: string }): Message {
  const parts: Part[] = [text(`### Counted in ${esc(a.title)}\n${a.detail}`)];
  if (a.clipAsk) parts.push(divider(), text(a.clipAsk));
  parts.push(divider(), row(link("Open the event", a.eventUrl)));
  return cardMessage(parts);
}

// ── The check before a time saves (/tt add from a screenshot, and Add a time on the panel) ─────

/** A draft as both ways in save it (tt_drafts.payload). */
export interface CheckDraft {
  game: TtGame;
  track: string | null;
  cc: TtClass;
  items?: TtItems;
  vehicle?: TtVehicle;
  timeMs: number | null;
  /** The time came from the screenshot (true), was typed (false); unset on /tt add's own read. */
  read?: boolean;
  readMs?: number | null;
  laps?: number[] | null;
  proofUrl: string | null;
  parts?: TtParts | null;
  /** The track the screenshot looks like, when it isn't the one picked (/tt add). */
  shotTrack?: { game: TtGame; id: string } | null;
}

/** What to look at before saving, worked out from the draft (so it stays right after Change track or Change time). */
export function checkWarnings(p: CheckDraft, note: string | null = null): string[] {
  const out: string[] = [];
  if (note) out.push(note);
  if (!p.timeMs) out.push("I couldn't read every digit of the time. Press Type the time.");
  if (p.read === false && p.readMs && p.timeMs && p.readMs !== p.timeMs) out.push(`You typed ${formatTime(p.timeMs)}. The screenshot reads ${formatTime(p.readMs)}.`);
  if (p.timeMs && p.laps?.length && !lapsAddUp(p.laps, p.timeMs)) out.push("The laps don't add up to the time, so an updater will look.");
  const shot = p.shotTrack ? ttTrack(p.shotTrack.game, p.shotTrack.id) : null;
  if (shot && !(shot.game === p.game && shot.id === p.track)) {
    out.push(`The screenshot looks like ${trackTitle(shot)}${shot.game !== p.game ? ` (${TT_GAMES[shot.game].label})` : ""}. ${shot.game === p.game ? "If it is, press Change track." : "If it is, add it again with that track."}`);
  }
  return out;
}

const warnText = (warnings: string[]) => warnings.map((w) => `⚠️ ${w}`).join("\n");

const draftCategory = (p: CheckDraft) => {
  const vehicle = vehicleFor(p.game, p.vehicle ?? "any");
  return [catText(p.game, p.cc, p.items ?? "shrooms"), vehicle !== "any" ? `${vehicleLabel(vehicle)} board` : null].filter(Boolean).join(" · ");
};

/** The track picker for a draft (no track read, or Change track): it says which time it's for. */
export function fixPickerCard(draftId: string, p: CheckDraft, by: PickBy = "track", cupIndex: number | null = null, warnings: string[] = []): Message {
  return pickerCard("fix", draftId, p.game, by, cupIndex, { sub: `For your ${p.timeMs ? formatTime(p.timeMs) : "time"} · ${draftCategory(p)}`, warnings });
}

/** One check for both ways in: the time beside the screenshot it came from, warnings in their own block with an amber
 *  edge, and Add it, Change track, Change time and Cancel. Without a track it's the track picker. */
export function checkCard(draftId: string, p: CheckDraft, note: string | null = null): Message {
  const category = draftCategory(p);
  const track = p.track ? ttTrack(p.game, p.track) : null;
  const warnings = checkWarnings(p, note);
  if (!track) return fixPickerCard(draftId, p, "track", null, warnings.filter((w) => !w.startsWith("I couldn't read every digit")));
  const body = [
    `${p.timeMs ? `**${formatTime(p.timeMs)}**` : "Time not read"} on ${trackTitle(track)}`,
    small(category),
    ...(p.parts ? [small(partsText(p.parts))] : []),
    ...(p.laps?.length ? [`Laps ${p.laps.map(formatLap).join(" · ")}`] : []),
  ].join("\n");
  const parts: Part[] = [
    text(`### Check your time\n${small("Nothing is saved until you press Add it")}`),
    divider(),
    p.proofUrl ? section(body, thumb(p.proofUrl, "Your result screenshot")) : text(body),
  ];
  if (warnings.length) parts.push(divider(), text(warnText(warnings)));
  parts.push(divider(), row(
    btn("Add it", `${TT_OK_PREFIX}${draftId}`, 3, !p.timeMs),
    btn("Change track", `${TT_FIXTRACK_PREFIX}${draftId}`),
    btn(p.timeMs ? "Change time" : "Type the time", `${TT_FIXTIME_PREFIX}${draftId}`, p.timeMs ? 2 : 1),
    btn("Cancel", `${TT_NO_PREFIX}${draftId}`),
  ));
  return cardMessage(parts, warnings.length ? AMBER : ICE);
}

// ── Track pickers ───────────────────────────────────────────────────────────────────────────────

export type PickBy = "track" | "cup";

function cupLabel(cup: string): string {
  return /Mario Kart$/.test(cup) ? `${cup} courses` : `${cup} Cup`;
}

/** Console prefixes in Mario Kart 8 Deluxe's names, so "N64 Rainbow Road" sorts under R as "Rainbow Road (N64)". */
const CONSOLE = /^(Wii|GBA|DS|N64|GCN|SNES|3DS|Tour) (.+)$/;
function alphaName(t: TtTrack): { key: string; label: string } {
  const m = CONSOLE.exec(t.name);
  return m ? { key: `${m[2]} ${m[1]}`.toLowerCase(), label: `${m[2]} (${m[1]})` } : { key: t.name.toLowerCase(), label: t.name };
}
const letter = (key: string) => key.replace(/^[^a-z0-9]+/, "").charAt(0).toUpperCase();

/** Every track A to Z, in as few menus as Discord's 25-choice limit allows, split evenly. */
function alphaMenus(mode: "top" | "fix", ref: string, game: TtGame): Part[] {
  const all = ttTracks(game).map((t) => ({ t, ...alphaName(t) })).sort((a, b) => a.key.localeCompare(b.key));
  const count = Math.ceil(all.length / 25), size = Math.ceil(all.length / count);
  const menus: Part[] = [];
  for (let i = 0; i < count; i++) {
    const part = all.slice(i * size, (i + 1) * size);
    const from = letter(part[0].key), to = letter(part[part.length - 1].key);
    menus.push(row({
      type: 3, custom_id: `${TT_TRACK_PREFIX}${mode}:${ref}:${i}`, placeholder: count === 1 ? "Pick a track" : from === to ? `Tracks: ${from}` : `Tracks: ${from} to ${to}`,
      options: part.map(({ t, label }) => ({ label: label.slice(0, 100), value: t.id, ...(trackCode(t) ? { description: trackCode(t)! } : {}) })),
    }));
  }
  return menus;
}

/** The cup menu, and once a cup is picked the menu of its tracks. */
function cupMenus(mode: "top" | "fix", ref: string, game: TtGame, cupIndex: number | null): Part[] {
  const cups = ttCups(game);
  const menus: Part[] = [row({
    type: 3, custom_id: `${TT_CUP_PREFIX}${mode}:${ref}`, placeholder: "Pick a cup",
    options: cups.map((c, i) => ({ label: cupLabel(c.cup), value: String(i), ...(i === cupIndex ? { default: true } : {}) })),
  })];
  if (cupIndex != null && cups[cupIndex]) {
    menus.push(row({
      type: 3, custom_id: `${TT_TRACK_PREFIX}${mode}:${ref}`, placeholder: "Pick a track",
      options: cups[cupIndex].tracks.map((t) => ({ label: t.name.slice(0, 100), value: t.id, ...(trackCode(t) ? { description: trackCode(t)! } : {}) })),
    }));
  }
  return menus;
}

/** The track picker as a card (it replaces the check in place, which is one): the title, which time it's for, the
 *  menus, then By track / By cup (and Cancel while fixing a time). */
export function pickerCard(mode: "top" | "fix", ref: string, game: TtGame, by: PickBy, cupIndex: number | null = null, a: { title?: string; sub?: string | null; warnings?: string[] } = {}): Message {
  const view = (b: PickBy, label: string) => btn(label, `${TT_VIEW_PREFIX}${b}:${mode}:${ref}`, by === b ? 1 : 2, by === b);
  const title = a.title ?? (mode === "fix" ? "Which track was it?" : "Which track?");
  const warnings = a.warnings ?? [];
  const parts: Part[] = [text(`### ${title}${a.sub ? `\n${small(a.sub)}` : ""}`)];
  if (warnings.length) parts.push(text(warnText(warnings)));
  parts.push(
    ...(by === "track" ? alphaMenus(mode, ref, game) : cupMenus(mode, ref, game, cupIndex)),
    row(view("track", "By track"), view("cup", "By cup"), ...(mode === "fix" ? [btn("Cancel", `${TT_NO_PREFIX}${ref}`)] : [])),
  );
  return cardMessage(parts, warnings.length ? AMBER : ICE);
}

/** "Which game?" for a both-games panel's Add a time and Top ten. */
export function gameChoiceCard(kind: "add" | "top"): Message {
  return cardMessage([text("### Which game?"), row(...TT_GAME_ORDER.map((g) => btn(TT_GAMES[g].label, `${TT_PANEL_PREFIX}${kind}:${g}`)))]);
}

// ── Boards ──────────────────────────────────────────────────────────────────────────────────────

/** A board view, kept in the buttons: game, track, speed, mushrooms, whose times. */
export type BoardState = { game: TtGame; track: string; cc: TtClass; items: TtItems; scope: "server" | "everyone" };
export const encodeState = (s: BoardState) => [s.game === "mk8dx" ? "d" : "w", s.track, s.cc, s.items === "none" ? "n" : "s", s.scope === "server" ? "s" : "e"].join(".");
/** Reads a board view back. Anything after the fifth part is ignored: the active switch in a pair carries a tail so no
 *  two buttons on one board share a custom id (".i" mushrooms, ".c" speed). */
export function decodeState(raw: string): BoardState | null {
  const [g, track, cc, i, sc] = raw.split(".");
  const game: TtGame = g === "d" ? "mk8dx" : "mkworld";
  const n = Number(cc);
  if (!ttTrack(game, track) || !isClassFor(game, n)) return null;
  return { game, track, cc: n as TtClass, items: i === "n" ? "none" : "shrooms", scope: sc === "s" ? "server" : "everyone" };
}

export interface BoardLine { rank: number; name: string; country: string | null; timeMs: number; status: string }

export interface BoardCardInput {
  track: TtTrack;
  cc: TtClass;
  items: TtItems;
  vehicle?: TtVehicle;
  /** "This server", "Everyone on GameShuffle", "Players from Japan". */
  scopeLabel: string;
  total: number;
  rows: BoardLine[];
  mine: BoardLine | null;
  recordLaps: { name: string; laps: number[] } | null;
  empty: string;
  fullUrl: string;
  /** The private board on the panel: switches above the list, and Another track / Post here. */
  live?: { state: BoardState; guild: boolean } | null;
}

const boardLine = (r: BoardLine, withStatus: boolean) => `${r.rank}. ${flagged(r.country)}${esc(r.name)} · **${formatTime(r.timeMs)}**${withStatus && r.status ? ` · ${r.status}` : ""}`;

/** One board everywhere: switches above the list (the one showing in blue), your place and the record's laps after a
 *  space, the same status words. The public board (/tt track, Post here) leaves the switches out. */
export function boardCard(b: BoardCardInput): Message {
  const live = b.live ?? null;
  const parts: Part[] = [
    head([`${live ? "###" : "##"} ${trackTitle(b.track)}`, small(`${catText(b.track.game, b.cc, b.items, b.vehicle ?? "any")} · ${b.scopeLabel} · ${plural(b.total, "player", "players")}`)], b.track.image, b.track.name),
  ];
  if (live) {
    const s = live.state;
    const to = (patch: Partial<BoardState>, tail = "") => `${TT_BOARD_PREFIX}${encodeState({ ...s, ...patch })}${tail}`;
    if (live.guild) parts.push(row(btn("This server", to({ scope: "server" }), s.scope === "server" ? 1 : 2), btn("Everyone", to({ scope: "everyone" }), s.scope === "everyone" ? 1 : 2)));
    parts.push(row(
      btn("Mushrooms", to({ items: "shrooms" }, s.items === "shrooms" ? ".i" : ""), s.items === "shrooms" ? 1 : 2),
      btn("No mushrooms", to({ items: "none" }, s.items === "none" ? ".i" : ""), s.items === "none" ? 1 : 2),
    ));
    const classes = TT_GAMES[s.game].classes;
    if (classes.length > 1) parts.push(row(...classes.map((c) => btn(`${c}cc`, to({ cc: c }, s.cc === c ? ".c" : ""), s.cc === c ? 1 : 2))));
  }
  parts.push(divider(), text(b.rows.length ? b.rows.map((r) => boardLine(r, true)).join("\n") : b.empty));
  if (b.mine) parts.push(space(), text(`${small("Your place")}\n${boardLine(b.mine, false)}`));
  if (b.recordLaps) parts.push(space(), text(small(`Record laps (${esc(b.recordLaps.name)}) · ${b.recordLaps.laps.map(formatLap).join(" · ")}`)));
  const full = link("Full board", b.fullUrl);
  parts.push(divider(), live
    ? row(btn("Another track", `${TT_PANEL_PREFIX}top:${live.state.game}`), btn("Post here", `${TT_POST_PREFIX}${encodeState(live.state)}`, 1), full)
    : row(full));
  return cardMessage(parts);
}

// ── A player's times (/tt player, My times) ─────────────────────────────────────────────────────

export interface PlayerCardInput {
  who: string;
  game: TtGame;
  /** Per speed with times: its lines (best places first), how many more there are, and how many tracks. */
  speeds: { cc: TtClass; lines: string[]; more: number; tracks: number }[];
  records: number;
  allUrl: string;
  /** My times on the panel: private, Post here first in the bottom row. */
  mine?: { post: string; unlinked: boolean } | null;
}

/** The totals at the top, a label per speed, and space between the speeds. */
export function playerCard(a: PlayerCardInput): Message {
  const total = ttTracks(a.game).length;
  const two = twoSpeeds(a.game);
  const counts = a.speeds.map((s, i) => `**${s.tracks} of ${total}**${i === 0 ? " tracks" : ""}${two ? ` at ${s.cc}cc` : ""}`);
  const records = a.records ? plural(a.records, "record", "records") : "no records yet";
  const parts: Part[] = [
    text(`${a.mine ? "###" : "##"} ${esc(a.who)}'s time trials\n${small(`${TT_GAMES[a.game].label} · mushrooms`)}\n${[...counts, records].join(" · ")}`),
    divider(),
  ];
  a.speeds.forEach((s, i) => {
    if (i > 0) parts.push(space());
    parts.push(text([...(two ? [`### ${s.cc}cc`] : []), ...s.lines, ...(s.more ? [small(`and ${s.more} more`)] : [])].join("\n")));
  });
  const all = link("All times", a.allUrl);
  parts.push(divider(), a.mine
    ? row(btn("Post here", a.mine.post, 1), all, ...(a.mine.unlinked ? [link("Link to GameShuffle", LINK_URL)] : []))
    : row(all));
  return cardMessage(parts);
}

// ── Save to GameShuffle (Quaxly's list) ─────────────────────────────────────────────────────────

export interface SaveListInput {
  keep: number;
  already: number;
  unclear: number;
  record: number;
  gameLabel: string;
  category: string;
  draftId: string | null;
  checkUrl: string;
  seeUrl: string;
  unlinked: boolean;
}

/** The count is the title, what's already handled is small print, and the one thing to do has its button beside it. */
export function saveListCard(a: SaveListInput): Message {
  const parts: Part[] = [text(`### ${a.keep ? `${plural(a.keep, "new time", "new times")} to save` : "Nothing new to save"}\n${small(`From Quaxly · ${a.gameLabel} · ${a.category}`)}`)];
  const middle: Part[] = [];
  const handled = [
    a.keep && a.already ? `${a.already} more ${a.already === 1 ? "is" : "are"} already saved` : null,
    a.record ? `${a.record} ${a.record === 1 ? "is" : "are"} faster than the world record and ${a.record === 1 ? "stays" : "stay"} out` : null,
  ].filter((x): x is string => !!x);
  if (!a.keep) middle.push(text("All your times on this list are already on GameShuffle."));
  if (handled.length) middle.push(text(small(handled.join(" · "))));
  if (a.unclear) middle.push(section(`${a.unclear} ${a.unclear === 1 ? "track wasn't" : "tracks weren't"} clear. Pick ${a.unclear === 1 ? "it" : "them"} on GameShuffle.`, link("Check them", a.checkUrl)));
  if (a.unlinked) middle.push(section(LINK_LINE, link("Link to GameShuffle", LINK_URL)));
  if (middle.length) parts.push(divider(), ...middle);
  const buttons: Part[] = a.keep && a.draftId
    ? [btn(`Save ${plural(a.keep, "time", "times")}`, `${TT_IMPORT_PREFIX}${a.draftId}`, 3), ...(a.unclear ? [] : [link("Check them on GameShuffle", a.checkUrl)])]
    : [link(a.keep ? "Check them on GameShuffle" : "See your times", a.keep ? a.checkUrl : a.seeUrl)];
  parts.push(divider(), row(...buttons));
  return cardMessage(parts);
}

/** After Save N times. */
export function savedCard(a: { saved: number; already: number; refused: number; gameLabel: string; category: string; seeUrl: string; unlinked: boolean }): Message {
  const details = [
    `${a.gameLabel} · ${a.category}`,
    a.already ? `${a.already} ${a.already === 1 ? "was" : "were"} already there` : null,
    a.refused ? `${a.refused} ${a.refused === 1 ? "was" : "were"} faster than the world record and stayed out` : null,
  ].filter((x): x is string => !!x);
  const parts: Part[] = [text(`### ${a.saved ? `Saved ${plural(a.saved, "time", "times")}` : "Nothing new to save"}\n${small(details.join(" · "))}${a.saved ? "" : "\nThose times are already on GameShuffle."}`)];
  if (a.unlinked) parts.push(divider(), section(LINK_LINE, link("Link to GameShuffle", LINK_URL)));
  parts.push(divider(), row(link("See your times", a.seeUrl)));
  return cardMessage(parts);
}

// ── Messages to players (Discord-only players hear about reviews here) ──────────────────────────

export interface PlayerNote {
  title: string;
  /** Small print: the track, category and time. */
  details: string;
  /** The reviewer's own words, shown as a quote. */
  note: string | null;
  /** A plain line after the quote ("If that's wrong, reply from the time."). */
  line: string | null;
  /** The player has to do something: amber. News: ice. */
  act: boolean;
  url: string;
}

/** A small card: the title, the time in small print, the reviewer's words as a quote, and Open your time (a button,
 *  so no link preview). */
export function playerNoteCard(n: PlayerNote): Message {
  const body = [
    ...(n.note ? [n.note.trim().split("\n").map((l) => `> ${l}`).join("\n")] : []),
    ...(n.line ? [n.line] : []),
  ].join("\n");
  const parts: Part[] = [text(`### ${n.title}\n${small(n.details)}`)];
  if (body) parts.push(divider(), text(body));
  parts.push(divider(), row(link("Open your time", n.url)));
  return cardMessage(parts, n.act ? AMBER : ICE);
}

/** "Wii Daisy Circuit (bDC) · 150cc, mushrooms · 1:47.512" for a time. */
export function timeDetails(t: { game: TtGame; track: string; cc: TtClass; items: TtItems; vehicle: TtVehicle; timeMs: number }, prefix = ""): string {
  const track = ttTrack(t.game, t.track);
  return [track ? trackTitle(track) : "A track", catText(t.game, t.cc, t.items, t.vehicle), `${prefix}${formatTime(t.timeMs)}`].join(" · ");
}

// ── Forms ───────────────────────────────────────────────────────────────────────────────────────

/** The Add your clip form, in the labeled style the other forms use. */
export function clipForm(timeId: string): Record<string, unknown> {
  return {
    custom_id: `${TT_CLIP_MODAL_PREFIX}${timeId}`,
    title: "Add your clip",
    components: [{ type: 18, label: "Clip of the run's last 30 seconds", description: "A link from YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram", component: { type: 4, custom_id: "url", style: 1, placeholder: "https://", required: true, max_length: 300 } }],
  };
}

type ModalPart = { custom_id?: string; value?: string | null; values?: string[] };
/** A submitted form's fields by custom id, in either form style (labeled, or the older rows of inputs). */
export function modalParts(interaction: Record<string, unknown>): Map<string, ModalPart> {
  const out = new Map<string, ModalPart>();
  const walk = (list: unknown[]) => {
    for (const c of list as { component?: ModalPart; components?: unknown[]; custom_id?: string }[]) {
      if (c.component?.custom_id) out.set(c.component.custom_id, c.component);
      else if (c.custom_id) out.set(c.custom_id, c as ModalPart);
      if (c.components) walk(c.components);
    }
  };
  walk(((interaction.data as { components?: unknown[] } | undefined)?.components) ?? []);
  return out;
}

