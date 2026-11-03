import "server-only";

/**
 * Submitting a table from the web (name, web and docs pick 7A), the same steps as Discord's /ranked submit: the
 * screenshot is read when there is one (it's the table when nothing was typed, and the check that lets a clean table
 * verify itself when something was), the table is saved and checked, and a table with nothing to look at goes straight
 * to the updaters. Anything to look at comes back to the reporter first, who sends it anyway or fixes the text.
 */

import { intakeTable } from "./intake";
import { issuesFor, postCard } from "./discord";
import { readLadderShot } from "./read";
import { blocking, type RoomIssue } from "./rules";
import { createTable, getTable, playerNames, playersByKeys, tableRoom, updateTable, type LadderTable } from "./store";
import { isFormat, type Ladder } from "./types";

export interface SubmitOutcome {
  table: LadderTable;
  /** Things to look at before it goes to the updaters (blocking ones stop it). */
  issues: RoomIssue[];
  notes: string[];
  sent: boolean;
  /** Sending to the updaters failed (the bot can't post in the results channel). */
  postError: "no_access" | "failed" | null;
}

export type SubmitError = "empty" | "cap" | "not_results" | "read_failed" | "save_failed";

const readError = (e: "cap" | "not_results" | "failed"): SubmitError => (e === "failed" ? "read_failed" : e);

async function issuesOf(ladder: Ladder, table: LadderTable): Promise<RoomIssue[]> {
  const room = tableRoom(ladder, table);
  const keys = room.teams.flatMap((t) => t.players.map((p) => p.key));
  const known = new Set((await playersByKeys(ladder.id, keys)).keys());
  const names = keys.some((k) => !known.has(k)) ? await playerNames(ladder.id) : [];
  return issuesFor(ladder, table, known, names);
}

/** Sends a checked table to the updaters: a card in the results channel unless the lounge's staff work on the web. */
export async function sendToUpdaters(ladder: Ladder, table: LadderTable, issues: RoomIssue[]): Promise<"ok" | "no_access" | "failed"> {
  if (ladder.settings.staff.workIn === "web" || !table.channelId) return "ok";
  const posted = await postCard(ladder, table, { kind: "pending", issues: issues.filter((i) => i.level === "check") });
  if (posted.result !== "ok") return posted.result;
  await updateTable(table.id, { messageId: posted.messageId, channelId: posted.channelId });
  return "ok";
}

export async function submitTable(ladder: Ladder, input: { format: number; tier: string | null; text: string; shot: { bytes: Uint8Array; contentType: string } | null; missedText: string; by: { id: string; name: string }; userId: string | null }): Promise<{ ok: true; outcome: SubmitOutcome } | { ok: false; error: SubmitError }> {
  const format = ladder.kind === "knockout" ? 1 : isFormat(input.format) ? input.format : 1;
  const text = input.text.trim().slice(0, 4000);
  if (!input.shot && !text) return { ok: false, error: "empty" };
  let body = text;
  let readBody: string | null = null;
  const notes: string[] = [];
  if (input.shot) {
    const read = await readLadderShot(input.shot.bytes, { kind: ladder.kind, format, ladderId: ladder.id, userId: input.userId });
    if (read.ok) { readBody = read.body; if (!text) { body = read.body; notes.push(...read.notes); } }
    else if (!text) return { ok: false, error: readError(read.error) };
  }
  const created = await createTable(ladder, { format, tier: input.tier?.trim().slice(0, 12) || null, body, by: input.by, channelId: ladder.resultsChannelId });
  if (!created) return { ok: false, error: "save_failed" };
  const { table, notes: more } = await intakeTable(ladder, created, { shot: input.shot, readBody, missedText: input.missedText });
  return { ok: true, outcome: await checkAndSend(ladder, table, [...notes, ...more]) };
}

/** Checks a pending table and sends it on when there's nothing to look at (or `force`, once nothing blocks it). */
export async function checkAndSend(ladder: Ladder, table: LadderTable, notes: string[] = [], force = false): Promise<SubmitOutcome> {
  const issues = await issuesOf(ladder, table);
  if (blocking(issues) || (!force && (issues.length || notes.length))) return { table, issues, notes, sent: false, postError: null };
  const posted = await sendToUpdaters(ladder, table, issues);
  return { table: (await getTable(table.id)) ?? table, issues, notes, sent: posted === "ok", postError: posted === "ok" ? null : posted };
}
