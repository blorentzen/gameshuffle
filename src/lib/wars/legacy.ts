/**
 * What people type into a war channel, the way the other war bots read it (overrides picks 2026-11-09, all as
 * recommended; read from their source code): Sokuji (% commands, plain places), Quaxly (plain places, back, pen, race),
 * Kiwi (!editrace, !addpenalty), Toad (_race) and Ice Mario (!a, !u, !penalty). A line becomes one action on the war;
 * anything else is chat and is left alone. Wars still start with /war (pick 7). Pure, client-safe.
 *
 * Where the bots disagree, a server picks who it reads like (pick 6):
 *   12 in the middle of a string: 12th (Sokuji, Quaxly), or 1st and 2nd (Kiwi)
 *   pen N with no team: the other team (Quaxly's plain pen; Sokuji's %penalty is your own team, read that way too)
 */

import { readSpots, readTrack, type ReadSpots, type WarGame, type WarSide } from "./rules";
import { tagKey } from "./tags";

export type ReadsLike = "sokuji" | "kiwi" | "toad" | "icemario";

export const READS_LIKE: { id: ReadsLike; label: string; line: string }[] = [
  { id: "sokuji", label: "Sokuji and Quaxly", line: "12 first is 1st and 2nd, later it's 12th; 0 is 10th, + is 11th; pen with no team is the other team" },
  { id: "kiwi", label: "Kiwi", line: "12 is always 1st and 2nd" },
  { id: "toad", label: "Toad", line: "Places with spaces, like 1 3 5 7 9 11" },
  { id: "icemario", label: "Ice Mario", line: "!a with places, !u to take one back, !penalty with a team" },
];

export const isReadsLike = (v: unknown): v is ReadsLike => READS_LIKE.some((r) => r.id === v);

export type Typed =
  | { kind: "race"; spots: ReadSpots; track: string | null }
  | { kind: "track"; track: string }
  | { kind: "back" }
  | { kind: "fix"; n: number; spots: ReadSpots | null; track: string | null }
  | { kind: "pen"; side: WarSide; points: number; reason: string }
  | { kind: "unpen"; side: WarSide; points: number | null }
  | { kind: "tag"; side: WarSide; tag: string }
  | { kind: "none" };

export interface TypedContext {
  game: WarGame;
  readsLike: ReadsLike;
  us: { tag: string; name: string | null };
  them: { tag: string; name: string | null };
  /** The server's own names for tracks, by tagKey of the nickname → track id. */
  trackNames?: Record<string, string>;
}

const NONE: Typed = { kind: "none" };

/** Full-width digits and signs (typed on Japanese keyboards; Sokuji reads them) as plain ones. */
const halfWidth = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/＋/g, "+").replace(/[ー－―−]/g, "-").replace(/％/g, "%").replace(/！/g, "!").replace(/　/g, " ");

/** A track from its code, or the server's nickname for it. */
export function trackFrom(text: string, ctx: TypedContext): string | null {
  const t = text.trim();
  if (!t || t.length > 24) return null;
  return readTrack(ctx.game, t)?.id ?? ctx.trackNames?.[tagKey(t)] ?? null;
}

/** Kiwi's way with a run of digits: 10 and 11 are places, 12 is always 1st and 2nd, any other digit is one place. */
function kiwiDigits(run: string): string {
  const out: string[] = [];
  for (let i = 0; i < run.length;) {
    const two = run.slice(i, i + 2);
    if (two === "10" || two === "11") { out.push(two); i += 2; }
    else if (two === "12") { out.push("1", "2"); i += 2; }
    else { out.push(run[i]); i += 1; }
  }
  return out.join(" ");
}

/** Places the way this server reads them: Kiwi reads every 12 as 1st and 2nd. */
export function readPlaces(text: string, readsLike: ReadsLike): ReadSpots {
  const t = text.trim();
  if (readsLike === "kiwi" && /^[0-9\s,]+$/.test(t)) return readSpots(t.split(/[\s,]+/).filter(Boolean).map(kiwiDigits).join(" "));
  return readSpots(t);
}

/** Only digits, + and - (and spaces or commas between): a message that's nothing but places. */
const PLACES_ONLY = /^[0-9+\-\s,]+$/;

/** Which team a word names: a tag or name of either team, or own/us/team (yours) and enemy/opponent/them. */
function sideOf(word: string | undefined, ctx: TypedContext): WarSide | null {
  if (!word) return null;
  const k = tagKey(word);
  if (!k) return null;
  if (["own", "us", "mine", "team", "ours", "home"].includes(k)) return "us";
  if (["enemy", "them", "opponent", "opp", "theirs", "guest", "away"].includes(k)) return "them";
  const is = (t: { tag: string; name: string | null }) => k === tagKey(t.tag) || (!!t.name && k === tagKey(t.name));
  if (is(ctx.us)) return "us";
  if (is(ctx.them)) return "them";
  return null;
}

/** The team named among a command's words: all the words together ("Twilight Zone"), else any one of them. */
function sideNamed(args: string[], ctx: TypedContext): WarSide | null {
  const words = args.filter((w) => !/^[+-]?\d{1,3}$/.test(w));
  return sideOf(words.join(" "), ctx) ?? words.map((w) => sideOf(w, ctx)).find((s) => s) ?? null;
}

const int = (s: string | undefined) => (s && /^[+-]?\d{1,3}$/.test(s) ? Number(s) : null);

/** A race number to fix: "3", or "-1" for the last one (Sokuji's newer bot counts back from the end). */
function raceNo(s: string | undefined, played: number): number | null {
  const n = int(s);
  if (n == null) return null;
  const at = n < 0 ? played + 1 + n : n;
  return at >= 1 && at <= played ? at : null;
}

/** Reads one message. `played` is how many races are in already. */
export function readTyped(raw: string, ctx: TypedContext, played: number): Typed {
  const line = halfWidth(raw).trim().replace(/\s+/g, " ");
  if (!line || line.length > 60) return NONE;
  const lower = line.toLowerCase();

  // Take the last race back: back, undo, %back, !back, !u (Ice Mario), !undo.
  if (/^[%!]?(back|undo|u)$/i.test(line) && !(lower === "u")) return { kind: "back" };

  // A command: prefix and word, then what follows.
  const cmd = /^([%!_])?([a-z]+)(?:\s+(.*))?$/i.exec(line);
  if (cmd) {
    const prefix = cmd[1] ?? "";
    const word = cmd[2].toLowerCase();
    const args = (cmd[3] ?? "").split(" ").filter(Boolean);

    // A race as a command: !a 1 2 3 7 8 12 (Ice Mario), _race 1 2 3 4 5 6 (Toad's old prefix), !r 12378.
    if ((prefix === "!" && (word === "a" || word === "r")) || (prefix === "_" && word === "race")) {
      return args.length ? { kind: "race", spots: readPlaces(args.join(" "), ctx.readsLike), track: null } : NONE;
    }

    // Fix a race: race 3 1-378, race 3 SSC (Quaxly), %race 3 12378 / %r (Sokuji), !editrace 3 [TAG] 12378 (Kiwi).
    if ((prefix === "" && word === "race") || (prefix === "%" && (word === "race" || word === "r")) || (prefix === "!" && (word === "editrace" || word === "er"))) {
      const n = raceNo(args[0], played);
      if (n == null) return NONE;
      const rest = args.slice(1).filter((a, i) => !(i === 0 && word !== "race" && sideOf(a, ctx)));
      if (!rest.length) return NONE;
      const track = rest.length === 1 && !PLACES_ONLY.test(rest[0]) ? trackFrom(rest[0], ctx) : null;
      if (track) return { kind: "fix", n, spots: null, track };
      return { kind: "fix", n, spots: readPlaces(rest.join(" "), ctx.readsLike), track: null };
    }

    // A race's track: %track 3 SSC, %t 3 SSC (Sokuji).
    if (prefix === "%" && (word === "track" || word === "t")) {
      const n = args.length >= 2 ? raceNo(args[0], played) : played;
      const track = trackFrom(args[args.length - 1] ?? "", ctx);
      return n && track ? { kind: "fix", n, spots: null, track } : NONE;
    }

    // Penalties. Quaxly: pen 15 = the other team, pen -15 = yours. Sokuji: %penalty 15 [tag], %pen, %pe = your team
    // unless a tag says otherwise; %repick [tag] = 15. Ice Mario: !penalty 15 TAG. Kiwi: !addpenalty|!ap team|opponent 15.
    const penWords = prefix === "" ? ["pen", "penalty"] : prefix === "%" ? ["penalty", "pen", "pe", "repick", "re"] : prefix === "!" ? ["penalty", "pen", "addpenalty", "ap"] : [];
    if (penWords.includes(word)) {
      const nums = args.map(int);
      const at = nums.findIndex((v) => v != null);
      const repick = word === "repick" || word === "re";
      const points = repick && at < 0 ? 15 : at >= 0 ? nums[at]! : null;
      if (points == null || points === 0 || Math.abs(points) > 200) return NONE;
      const named = sideNamed(args, ctx);
      const fallback: WarSide = prefix === "%" ? "us" : prefix === "" && points < 0 ? "us" : "them";
      return { kind: "pen", side: named ?? fallback, points: Math.abs(points), reason: repick ? "Repick" : "" };
    }
    if ((prefix === "" && word === "unpen") || (prefix === "!" && (word === "removepenalty" || word === "rp"))) {
      const nums = args.map(int).filter((v): v is number => v != null);
      const named = sideNamed(args, ctx);
      const points = nums[0] ?? null;
      return { kind: "unpen", side: named ?? (points != null && points < 0 ? "us" : "them"), points: points == null ? null : Math.abs(points) };
    }

    // A tag mid-war: %tag TAG (the other team's), %tag 1 TAG / %tag 2 TAG (Sokuji counts your team first).
    if (prefix === "%" && word === "tag" && args.length) {
      const n = args.length >= 2 ? int(args[0]) : null;
      const tag = args[args.length - 1].slice(0, 12);
      return { kind: "tag", side: n === 1 ? "us" : "them", tag };
    }
  }

  // Nothing but places: 12378, 1-378, -379, 1 3 5 7 9 11.
  if (PLACES_ONLY.test(line) && /\d/.test(line)) return { kind: "race", spots: readPlaces(line, ctx.readsLike), track: null };

  // A track on its own, or a track then places ("SSC 12378", the form's line).
  const words = line.split(" ");
  if (words.length === 1) {
    const track = trackFrom(line, ctx);
    return track ? { kind: "track", track } : NONE;
  }
  if (words.length >= 2 && PLACES_ONLY.test(words.slice(1).join(" "))) {
    const track = trackFrom(words[0], ctx);
    if (track) return { kind: "race", spots: readPlaces(words.slice(1).join(" "), ctx.readsLike), track };
  }
  return NONE;
}
