/**
 * Chat Brain on stream: the pure rules for a game (no I/O, client-safe).
 * Spec: specs/gs-originals-chat-brain-stream.md (Chat plays, chat's answer,
 * play along). The store (streamGame.ts) feeds these the guesses and the board.
 *
 *   chat's answer   whatever most of chat said in the window: every guess goes
 *                   to the board answer it matches (revealed or not) or to its
 *                   own spelling group, and the biggest group wins. Ties: the
 *                   group whose latest guess came in first.
 *   the result      an unrevealed board answer is a hit (bank its points);
 *                   anything else, an empty window included, is a strike.
 *   play along      every viewer's own guess is scored too: an answer that was
 *                   still hidden when the window opened earns that viewer its
 *                   points, once per answer per board.
 */

import { isNear, matchGuess, normalize, type BoardAnswer } from "./rules";

export const STRIKES_PER_BOARD = 3;
export const GUESS_SECONDS = [15, 30, 45, 60] as const;
export type GuessSeconds = (typeof GUESS_SECONDS)[number];
export const DEFAULT_GUESS_SECONDS: GuessSeconds = 30;
export const BOARDS_PER_GAME = { min: 1, max: 5, default: 3 } as const;
/** The beat between a reveal and the next guess, so chat sees what happened. */
export const REVEAL_PAUSE_MS = 6000;
/** How long the host can overrule the last result. */
export const OVERRULE_MS = 30_000;
/** Leaning only shows groups this big, so one viewer can't put text on stream. */
export const LEANING_MIN = 2;

export interface StreamGuess {
  /** platform:viewer id, one guess each per window. */
  viewer: string;
  name: string | null;
  raw: string;
  normalized: string;
  at: number;
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
  /** The board answer this group matches (revealed or not), else null. */
  rank: number | null;
  /** When the group's latest guess came in (ties go to the earliest). */
  lastAt: number;
}

export interface ChatAnswer {
  label: string;
  count: number;
  total: number;
  share: number;
  rank: number | null;
}

export type WindowOutcome =
  | { result: "hit"; rank: number; points: number; label: string }
  | { result: "miss"; reason: "not_on_board" | "already"; label: string }
  | { result: "empty" };

export function isGuessSeconds(n: number): n is GuessSeconds {
  return (GUESS_SECONDS as readonly number[]).includes(n);
}

/** Group a window's guesses: board answers by rank, everything else by spelling. */
export function buckets(guesses: StreamGuess[], board: BoardAnswer[]): Bucket[] {
  const out = new Map<string, Bucket & { raws: Map<string, number> }>();
  const loose: string[] = [];
  for (const g of guesses) {
    if (!g.normalized) continue;
    const hit = matchGuess(g.normalized, board, []);
    let key: string;
    if (hit) key = `#${hit.rank}`;
    else key = loose.find((k) => k === g.normalized || isNear(k, g.normalized)) ?? (loose.push(g.normalized), g.normalized);
    const b = out.get(key) ?? { key, label: hit?.label ?? "", count: 0, rank: hit?.rank ?? null, lastAt: 0, raws: new Map<string, number>() };
    b.count += 1;
    b.lastAt = Math.max(b.lastAt, g.at);
    if (!hit) b.raws.set(g.raw, (b.raws.get(g.raw) ?? 0) + 1);
    out.set(key, b);
  }
  return [...out.values()]
    .map(({ raws, ...b }) => ({
      ...b,
      label: b.rank !== null ? b.label : [...raws.entries()].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0]?.[0] ?? b.key,
    }))
    .sort((x, y) => y.count - x.count || x.lastAt - y.lastAt);
}

/** Chat's answer for a window, or null when nobody guessed. */
export function chatAnswer(guesses: StreamGuess[], board: BoardAnswer[]): ChatAnswer | null {
  const groups = buckets(guesses, board);
  const top = groups[0];
  if (!top) return null;
  const total = groups.reduce((n, g) => n + g.count, 0);
  return { label: top.label, count: top.count, total, share: total ? top.count / total : 0, rank: top.rank };
}

export function outcomeFor(answer: ChatAnswer | null, board: BoardAnswer[], revealed: number[]): WindowOutcome {
  if (!answer) return { result: "empty" };
  if (answer.rank === null) return { result: "miss", reason: "not_on_board", label: answer.label };
  if (revealed.includes(answer.rank)) return { result: "miss", reason: "already", label: answer.label };
  const a = board.find((b) => b.rank === answer.rank)!;
  return { result: "hit", rank: a.rank, points: a.points, label: a.label };
}

/** The board is over: everything found, or three strikes. */
export function boardOver(board: BoardAnswer[], revealed: number[], strikes: number): boolean {
  return board.every((b) => revealed.includes(b.rank)) || strikes >= STRIKES_PER_BOARD;
}

/** What chat is leaning toward right now: the top groups of at least LEANING_MIN viewers. */
export function leaning(guesses: StreamGuess[], board: BoardAnswer[], top = 3): { label: string; count: number; share: number }[] {
  const groups = buckets(guesses, board);
  const total = groups.reduce((n, g) => n + g.count, 0);
  return groups.filter((g) => g.count >= LEANING_MIN).slice(0, top).map((g) => ({ label: g.label, count: g.count, share: total ? g.count / total : 0 }));
}

/**
 * Play-along points for one window. `hiddenAtOpen` = board ranks not yet
 * revealed when the window opened; `earned` = ranks each viewer already
 * scored on this board. Returns the new awards (viewer → rank).
 */
export function playAlongAwards(
  guesses: StreamGuess[],
  board: BoardAnswer[],
  hiddenAtOpen: number[],
  earned: Map<string, Set<number>>,
): Map<string, { rank: number; points: number; name: string | null }> {
  const found = board.filter((b) => !hiddenAtOpen.includes(b.rank)).map((b) => b.rank);
  const awards = new Map<string, { rank: number; points: number; name: string | null }>();
  for (const g of guesses) {
    const hit = matchGuess(g.normalized, board, found);
    if (!hit || earned.get(g.viewer)?.has(hit.rank)) continue;
    awards.set(g.viewer, { rank: hit.rank, points: hit.points, name: g.name });
  }
  return awards;
}

const shout = (s: string) => s.toUpperCase();

/** The chat line for a window's result. */
export function resultLine(o: WindowOutcome, ctx: { strikes: number; score: number }): string {
  const strikes = `✖ Strike ${ctx.strikes}.`;
  switch (o.result) {
    case "hit": return `🧠 Chat said ${shout(o.label)}: #${o.rank} on the board, ${o.points} points! (${ctx.score} so far)`;
    case "empty": return `🧠 Nobody answered. ${strikes} Answer with !a <your answer>.`;
    default:
      return o.reason === "already"
        ? `🧠 Chat said ${shout(o.label)} again: it's already up there. ${strikes}`
        : `🧠 Chat said ${shout(o.label)}: not on the board. ${strikes}`;
  }
}

/** The line when a board ends. `rest` = answers revealed without points. */
export function boardEndLine(i: { cleared: boolean; strikes: number; boardPoints: number; rest: BoardAnswer[]; last: boolean }): string {
  const head = i.cleared
    ? `🧠 Board cleared! Chat found them all for ${i.boardPoints} points${i.strikes === 0 ? " with no strikes. Perfect board!" : "."}`
    : `🧠 Three strikes! Chat banked ${i.boardPoints} on this board.`;
  const rest = i.rest.length ? ` The rest: ${i.rest.map((r) => `#${r.rank} ${r.label}`).join(", ")}.` : "";
  return `${head}${rest}${i.last ? "" : " Mods: !cb next for the next board."}`.slice(0, 480);
}

/** "Sam 48 (+50 tokens)" for a viewer on the final line. */
const withTokens = (t: { name: string; points: number; tokens?: number }) => `${t.name} ${t.points}${t.tokens ? ` (+${t.tokens} tokens)` : ""}`;

export function finalLine(i: { score: number; boards: number; top: { name: string; points: number; tokens?: number }[]; speed?: boolean }): string {
  const top = i.top.length ? ` ${i.speed ? "Fastest brains" : "Top brains"}: ${i.top.map(withTokens).join(", ")}.` : "";
  return `🧠 Game over! Chat ${i.speed ? "found" : "scored"} ${i.score} points over ${i.boards} board${i.boards === 1 ? "" : "s"}.${top}`.slice(0, 480);
}

// ─── 1v1 and Teams (two player sides; spec "1v1 and Teams") ──────────────────
//
// A round per board: a face-off decides control, the side in control answers
// until the board is cleared or three strikes, then the other side gets one
// answer to steal. Every answer from a side goes into the round's pot; the
// winner of the round banks the pot (double in the last round of a game of 2+
// rounds). Players say their answers out loud and the host types them in.
// Chat plays along on every turn (a shadow window), and can be the advisor
// ("Trust chat?") and the last steal when the host turns them on.

export const VERSUS_ROUNDS = { min: 1, max: 6, default: 4 } as const;
/** Face-off tries before the host picks who plays. */
export const FACEOFF_ATTEMPTS = 3;
/** How long the host can take back the last answer they entered. */
export const UNDO_MS = 60_000;
export const SIDE_NAME_MAX = 24;
export const PLAYER_NAME_MAX = 24;
export const TEAM_SIZE = { min: 2, max: 5 } as const;

export type VersusMode = "versus" | "teams";

/** One side's answer, judged against the board (the host typed it). */
export function playerOutcome(raw: string, board: BoardAnswer[], revealed: number[]): WindowOutcome {
  const label = raw.trim().replace(/\s+/g, " ");
  if (!normalize(label)) return { result: "empty" };
  const hit = matchGuess(label, board, []);
  if (!hit) return { result: "miss", reason: "not_on_board", label };
  if (revealed.includes(hit.rank)) return { result: "miss", reason: "already", label: hit.label };
  return { result: "hit", rank: hit.rank, points: hit.points, label: hit.label };
}

/**
 * The face-off. The first side to answer wins straight away with the top
 * hidden answer; otherwise the other side answers too and the higher answer
 * (lower rank) wins. "wait" = the second side still has to answer; "again" =
 * both missed.
 */
export function faceoffWinner(first: WindowOutcome, second: WindowOutcome | null, topHidden: number): "first" | "second" | "wait" | "again" {
  if (first.result === "hit" && first.rank === topHidden) return "first";
  if (!second) return "wait";
  const a = first.result === "hit" ? first.rank : null;
  const b = second.result === "hit" ? second.rank : null;
  if (a !== null && b !== null) return a <= b ? "first" : "second";
  if (a !== null) return "first";
  if (b !== null) return "second";
  return "again";
}

/** Did the side and chat say the same thing? Then there's nothing to choose between. */
export function sameAnswer(sideRaw: string, chat: ChatAnswer, board: BoardAnswer[]): boolean {
  const side = matchGuess(sideRaw, board, []);
  if (side && chat.rank !== null) return side.rank === chat.rank;
  if (side || chat.rank !== null) return false;
  const a = normalize(sideRaw);
  const b = normalize(chat.label);
  return !!a && (a === b || isNear(a, b));
}

/** "Trust chat?" comes up on a side's final guess (two strikes) and on a steal. */
export function advisorMoment(kind: string, strikes: number): boolean {
  return kind === "steal" || (kind === "guess" && strikes === STRIKES_PER_BOARD - 1);
}

/** Chat gets the last steal when it's on, the steal missed, and the side didn't already use chat's answer. */
export function lastStealOpen(i: { enabled: boolean; stealHit: boolean; trusted: "side" | "chat" | null }): boolean {
  return i.enabled && !i.stealHit && i.trusted !== "chat";
}

/** The last round of a game of two or more rounds is worth double. */
export function roundMultiplier(roundIndex: number, rounds: number): number {
  return rounds >= 2 && roundIndex === rounds - 1 ? 2 : 1;
}

/** Who answers next for a side: its players take turns. */
export function onClock(members: string[], turnNumber: number): string | null {
  return members.length ? members[((turnNumber % members.length) + members.length) % members.length] : null;
}

export interface SideInput { name: string; members: string[] }
export type SidesResult = { ok: true; sides: [SideInput, SideInput] } | { ok: false; error: "bad_sides" | "same_names" | "team_size" };

/**
 * Tidy the two sides from the start form. 1v1: one player a side, named after
 * the player. Teams: 2 to 5 players a side, with a team name (else "Team 1").
 */
export function cleanSides(mode: VersusMode, input: SideInput[]): SidesResult {
  if (input.length !== 2) return { ok: false, error: "bad_sides" };
  const tidy = (s: string, max: number) => s.trim().replace(/\s+/g, " ").slice(0, max);
  const sides = input.map((s, i) => {
    const members = [...new Set((s.members ?? []).map((m) => tidy(m, PLAYER_NAME_MAX)).filter(Boolean))];
    const name = tidy(s.name ?? "", SIDE_NAME_MAX) || (mode === "versus" ? members[0] ?? "" : `Team ${i + 1}`);
    return { name, members: mode === "versus" ? [members[0] || name] : members };
  });
  if (sides.some((s) => !s.name || !s.members[0])) return { ok: false, error: "bad_sides" };
  if (sides[0].name.toLowerCase() === sides[1].name.toLowerCase()) return { ok: false, error: "same_names" };
  if (mode === "teams" && sides.some((s) => s.members.length < TEAM_SIZE.min || s.members.length > TEAM_SIZE.max)) return { ok: false, error: "team_size" };
  return { ok: true, sides: [sides[0], sides[1]] };
}

/** The other player side. */
export const otherSide = (team: number): number => (team === 1 ? 2 : 1);

const said = (who: string, o: WindowOutcome) =>
  o.result === "hit" ? `${who} says ${shout(o.label)}: #${o.rank} on the board!`
    : o.result === "empty" ? `${who} passes.`
    : o.reason === "already" ? `${who} says ${shout(o.label)}: it's already up there.`
    : `${who} says ${shout(o.label)}: not on the board.`;

/** The chat line for one side's answer. `next` finishes it (what happens now). */
export function answerLine(who: string, o: WindowOutcome, next = ""): string {
  return `🧠 ${said(who, o)}${next ? ` ${next}` : ""}`.slice(0, 480);
}

export function versusQuestionLine(i: { round: number; rounds: number; question: string; sides: [string, string]; double: boolean; faceoff: [string, string] }): string {
  const head = i.rounds > 1 ? `Round ${i.round + 1} of ${i.rounds}${i.double ? " (double points!)" : ""}: ` : "";
  return `🧠 ${head}${i.question}  ▸  Face-off: ${i.faceoff[0]} vs ${i.faceoff[1]}. Chat, play along with !a <your answer>.`.slice(0, 480);
}

export type BankReason = "cleared" | "stole" | "held" | "chat" | "skipped";

export interface AdviceRecap { side: string; trusted: "side" | "chat"; chatLabel: string; chatHit: boolean; chatRank: number | null }

export function roundEndLine(i: {
  winner: string | null; reason: BankReason; points: number; double: boolean; rest: BoardAnswer[];
  scores: { name: string; score: number }[]; advice: AdviceRecap[]; last: boolean;
}): string {
  const pts = `${i.points} point${i.points === 1 ? "" : "s"}${i.double ? " (doubled)" : ""}`;
  const head = i.reason === "cleared" ? `${i.winner} cleared the board and banks ${pts}!`
    : i.reason === "stole" ? `${i.winner} steals it for ${pts}!`
    : i.reason === "held" ? `No steal! ${i.winner} banks ${pts}.`
    : i.reason === "chat" ? `Chat stole it for ${pts}!`
    : "Round skipped.";
  const advice = i.advice.map((a) => ` ${a.side} went with ${a.trusted === "chat" ? "chat" : "their own answer"}; chat said ${shout(a.chatLabel)} (${a.chatHit && a.chatRank ? `#${a.chatRank}` : "not on the board"}).`).join("");
  const rest = i.rest.length ? ` The rest: ${i.rest.map((r) => `#${r.rank} ${r.label}`).join(", ")}.` : "";
  const scores = ` Score: ${i.scores.map((s) => `${s.name} ${s.score}`).join(" · ")}.`;
  return `🧠 ${head}${advice}${rest}${scores}${i.last ? "" : " Next round coming up."}`.slice(0, 480);
}

export function versusFinalLine(i: { sides: { name: string; score: number }[]; chatScore: number; chatRight: { right: number; asked: number }; top: { name: string; points: number; tokens?: number }[] }): string {
  const [a, b] = i.sides;
  const head = a.score === b.score ? `It's a tie at ${a.score}!`
    : `${(a.score > b.score ? a : b).name} wins, ${Math.max(a.score, b.score)} to ${Math.min(a.score, b.score)}!`;
  const chat = i.chatScore > 0 ? ` Chat stole ${i.chatScore} points.` : "";
  const right = i.chatRight.asked ? ` Chat was right ${i.chatRight.right} of ${i.chatRight.asked} time${i.chatRight.asked === 1 ? "" : "s"} it was asked.` : "";
  const top = i.top.length ? ` Top brains in chat: ${i.top.map(withTokens).join(", ")}.` : "";
  return `🧠 Game over! ${head}${chat}${right}${top}`.slice(0, 480);
}

// ─── Speed round (spec "Speed round") ────────────────────────────────────────
//
// No guess windows: the board is open, and the first viewer whose `!a` matches
// a hidden answer reveals it and takes its points. Every find restarts a
// 20-second timer; when it runs out with no find, that's a strike. Three
// strikes or a cleared board ends it. First to answer wins, so it suits
// low-latency streams best.

/** Seconds between finds before a strike. */
export const SPEED_SECONDS = 20;

export function speedQuestionLine(i: { index: number; count: number; question: string }): string {
  return `🧠 SPEED ROUND${i.count > 1 ? `, board ${i.index + 1} of ${i.count}` : ""}: ${i.question}  ▸  first to find an answer with !a gets its points. ${SPEED_SECONDS}s between finds or it's a strike!`.slice(0, 480);
}

export function findLine(i: { name: string; rank: number; label: string; points: number; left: number }): string {
  const tail = i.left > 0 ? ` ${i.left} still hidden, ${SPEED_SECONDS}s to find the next.` : "";
  return `🧠 ${i.name} found #${i.rank} ${shout(i.label)} for ${i.points}!${tail}`.slice(0, 480);
}

export function speedStrikeLine(i: { strikes: number; left: number }): string {
  return `🧠 ${SPEED_SECONDS} seconds with no find: ✖ Strike ${i.strikes}. ${i.left} still hidden, the timer starts again.`;
}

// ─── Prize for the top brains ────────────────────────────────────────────────
//
// The host can put up a token prize when starting a game. At the end it's
// split between the top three viewers by points (play-along points, or what
// they found in a speed round): 50/30/20, or 60/40 with two, all of it with
// one. Viewers tied on points share the places they cover; nobody past third
// place gets anything, and nobody with 0 points. Paid from the streamer's
// monthly allowance.

export const PRIZE_CHOICES = [0, 25, 50, 100, 250, 500] as const;
export const PRIZE_MAX = 5000;

const PLACE_SHARES: Record<number, number[]> = { 1: [1], 2: [0.6, 0.4], 3: [0.5, 0.3, 0.2] };

/** Each viewer's cut of the prize (key → tokens). Whole tokens; leftovers go to the top of the table. */
export function prizeSplit(prize: number, standings: { key: string; points: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const total = Math.max(0, Math.floor(prize));
  const scored = standings.filter((s) => s.points > 0).sort((a, b) => b.points - a.points);
  if (!total || !scored.length) return out;
  const shares = PLACE_SHARES[Math.min(3, scored.length)];
  // Group ties; a group covering places i..j shares whichever of those are in the top three.
  let place = 0;
  const cuts: { key: string; share: number }[] = [];
  for (let i = 0; i < scored.length && place < shares.length; ) {
    let j = i;
    while (j + 1 < scored.length && scored[j + 1].points === scored[i].points) j += 1;
    const size = j - i + 1;
    const groupShare = shares.slice(place, place + size).reduce((n, s) => n + s, 0);
    for (let k = i; k <= j; k += 1) cuts.push({ key: scored[k].key, share: groupShare / size });
    place += size;
    i = j + 1;
  }
  let given = 0;
  for (const c of cuts) {
    const n = Math.floor(total * c.share);
    out.set(c.key, n);
    given += n;
  }
  // Rounding leftovers, one token at a time from the top.
  for (let i = 0; given < total && cuts.length; i = (i + 1) % cuts.length) {
    out.set(cuts[i].key, (out.get(cuts[i].key) ?? 0) + 1);
    given += 1;
  }
  for (const [k, v] of out) if (v <= 0) out.delete(k);
  return out;
}

// ─── Co-stream (two chat sides; spec "Co-stream") ─────────────────────────────
//
// Two channels' chats, one team each. A round per board: a face-off window
// open to both chats at once (each chat's answer counted separately; the
// higher hit wins control; both on the same answer = the chat that found it
// first; neither = again, up to three tries, then the host picks), then guess
// windows for the chat in control until the board is cleared or three
// strikes, then one steal window for the other chat. The round's pot goes to
// the winner, doubled in the last round of two or more.

export const COSTREAM_ROUNDS = { min: 2, max: 6, default: 4 } as const;

/** One chat's face-off: its answer, what it scored, and when that chat first typed the answer it scored with. */
export interface FaceoffSide { team: number; outcome: WindowOutcome; firstAt: number | null }

export type CostreamFaceoff =
  | { result: "won"; winner: number; reveals: { team: number; rank: number; points: number }[] }
  | { result: "again" };

/**
 * Who wins a co-stream face-off. Hits on different answers both reveal and the
 * higher one (lower rank) wins; the same answer reveals once, for the chat
 * that typed it first; no hits = again.
 */
export function costreamFaceoff(a: FaceoffSide, b: FaceoffSide): CostreamFaceoff {
  const hitA = a.outcome.result === "hit" ? a.outcome : null;
  const hitB = b.outcome.result === "hit" ? b.outcome : null;
  if (!hitA && !hitB) return { result: "again" };
  if (hitA && hitB && hitA.rank === hitB.rank) {
    const first = (a.firstAt ?? Infinity) <= (b.firstAt ?? Infinity) ? a : b;
    return { result: "won", winner: first.team, reveals: [{ team: first.team, rank: hitA.rank, points: hitA.points }] };
  }
  const reveals = [hitA && { team: a.team, rank: hitA.rank, points: hitA.points }, hitB && { team: b.team, rank: hitB.rank, points: hitB.points }]
    .filter((r): r is { team: number; rank: number; points: number } => !!r);
  const winner = hitA && hitB ? (hitA.rank < hitB.rank ? a.team : b.team) : hitA ? a.team : b.team;
  return { result: "won", winner, reveals };
}

/** When a chat first typed an answer matching this board rank (for face-off ties). */
export function firstMatchAt(guesses: StreamGuess[], board: BoardAnswer[], rank: number): number | null {
  let first: number | null = null;
  for (const g of guesses) {
    const hit = matchGuess(g.normalized, board, []);
    if (hit?.rank === rank && (first === null || g.at < first)) first = g.at;
  }
  return first;
}

export function costreamQuestionLine(i: { round: number; rounds: number; question: string; sides: [string, string]; double: boolean }): string {
  const head = `Round ${i.round + 1} of ${i.rounds}${i.double ? " (double points!)" : ""}`;
  return `🧠 Co-stream ${head}: ${i.question}  ▸  Face-off! ${i.sides[0]} vs ${i.sides[1]}: both chats answer with !a, the higher answer wins control.`.slice(0, 480);
}

const chatSaid = (who: string, o: WindowOutcome) =>
  o.result === "hit" ? `${who} said ${shout(o.label)} (#${o.rank})`
    : o.result === "empty" ? `${who} didn't answer`
    : o.reason === "already" ? `${who} said ${shout(o.label)} (already up)`
    : `${who} said ${shout(o.label)} (not on the board)`;

export function faceoffLine(i: { sides: [string, string]; outcomes: [WindowOutcome, WindowOutcome]; result: CostreamFaceoff; winnerName: string | null; attempt: number; maxAttempts: number }): string {
  const said = `${chatSaid(i.sides[0], i.outcomes[0])}; ${chatSaid(i.sides[1], i.outcomes[1])}.`;
  if (i.result.result === "won") return `🧠 Face-off: ${said} ${i.winnerName} takes control: !a to keep going!`.slice(0, 480);
  return i.attempt < i.maxAttempts
    ? `🧠 Face-off: ${said} No hits, so it's face-off again!`.slice(0, 480)
    : `🧠 Face-off: ${said} Still nothing, so the host picks who plays.`.slice(0, 480);
}

export function costreamTurnLine(i: { who: string; outcome: WindowOutcome; strikes: number; next: "guess" | "steal" | "cleared"; other: string }): string {
  const head = chatSaid(i.who, i.outcome);
  if (i.next === "cleared") return `🧠 ${head}. Board cleared!`.slice(0, 480);
  if (i.outcome.result === "hit") return `🧠 ${head}! Keep going: !a.`.slice(0, 480);
  if (i.next === "steal") return `🧠 ${head}. ✖ Strike 3! ${i.other}, one answer to steal the round: !a.`.slice(0, 480);
  return `🧠 ${head}. ✖ Strike ${i.strikes}.`.slice(0, 480);
}
