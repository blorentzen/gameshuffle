/**
 * Clean tables verify themselves (automation picks 2026-11-01, https://claude.ai/artifact/JjiP8RDDdr6onMy1usw6My,
 * picks 1 and 2). Pure, client-safe.
 *
 * A submitted table is compared with what we read from its results screenshot (read.ts). It's clean when the two
 * agree exactly (every player, every score; for Knockout Tour, every place), the room has nothing to check
 * (roomIssues: right size, scores add up, every name known), nobody asked for a penalty or reduced loss on it, and
 * nobody marked missed races. A clean table verifies on its own once its hold is over (10 minutes, for disputes);
 * anything else waits for an updater with the reasons listed. Where the text and the screenshot disagree, the
 * screenshot's numbers can be used in one tap (`withReadNumbers`).
 */

import { editDistance } from "@/lib/lounge/lookup";
import { nameKey, type Room, type RoomIssue } from "./rules";

export const AUTO_HOLD_MINUTES = 10;

export type ReadDiff =
  | { kind: "score"; name: string; typed: number | null; read: number | null }
  | { kind: "place"; name: string; typed: number; read: number }
  | { kind: "name"; typed: string; read: string }
  | { kind: "missing"; name: string }
  | { kind: "extra"; name: string };

const playersOf = (room: Room) => room.teams.flatMap((t) => t.players.map((p) => ({ ...p, rank: t.rank })));

/** How the typed table and the screenshot's reading differ. Names one or two letters apart are paired as the same player. */
export function compareRooms(typed: Room, read: Room): ReadDiff[] {
  const a = playersOf(typed), b = playersOf(read);
  const used = new Set<number>();
  const diffs: ReadDiff[] = [];
  const pairs: [typeof a[number], typeof b[number]][] = [];
  for (const p of a) {
    let j = b.findIndex((q, k) => !used.has(k) && q.key === p.key);
    if (j < 0) {
      let best = -1, bestD = 99;
      b.forEach((q, k) => { if (used.has(k)) return; const d = editDistance(p.key, q.key); if (d < bestD) { bestD = d; best = k; } });
      if (best >= 0 && bestD <= (p.key.length <= 4 ? 1 : 2)) { j = best; diffs.push({ kind: "name", typed: p.name, read: b[best].name }); }
    }
    if (j < 0) { diffs.push({ kind: "missing", name: p.name }); continue; }
    used.add(j);
    pairs.push([p, b[j]]);
  }
  b.forEach((q, k) => { if (!used.has(k)) diffs.push({ kind: "extra", name: q.name }); });
  for (const [p, q] of pairs) {
    if (typed.kind === "knockout") { if (p.rank !== q.rank) diffs.push({ kind: "place", name: p.name, typed: p.rank, read: q.rank }); }
    else if ((p.score ?? null) !== (q.score ?? null)) diffs.push({ kind: "score", name: p.name, typed: p.score, read: q.score });
  }
  return diffs;
}

export const diffText = (d: ReadDiff): string => ({
  score: () => `The text says ${(d as { name: string }).name} ${(d as { typed: number | null }).typed ?? "nothing"}, the screenshot says ${(d as { read: number | null }).read ?? "nothing"}`,
  place: () => `The text has ${(d as { name: string }).name} ${ordinal((d as { typed: number }).typed)}, the screenshot ${ordinal((d as { read: number }).read)}`,
  name: () => `The text says ${(d as { typed: string }).typed}, the screenshot ${(d as { read: string }).read}`,
  missing: () => `${(d as { name: string }).name} isn't on the screenshot`,
  extra: () => `The screenshot also has ${(d as { name: string }).name}`,
}[d.kind])();
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

export interface AutoCheck { clean: boolean; reasons: string[]; diffs: ReadDiff[] }

/** Whether a table can verify itself, and if not, why. `read` null: no screenshot was read. */
export function autoVerifyCheck(input: { typed: Room; read: Room | null; issues: RoomIssue[]; openRequests: number; missedRaces: number }): AutoCheck {
  const reasons: string[] = [];
  const diffs = input.read ? compareRooms(input.typed, input.read) : [];
  if (!input.read) reasons.push("No screenshot was read");
  reasons.push(...diffs.map(diffText));
  reasons.push(...input.issues.map((i) => i.text.replace(/\.$/, "")));
  if (input.openRequests) reasons.push(input.openRequests === 1 ? "Someone asked for a penalty or reduced loss" : `${input.openRequests} requests for penalties or reduced loss`);
  if (input.missedRaces) reasons.push(input.missedRaces === 1 ? "A player missed races" : `${input.missedRaces} players missed races`);
  return { clean: reasons.length === 0, reasons, diffs };
}

/** When a clean table verifies on its own. */
export const autoVerifyAt = (submittedAt: string, holdMinutes = AUTO_HOLD_MINUTES) => new Date(Date.parse(submittedAt) + holdMinutes * 60_000).toISOString();

/**
 * The typed table with the screenshot's numbers (and the screenshot's spelling where a name was one or two letters
 * off): every other line, team heading and setting stays as typed.
 */
export function withReadNumbers(body: string, typed: Room, read: Room): string {
  const diffs = compareRooms(typed, read);
  const names = new Map(diffs.filter((d): d is Extract<ReadDiff, { kind: "name" }> => d.kind === "name").map((d) => [nameKey(d.typed), d.read]));
  const readPlayers = playersOf(read);
  const readByKey = new Map(readPlayers.map((p) => [p.key, p]));
  return body.split(/\r?\n/).map((line) => {
    const m = /^(.+?)(\s*\[[a-z_]{2,13}\])?\s+([+-]?\d{1,4}(?:\s*[+\-|]\s*\d{1,4})*)\s*$/i.exec(line.trim());
    if (!m || line.trim().startsWith("#")) return line;
    const key = nameKey(m[1]);
    const fixedName = names.get(key) ?? m[1];
    const q = readByKey.get(nameKey(fixedName));
    if (!q || q.score == null) return line;
    return `${fixedName}${m[2] ?? ""} ${q.score}`;
  }).join("\n");
}
