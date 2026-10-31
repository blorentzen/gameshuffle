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

import { fmtMmr, placeWord, signed } from "@/lib/mmr/rules";
import { duelHeadline } from "@/lib/originals/duel/rules";
import type { DuelPicture } from "@/lib/originals/duel/view";

export type ShareKind = "shuffle" | "dex" | "fire" | "weekly" | "day" | "supporter" | "names" | "lounge" | "duel";
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

/** Name every Pokémon: how many of the set, and how long (search pages round, 2026-10-20). */
export interface NamesPart {
  kind: "names";
  set: string;
  /** "All 1,025 Pokémon", "Gen 1 · Kanto". */
  setLabel: string;
  count: number;
  of: number;
  seconds: number;
  /** "15 minutes", "No time limit". */
  clockLabel: string;
}

/**
 * A Mario Kart lounge night (lounge night picks, 2026-10-20): a confirmed player's own night,
 * worked out on the server from MKCentral's history. The night's change, record, best event,
 * the division it ended in and any new one reached.
 */
export interface LoungePart {
  kind: "lounge";
  game: "mkworld12p" | "mkworld24p" | "mk8dx";
  /** "MK World 12P". */
  gameLabel: string;
  /** The lounge name. */
  name: string;
  /** The night's Pacific day (6am to 6am). */
  night: string;
  events: number;
  wins: number;
  losses: number;
  net: number;
  mmr: number | null;
  division: string;
  /** The highest new division reached that night. */
  newDivision: string | null;
  best: { place: number | null; delta: number; format: string } | null;
  /** The night's events oldest first: a gain, a loss, or a gain to a new season peak. */
  squares: ("w" | "l" | "p")[];
  /** "/lounge/Kevo" (with ?game= past the default game). */
  page: string;
}

/**
 * The Daily Duel (picks 2026-10-21): the server's own record of a finished duel of this player's.
 * The trainer, won or lost, turns against par, the time, and a square per card of your six. Never
 * a card's name.
 */
export interface DuelPart {
  kind: "duel";
  number: number;
  trainer: string;
  /** "Champion of Sinnoh". */
  trainerTitle: string;
  /** A practice duel (after the day's official one). */
  practice: boolean;
  won: boolean;
  turns: number;
  par: number | null;
  seconds: number | null;
  /** Your six in pack order: true while standing. */
  standing: boolean[];
  /** The trainer's cards knocked out, and how many it had. */
  knocked: number;
  team: number;
  streak: number;
  place: number | null;
  /** The trainer's picture (their own card's art, else their ace's); absent on cards made before pictures. */
  picture?: DuelPicture | null;
}

export type SharePart = PuzzlePart | FirePart | WeeklyPart | SupporterPart | NamesPart | LoungePart | DuelPart;

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
  /** Name every Pokémon: the set, the clock, the dex numbers named and the seconds used (a quiz score, self-reported). */
  names?: { set: string; clock: string; named: number[]; seconds: number };
  /** A lounge night: the lounge game and the night's day (the latest night when left out). Own confirmed player only. */
  lounge?: { game: string; night?: string | null };
  /** The Daily Duel: one of this player's finished duels (today's official one when left out). */
  duelRun?: string;
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

export const GAME_NAME: Record<"shuffle" | "dex" | "fire" | "weekly" | "names" | "duel", string> = {
  duel: "The Daily Duel",
  shuffle: "The Daily Shuffle",
  dex: "The Daily Dex",
  fire: "Fire Round",
  weekly: "The Weekly Challenge",
  names: "Name every Pokémon",
};

/** Where each game is played (the result page's Play button and the card's link pill). */
export const GAME_PATH: Record<"shuffle" | "dex" | "fire" | "weekly" | "names" | "duel", string> = {
  duel: "/daily-duel",
  shuffle: "/daily",
  dex: "/daily-dex",
  fire: "/daily-trivia",
  weekly: "/weekly",
  names: "/name-every-pokemon",
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

// ── Lounge nights ─────────────────────────────────────────────────────────

/** "5 wins, 1 loss". */
export const loungeRecord = (p: Pick<LoungePart, "wins" | "losses">) => `${p.wins} ${p.wins === 1 ? "win" : "wins"}, ${p.losses} ${p.losses === 1 ? "loss" : "losses"}`;

/** "tonight", "last night", "on Monday", "on Oct 12" for a night, from the current night's day. */
export function loungeWhen(night: string, currentNight: string): string {
  if (night === currentNight) return "tonight";
  const when = dayName(night, currentNight);
  return when === "yesterday" ? "last night" : `on ${when}`;
}

/** "Kevo went +180 tonight", "Kevo broke even last night". */
export function loungeHeadline(p: LoungePart, currentNight: string): string {
  const when = loungeWhen(p.night, currentNight);
  return p.net === 0 ? `${p.name} broke even ${when}` : `${p.name} went ${signed(p.net)} ${when}`;
}

/** The line under it: "5 wins, 1 loss in MK World 12P, into Master. Now 15,672." */
export function loungeSub(p: LoungePart): string {
  const now = p.mmr != null ? ` Now ${fmtMmr(p.mmr)}, ${p.division}.` : "";
  return `${loungeRecord(p)} in ${p.gameLabel}${p.newDivision ? `, into ${p.newDivision}` : ""}.${now}`;
}

/** "Best event: 1st, +62" (with the format past free-for-all). */
export function loungeBest(p: LoungePart): string | null {
  if (!p.best) return null;
  const place = p.best.place ? placeWord(p.best.place) : "a win";
  return `Best event: ${place}${p.best.format && p.best.format !== "FFA" ? ` (${p.best.format})` : ""}, ${signed(p.best.delta)}`;
}

/** The card's game line: "The Daily Shuffle #22", "Fire Round #1", "Fire Round · Geography, 3 minutes". */
export function partTitle(p: SharePart): string {
  if (p.kind === "duel") return `The Daily Duel${p.number >= 1 ? ` #${p.number}` : " warm-up"}${p.practice ? " · practice" : ""}`;
  if (p.kind === "lounge") return `${p.gameLabel} lounge`;
  if (p.kind === "supporter") return "Supporter";
  if (p.kind === "names") return p.set === "all" ? "Name every Pokémon" : `Name every Pokémon · ${p.setLabel}`;
  if (p.kind === "fire") return p.daily ? `Fire Round${p.number >= 1 ? ` #${p.number}` : ""}` : `Fire Round · ${p.categoryLabel}, ${p.lengthLabel.toLowerCase()}`;
  if (p.kind === "weekly") return `The Weekly Challenge${p.number >= 1 ? ` · week ${p.number}` : ""}`;
  return `${GAME_NAME[p.kind]}${p.number >= 1 ? ` #${p.number}` : ""}`;
}

/** One line for a part, used on the day card and in descriptions. */
export function partLine(p: SharePart): string {
  if (p.kind === "duel") return p.won ? `won in ${p.turns}${p.par ? ` (par ${p.par})` : ""}${p.seconds != null ? ` · ${shareTime(p.seconds)}` : ""}` : `lost · ${p.knocked} of ${p.team} out`;
  if (p.kind === "lounge") return `${signed(p.net)} · ${p.wins}-${p.losses}`;
  if (p.kind === "supporter") return supporterSince(p);
  if (p.kind === "names") return `${p.count.toLocaleString("en-US")} of ${p.of.toLocaleString("en-US")}`;
  if (p.kind === "fire") return `${p.score.toLocaleString("en-US")} · ${p.right} right`;
  if (p.kind === "weekly") return "Answered";
  const score = !p.solved ? `X/${p.main}` : p.saved ? "last chance" : `${p.guesses}/${p.main}`;
  return p.solved && p.seconds != null ? `${score} · ${shareTime(p.seconds)}` : score;
}

/** The result page's title and the picture's opening words. A card with no name on it (a guest
 *  who hasn't put a name on the boards, a private profile) leads with the result instead. */
export function shareTitle(d: ShareData): string {
  const p = d.parts[0];
  if (p?.kind === "supporter") return `${d.player?.name ?? "A supporter"} keeps game night free`;
  if (p?.kind === "lounge") return `${p.name}'s lounge night: ${signed(p.net)}, ${p.wins}-${p.losses}`;
  if (!d.player) return inviteTitle(d);
  const who = d.player.name;
  if (p?.kind === "names") return `${who} named ${p.count.toLocaleString("en-US")} of ${p.of.toLocaleString("en-US")} Pokémon`;
  if (d.kind === "day" || !p) return `${who}'s dailies today`;
  if (p.kind === "fire") return `${who} scored ${p.score.toLocaleString("en-US")} in ${partTitle(p)}`;
  if (p.kind === "duel") return p.won ? `${who} beat ${p.trainer} in ${p.turns} turns in ${partTitle(p).replace(/^The /, "the ")}` : `${who} took on ${p.trainer} in ${partTitle(p).replace(/^The /, "the ")}`;
  if (p.kind === "weekly") return `${who} answered this week's Weekly Challenge`;
  // Mid-sentence: "Nova got the Daily Dex #4 in 2".
  const t = partTitle(p).replace(/^The /, "the ");
  if (!p.solved) return `${who} played ${t}`;
  return p.saved ? `${who} saved ${t} on the last chance` : `${who} got ${t} in ${p.guesses}`;
}

/**
 * The title for a card with no name: the result and an invitation, never a stand-in person
 * ("Someone played…"). Link previews use it, so it reads well out of context.
 */
export function inviteTitle(d: ShareData): string {
  const p = d.parts[0];
  if (d.kind === "day" || !p) return "The GameShuffle dailies: can you beat these results?";
  if (p.kind === "names") return `${p.count.toLocaleString("en-US")} of ${p.of.toLocaleString("en-US")} Pokémon named. How many can you name?`;
  if (p.kind === "fire") return `${p.score.toLocaleString("en-US")} in ${partTitle(p)}. Can you beat it?`;
  if (p.kind === "duel") return p.won ? `${p.trainer} beaten in ${p.turns} turns in ${partTitle(p)}. Can you do it faster?` : `${p.trainer} won ${partTitle(p)}. Can you beat them?`;
  if (p.kind === "weekly") return "This week's Weekly Challenge is open. What's your answer?";
  if (p.kind === "supporter" || p.kind === "lounge") return `${partTitle(p)} on GameShuffle`;
  const t = partTitle(p);
  if (!p.solved) return `${t} got away. Can you crack today's?`;
  return p.saved ? `${t}, saved on the last chance. Can you do better?` : `${t} in ${p.guesses} ${p.guesses === 1 ? "guess" : "guesses"}. Can you beat it?`;
}

/** The card's lines as text (the description's body), without who played. */
export function shareLines(d: ShareData): string {
  return d.parts.map((p) => {
    if (p.kind === "lounge") return `${partTitle(p)}: ${partLine(p)}.`;
    if (p.kind === "supporter") return supporterSince(p);
    if (p.kind === "names") return `${partTitle(p)}: ${partLine(p)} named in ${shareTime(p.seconds)} (${p.clockLabel.toLowerCase()}).`;
    if (p.kind === "fire") return `${partTitle(p)}: ${p.score.toLocaleString("en-US")} points, ${p.right} right, best streak ${p.bestStreak}${p.place ? `, ${ordinalPlace(p.place)} today` : ""}.`;
    if (p.kind === "duel") return `${partTitle(p)} against ${p.trainer}: ${duelHeadline(p).toLowerCase()}${p.won && p.seconds != null ? ` in ${shareTime(p.seconds)}` : ""}, ${p.standing.filter(Boolean).length} of 6 cards left${p.streak > 1 ? `, a ${p.streak}-day streak` : ""}${p.place ? `, ${ordinalPlace(p.place)} today` : ""}.`;
    if (p.kind === "weekly") return `${partTitle(p)}: answered "${p.title}".`;
    return `${partTitle(p)}: ${puzzleHeadline(p)}${p.solved && p.seconds != null ? ` in ${shareTime(p.seconds)}` : ""}${p.streak > 1 ? `, a ${p.streak}-day streak` : ""}${p.place ? `, ${ordinalPlace(p.place)} today` : ""}.`;
  }).join(" ");
}

/** A full text description of the card, for the result page's picture (accessibility). */
export function shareAlt(d: ShareData): string {
  const lp = d.parts[0];
  if (lp?.kind === "lounge") {
    const best = loungeBest(lp);
    return `${lp.name}'s Mario Kart lounge night in ${lp.gameLabel}: ${signed(lp.net)} MMR, ${loungeRecord(lp)} in ${lp.events} ${lp.events === 1 ? "event" : "events"}.${lp.newDivision ? ` Into ${lp.newDivision}.` : ""}${lp.mmr != null ? ` Now ${fmtMmr(lp.mmr)}, ${lp.division}.` : ""}${best ? ` ${best}.` : ""}`;
  }
  if (d.parts[0]?.kind === "supporter") return `${d.player ? `${d.player.name} supports GameShuffle` : "Someone supports GameShuffle"}: keeping game night free. ${supporterSince(d.parts[0])}.`;
  const pic = d.kind !== "day" && d.parts[0]?.kind === "duel" ? d.parts[0].picture : null;
  return `${d.player ? `${d.player.name} on GameShuffle. ` : "A result shared from GameShuffle. "}${shareLines(d)}${pic ? ` With the picture of ${pic.alt}.` : ""}`;
}

/**
 * The shared result page as a challenge (picks 2026-10-20): its header and the line under it.
 * A result from today says "Your turn."; an older one names its day ("Nova got Monday's in 2.").
 */
export function challengeWho(d: ShareData): string | null {
  return d.player?.name ?? null;
}

/** "Monday" for a day in the last week, else "Oct 12". Days are Pacific dates (YYYY-MM-DD). */
export function dayName(day: string, today: string): string {
  const at = (s: string) => Date.parse(`${s}T12:00:00Z`);
  const ago = Math.round((at(today) - at(day)) / 86_400_000);
  if (ago === 1) return "yesterday";
  const d = new Date(at(day));
  return ago > 1 && ago < 7
    ? d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const possessive = (when: string) => (when === "yesterday" ? "yesterday's" : `${when}'s`);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The header for a card with no name: the result, then "Your turn." */
function inviteHeader(d: ShareData, today: string): string {
  const p = d.parts[0];
  const now = d.day === today;
  const when = dayName(d.day, today);
  if (p?.kind === "names") return `${p.count.toLocaleString("en-US")} of ${p.of.toLocaleString("en-US")} named. Your turn.`;
  if (d.kind === "day" || !p) return now ? "Today's dailies, played. Your turn." : `${cap(possessive(when))} dailies.`;
  if (p.kind === "fire") {
    const score = p.score.toLocaleString("en-US");
    if (!p.daily) return `${score} in ${p.categoryLabel}. Your turn.`;
    return now ? `${score} points today. Your turn.` : `${score} points ${when === "yesterday" ? "yesterday" : `on ${when}`}.`;
  }
  if (p.kind === "weekly") return "This week's question is open. Your turn.";
  if (p.kind === "supporter") return shareTitle(d);
  // A lounge card always names its own lounge player, whoever's account made it.
  if (p.kind === "lounge") return `${loungeHeadline(p, today)}.`;
  if (p.kind === "duel") {
    if (now) return p.won ? `${p.trainer} beaten in ${p.turns} turns. Your turn.` : `${p.trainer} won today's duel. Your turn.`;
    return p.won ? `${cap(possessive(when))} duel, won in ${p.turns} turns.` : `${cap(possessive(when))} duel got away.`;
  }
  if (now) return !p.solved ? "Today's got away. Your turn." : p.saved ? "Saved on the last chance. Your turn." : `Solved in ${p.guesses}. Your turn.`;
  const day = cap(possessive(when));
  return !p.solved ? `${day} got away.` : p.saved ? `${day}, saved on the last chance.` : `${day}, solved in ${p.guesses}.`;
}

export function challengeTitle(d: ShareData, today: string): string {
  const who = challengeWho(d);
  if (!who) return inviteHeader(d, today);
  const p = d.parts[0];
  const now = d.day === today;
  const when = dayName(d.day, today);
  if (!p) return `${who} played the dailies`;
  if (p.kind === "names") return `${who} named ${p.count.toLocaleString("en-US")} of ${p.of.toLocaleString("en-US")}. Your turn.`;
  if (d.kind === "day") return now ? `${who} played today's dailies. Your turn.` : `${who} played ${possessive(when)} dailies.`;
  if (p.kind === "fire") {
    const score = p.score.toLocaleString("en-US");
    if (!p.daily) return `${who} scored ${score} in ${p.categoryLabel}. Your turn.`;
    return now ? `${who} scored ${score}. Your turn.` : `${who} scored ${score} ${when === "yesterday" ? "yesterday" : `on ${when}`}.`;
  }
  if (p.kind === "weekly") return `${who} answered the Weekly Challenge. Your turn.`;
  if (p.kind === "supporter") return shareTitle(d);
  if (p.kind === "lounge") return `${loungeHeadline(p, today)}.`;
  if (p.kind === "duel") {
    if (now) return p.won ? `${who} beat ${p.trainer} in ${p.turns} turns. Your turn.` : `${who} lost to ${p.trainer}. Your turn.`;
    const on = when === "yesterday" ? "yesterday" : `on ${when}`;
    return p.won ? `${who} beat ${p.trainer} ${on} in ${p.turns} turns.` : `${who} lost to ${p.trainer} ${on}.`;
  }
  if (now) return !p.solved ? `${who} didn't get today's. Your turn.` : p.saved ? `${who} saved it on the last chance. Your turn.` : `${who} got it in ${p.guesses}. Your turn.`;
  const day = possessive(when);
  return !p.solved ? `${who} missed ${day}.` : p.saved ? `${who} saved ${day} on the last chance.` : `${who} got ${day} in ${p.guesses}.`;
}

export function challengeSub(d: ShareData, today: string): string {
  const p = d.parts[0];
  const now = d.day === today;
  if (p?.kind === "lounge") return loungeSub(p);
  if (p?.kind === "names") return "Type as many Pokémon as you can before the clock runs out.";
  if (d.kind === "day") return now ? "Start with the Daily Shuffle. The same puzzles for everyone today." : "Today's puzzles are new, and the same for everyone. Start with the Daily Shuffle.";
  if (p?.kind === "fire") return p.daily && !now ? "Today's round is new: 60 seconds, the same questions for everyone. Your turn." : "Today's round: 60 seconds of trivia, the same questions for everyone.";
  if (p?.kind === "weekly") return "One question for everyone this week. The crowd's answers are revealed on Monday.";
  if (p?.kind === "duel") return now ? "The same six cards for everyone today. Knock out every card on the trainer's team." : "Today's duel is new: a new trainer, and the same six cards for everyone.";
  const thing = p?.kind === "dex" ? "Pokémon" : "character";
  return now ? `Same ${thing} for everyone today.` : `Today's ${thing} is new, and the same for everyone. Your turn.`;
}
