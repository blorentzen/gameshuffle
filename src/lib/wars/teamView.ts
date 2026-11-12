/**
 * What the Teams page shows (a server's team cards, their players, its settings; overrides picks 2026-11-09) and the
 * small checks its forms share with the server. Pure, client-safe; the reads are in teamAdmin.ts.
 */

import type { LogoSource } from "./cards";
import type { ReadsLike } from "./legacy";
import type { WarGame } from "./rules";
import { tagKey } from "./tags";

export type { LogoSource };

/** Who a player's line came from: the player's own card (/me), a list someone typed, or a fixed table remembered. */
export type SetBy = "themselves" | "captain" | "remember";

export interface TeamPlayerView {
  id: string;
  ingame: string;
  /** The name tables show (the server's line, else the player's own card), null when it's the in-game name. */
  shown: string | null;
  flag: string | null;
  /** The flag's picture (the server's own, else the country flag), when there is one. */
  flagUrl: string | null;
  setBy: SetBy;
  /** The server's own line as typed (what Edit changes); `shown` and `flag` fall back to the player's card. */
  line: { shown: string | null; flag: string | null };
}

export interface TeamView {
  id: string;
  name: string | null;
  /** The first is the one tables show. */
  tags: string[];
  color: string | null;
  /** MKCentral's logo for one of its tags, from the server's wars (shown when the server has no logo of its own). */
  mkLogo: string | null;
  players: TeamPlayerView[];
  /** The logo setting and MKCentral link (wars-m6); null before it runs. */
  links: TeamLinksView | null;
  /** A linked team's players on MKCentral, for the server's game (null when it isn't linked). */
  mkcPlayers: MkcPlayerView[] | null;
  /** The color war tables pick from the team's logo when the card has none (null: no logo, or one without color). */
  logoColor: string | null;
}

/** The MKCentral team a card is linked to, as the Teams page shows it. */
export interface MkcLinkView {
  id: number;
  /** MKCentral's name for the team (its roster for the game when it has one). */
  name: string;
  tag: string | null;
  /** The team's logo on MKCentral now (or as last seen when MKCentral didn't answer). */
  logo: string | null;
  /** Players on its roster for `game`; null when it has no roster for that game. */
  players: number | null;
  game: WarGame;
  /** False when MKCentral didn't answer just now and this is what it said last time. */
  reached: boolean;
}

export interface TeamLinksView {
  source: LogoSource;
  mkc: MkcLinkView | null;
  /** MKCentral's logo for one of the card's tags (Automatic's last stop; From MKCentral's when not linked). */
  tagLogo: { tag: string; url: string } | null;
}

/** Where the name and flag a table shows come from. */
export type PlayerFrom = SetBy | "mkcentral";

/** A player on a linked team's MKCentral roster, beside the server's own line for them. */
export interface MkcPlayerView {
  id: number;
  /** Their name on MKCentral. */
  name: string;
  /** What tables show: the server's line, else their own card (/me), else MKCentral. */
  shown: string;
  flag: string | null;
  flagUrl: string | null;
  from: PlayerFrom;
  /** The server's line tied to them (by MKCentral player, else by their in-game name), when there is one. */
  lineId: string | null;
  ingame: string | null;
  /** On this server's list, or tapped their places in one of its wars. */
  played: boolean;
}

export const mkcTeamUrl = (id: number) => `https://mkcentral.com/en-us/registry/teams/profile?id=${id}`;

/** The first part of an MKCentral name ("Acria/Rei" → Acria), what tables show for a player picked from MKCentral. */
export const mkcShownName = (name: string) => name.split("/")[0].trim() || name;

/** The server's own logo for one of a team's tags (first tag first): its url and the tag it's saved under. */
export function ownLogo(tags: string[], logos: { tag: string; url: string }[]): { url: string; tag: string } | null {
  for (const t of tags) {
    const l = logos.find((o) => tagKey(o.tag) === tagKey(t));
    if (l) return { url: l.url, tag: l.tag };
  }
  return null;
}

/** A track for the nickname form: its shown code, and (Mario Kart Wii) the other codes it answers to. */
export interface TrackOption { id: string; code: string; name: string; also?: string[] }
export interface TrackNickView { nick: string; track: string; label: string }

export interface TeamsView {
  teams: TeamView[];
  /** Teams from the server's wars that no card covers yet (a quick start for Add a team). */
  played: { tag: string; name: string | null }[];
  readsLike: ReadsLike;
  /** The games the server's wars use, most used first (track nicknames are checked against them). */
  games: WarGame[];
  tracks: Record<WarGame, TrackOption[]>;
  nicks: TrackNickView[];
  /** Whether wars-m6.sql has run: the logo setting and MKCentral links. */
  linksReady: boolean;
}

/** An MKCentral team found by the link search. */
export interface MkcHitView {
  id: number;
  name: string;
  tag: string;
  logo: string | null;
  /** The game it has a roster for (the one searched), or null when it has none. */
  game: WarGame | null;
  /** Players on that roster, when known. */
  players: number | null;
}

export const GAME_LABELS: Record<WarGame, string> = { mk8dx: "Mario Kart 8 Deluxe", mkworld: "Mario Kart World", mkwii: "Mario Kart Wii" };

/** A typed flag code as the database keeps it ("[US]" → us), or null when it isn't one. */
export function cleanFlagText(v: string): string | null {
  const c = v.trim().replace(/^\[|\]$/g, "").toLowerCase();
  return /^[a-z]{2,10}(_[a-z]{2,3})?$/.test(c) ? c : null;
}

/** Tags typed with commas between ("FRVR, Ω, TZ"), each once (case and symbols aside), at most 8. */
export function splitTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const t = raw.replace(/\s+/g, " ").trim().slice(0, 12);
    if (t && tagKey(t) && !out.some((o) => tagKey(o) === tagKey(t))) out.push(t);
  }
  return out.slice(0, 8);
}

export const SET_BY_LABEL: Record<PlayerFrom, string> = { themselves: "Their card", captain: "Your list", remember: "Remembered", mkcentral: "MKCentral" };

// ── Where a team's logo comes from (logos + MKCentral picks 2026-11-09, all A) ─────────────────

export const LOGO_SOURCES: { id: LogoSource; label: string; line: string }[] = [
  { id: "auto", label: "Automatic", line: "GameShuffle finds it: your upload, then the linked MKCentral team's, then MKCentral by tag." },
  { id: "upload", label: "Upload a picture", line: "Only your upload, in this server." },
  { id: "mkcentral", label: "From MKCentral", line: "The logo of the MKCentral team this card is linked to." },
];

export const LOGO_SOURCE_LABEL: Record<LogoSource, string> = { auto: "Automatic", upload: "Upload only", mkcentral: "From MKCentral" };

export interface LogoNow {
  url: string | null;
  from: "upload" | "linked" | "tag" | null;
  /** "Shown now: your upload. Twilight Zone has no logo on MKCentral." */
  line: string;
  /** "your upload", for the team's row. */
  short: string;
}

/**
 * Which logo a card shows and why, the way war tables pick it (cardLogo in tables.ts, without a war's own logo: this
 * page has no war). `pending` says it's what shows once the window saves.
 */
export function logoNow(source: LogoSource, x: {
  upload: string | null;
  linked: { name: string; logo: string | null } | null;
  tagLogo: { tag: string; url: string } | null;
  pending?: boolean;
}): LogoNow {
  const lead = x.pending ? "Shown once you save" : "Shown now";
  const tile = "the tag on a colored tile";
  const { upload, linked, tagLogo } = x;
  const noLinkedLogo = linked ? `${linked.name} has no logo on MKCentral.` : "";
  if (source === "upload") {
    return upload
      ? { url: upload, from: "upload", line: `${lead}: your upload.`, short: "your upload" }
      : { url: null, from: null, line: `${lead}: ${tile}, until you upload a picture.`, short: tile };
  }
  if (source === "mkcentral") {
    if (linked) {
      return linked.logo
        ? { url: linked.logo, from: "linked", line: `${lead}: ${linked.name}'s logo from MKCentral.`, short: `${linked.name}'s on MKCentral` }
        : { url: null, from: null, line: `${lead}: ${tile}. ${noLinkedLogo}`, short: tile };
    }
    return tagLogo
      ? { url: tagLogo.url, from: "tag", line: `${lead}: MKCentral's logo for the tag ${tagLogo.tag}. Link the team to MKCentral to be sure it's the right one.`, short: `MKCentral's for ${tagLogo.tag}` }
      : { url: null, from: null, line: `${lead}: ${tile}. GameShuffle found no MKCentral logo for this team's tags; link the team to MKCentral to pick it.`, short: tile };
  }
  // Automatic: your upload, then the linked team's, then MKCentral by tag.
  if (upload) {
    const next = linked ? (linked.logo ? `It comes before ${linked.name}'s logo on MKCentral.` : noLinkedLogo) : tagLogo ? `It comes before MKCentral's logo for ${tagLogo.tag}.` : "";
    return { url: upload, from: "upload", line: `${lead}: your upload.${next ? ` ${next}` : ""}`, short: "your upload" };
  }
  if (linked?.logo) return { url: linked.logo, from: "linked", line: `${lead}: ${linked.name}'s logo from MKCentral. Upload a picture to use your own instead.`, short: `${linked.name}'s on MKCentral` };
  if (tagLogo) {
    return { url: tagLogo.url, from: "tag", line: `${lead}: MKCentral's logo for the tag ${tagLogo.tag}. ${linked ? noLinkedLogo : "Link the team to MKCentral to be sure it's the right one."}`, short: `MKCentral's for ${tagLogo.tag}` };
  }
  return { url: null, from: null, line: `${lead}: ${tile}. There's no upload${linked ? `, and ${linked.name} has no logo on MKCentral` : ", and GameShuffle found no MKCentral logo for this team's tags"}.`, short: tile };
}
