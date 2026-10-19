/**
 * Share cards (Britton's picks, 2026-10-19, https://claude.ai/artifact/9JxKKcAJj1L8m5pZgqg7kD,
 * every answer as recommended): one Share button that hands a picture of the player's result,
 * the link and the squares to the phone's share sheet (our share window where there isn't one),
 * and a short result page gameshuffle.co/r/<code> whose link preview is that card.
 *
 * Client-safe: the card's data as the server worked it out (src/lib/share/store.ts) and the
 * words drawn on it, reused for the result page's title and the picture's alt text. Squares only,
 * never the answer.
 */

export type ShareKind = "shuffle" | "dex" | "fire" | "weekly" | "day" | "supporter";
export type ShareCell = "match" | "close" | "miss";

/** Who's on the card: an account with a public profile, or a guest's leaderboard name. Null = the guest card with no name. */
export interface SharePlayer {
  name: string;
  avatar: string | null;
  /** "/u/username" for an account. */
  profile: string | null;
  guest: boolean;
}

/** A signed-in player's own background (their banner, else their color theme); null = the game's colors. */
export interface ShareBackground {
  banner: string | null;
  /** A CSS gradient from their brand theme. */
  theme: string | null;
}

export interface PuzzlePart {
  kind: "shuffle" | "dex";
  number: number;
  /** One row of cells per guess (single-game cards); empty on the day card, which draws a square per guess. */
  rows: ShareCell[][];
  cols: number;
  guesses: number;
  main: number;
  solved: boolean;
  /** Solved on the last chance (or with bought guesses). */
  saved: boolean;
  seconds: number | null;
  streak: number;
  place: number | null;
}

export interface FirePart {
  kind: "fire";
  /** Today's round (true) or a More rounds round. */
  daily: boolean;
  number: number;
  score: number;
  right: number;
  bestStreak: number;
  categoryLabel: string;
  lengthLabel: string;
  streak: number;
  place: number | null;
}

export interface WeeklyPart {
  kind: "weekly";
  number: number;
  title: string;
}

/** A supporter's card (picks 2026-10-19): since when, and whether monthly. Never an amount. */
export interface SupporterPart {
  kind: "supporter";
  /** The first time they gave (ISO). */
  since: string;
  monthly: boolean;
}

export type SharePart = PuzzlePart | FirePart | WeeklyPart | SupporterPart;

export interface ShareData {
  v: 1;
  kind: ShareKind;
  day: string;
  player: SharePlayer | null;
  background: ShareBackground | null;
  parts: SharePart[];
  /** The sharer's invite code: the result page's Play button carries it. */
  referral: string | null;
}

/** What the client sends to make a card. Guesses are names, judged again on the server. */
export interface ShareRequest {
  kind: ShareKind;
  shuffle?: string[];
  dex?: string[];
  fireRun?: string;
  /** Supporter card for someone who gave signed out: the Checkout session from the thank-you page. */
  session?: string;
}

/** POST /api/share's answer. */
export interface ShareMade {
  code: string;
  /** https://www.gameshuffle.co/r/<code> */
  url: string;
  /** Bumps when the card changes, for the picture's address. */
  version: number;
  alt: string;
}

export const GAME_NAME: Record<"shuffle" | "dex" | "fire" | "weekly", string> = {
  shuffle: "The Daily Shuffle",
  dex: "The Daily Dex",
  fire: "Fire Round",
  weekly: "The Weekly Challenge",
};

/** Where each game is played (the result page's Play button and the card's link pill). */
export const GAME_PATH: Record<"shuffle" | "dex" | "fire" | "weekly", string> = {
  shuffle: "/daily",
  dex: "/daily-dex",
  fire: "/daily-trivia",
  weekly: "/weekly",
};

/** One word per score, like the Discord results card. */
const VIBES = ["Psychic", "Sharp", "Solid", "Steady", "Close call", "Phew"];

export function ordinalPlace(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export function shareTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Got it in 3", "Saved on the last chance", "Not today". */
export function puzzleHeadline(p: PuzzlePart): string {
  if (!p.solved) return "Not today";
  return p.saved ? "Saved it on the last chance" : p.guesses === 1 ? "Got it in 1" : `Got it in ${p.guesses}`;
}

export function puzzleVibe(p: PuzzlePart): string {
  if (!p.solved) return "Better luck tomorrow";
  if (p.saved) return "Phew";
  return VIBES[Math.min(VIBES.length - 1, p.guesses - 1)];
}

/** "Supporter since October 2026" / "Monthly supporter since October 2026". */
export function supporterSince(p: SupporterPart): string {
  const when = new Date(p.since).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" });
  return `${p.monthly ? "Monthly supporter" : "Supporter"} since ${when}`;
}

/** The card's game line: "The Daily Shuffle #22", "Fire Round #1", "Fire Round · Geography, 3 minutes". */
export function partTitle(p: SharePart): string {
  if (p.kind === "supporter") return "Supporter";
  if (p.kind === "fire") return p.daily ? `Fire Round${p.number >= 1 ? ` #${p.number}` : ""}` : `Fire Round · ${p.categoryLabel}, ${p.lengthLabel.toLowerCase()}`;
  if (p.kind === "weekly") return `The Weekly Challenge${p.number >= 1 ? ` · week ${p.number}` : ""}`;
  return `${GAME_NAME[p.kind]}${p.number >= 1 ? ` #${p.number}` : ""}`;
}

/** One line for a part, used on the day card and in descriptions. */
export function partLine(p: SharePart): string {
  if (p.kind === "supporter") return supporterSince(p);
  if (p.kind === "fire") return `${p.score.toLocaleString("en-US")} · ${p.right} right`;
  if (p.kind === "weekly") return "Answered";
  const score = !p.solved ? `X/${p.main}` : p.saved ? "last chance" : `${p.guesses}/${p.main}`;
  return p.solved && p.seconds != null ? `${score} · ${shareTime(p.seconds)}` : score;
}

/** The result page's title and the picture's opening words. */
export function shareTitle(d: ShareData): string {
  const who = d.player?.name ?? "Someone";
  const p = d.parts[0];
  if (p?.kind === "supporter") return `${d.player?.name ?? "A supporter"} keeps game night free`;
  if (d.kind === "day" || !p) return `${who}'s dailies today`;
  if (p.kind === "fire") return `${who} scored ${p.score.toLocaleString("en-US")} in ${partTitle(p)}`;
  if (p.kind === "weekly") return `${who} answered this week's Weekly Challenge`;
  // Mid-sentence: "Nova got the Daily Dex #4 in 2".
  const t = partTitle(p).replace(/^The /, "the ");
  if (!p.solved) return `${who} played ${t}`;
  return p.saved ? `${who} saved ${t} on the last chance` : `${who} got ${t} in ${p.guesses}`;
}

/** A full text description of the card, for the result page's picture (accessibility). */
export function shareAlt(d: ShareData): string {
  if (d.parts[0]?.kind === "supporter") return `${d.player ? `${d.player.name} supports GameShuffle` : "Someone supports GameShuffle"}: keeping game night free. ${supporterSince(d.parts[0])}.`;
  const lines = d.parts.map((p) => {
    if (p.kind === "supporter") return supporterSince(p);
    if (p.kind === "fire") return `${partTitle(p)}: ${p.score.toLocaleString("en-US")} points, ${p.right} right, best streak ${p.bestStreak}${p.place ? `, ${ordinalPlace(p.place)} today` : ""}.`;
    if (p.kind === "weekly") return `${partTitle(p)}: answered "${p.title}".`;
    return `${partTitle(p)}: ${puzzleHeadline(p)}${p.solved && p.seconds != null ? ` in ${shareTime(p.seconds)}` : ""}${p.streak > 1 ? `, a ${p.streak}-day streak` : ""}${p.place ? `, ${ordinalPlace(p.place)} today` : ""}.`;
  });
  return `${d.player ? `${d.player.name} on GameShuffle. ` : "A GameShuffle result. "}${lines.join(" ")}`;
}
