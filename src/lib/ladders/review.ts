/**
 * The staff page's side-by-side review (name, web and docs pick 4A): each player as typed and as read from the results
 * screenshot, differences marked. Pure, client-safe.
 */

import { compareRooms } from "./autoVerify";
import { nameKey, type Room } from "./rules";

export interface ReviewRow {
  name: string;
  /** The team's name in a team room (null in FFA and Knockout Tour). */
  team: string | null;
  /** Score as typed (Knockout Tour: place). */
  typed: number | null;
  read: number | null;
  /** The screenshot's spelling when it differs from the typed name. */
  readName: string | null;
  differs: boolean;
}

export interface TableReview { rows: ReviewRow[]; extra: string[]; hasRead: boolean; differences: number; knockout: boolean }

export function reviewRows(typed: Room, read: Room | null): TableReview {
  const knockout = typed.kind === "knockout";
  const value = (rank: number, score: number | null) => (knockout ? rank : score);
  const players = typed.teams.flatMap((t) => t.players.map((p) => ({ ...p, rank: t.rank, team: typed.format > 1 ? t.label : null })));
  if (!read) return { rows: players.map((p) => ({ name: p.name, team: p.team, typed: value(p.rank, p.score), read: null, readName: null, differs: false })), extra: [], hasRead: false, differences: 0, knockout };
  const diffs = compareRooms(typed, read);
  const spelled = new Map(diffs.flatMap((d) => (d.kind === "name" ? [[nameKey(d.typed), d.read] as const] : [])));
  const missing = new Set(diffs.flatMap((d) => (d.kind === "missing" ? [nameKey(d.name)] : [])));
  const readBy = new Map(read.teams.flatMap((t) => t.players.map((p) => [p.key, { ...p, rank: t.rank }] as const)));
  const rows = players.map((p) => {
    const readName = spelled.get(p.key) ?? null;
    const q = missing.has(p.key) ? null : readBy.get(readName ? nameKey(readName) : p.key) ?? null;
    const typedValue = value(p.rank, p.score);
    const readValue = q ? value(q.rank, q.score) : null;
    return { name: p.name, team: p.team, typed: typedValue, read: readValue, readName, differs: !q || readName != null || typedValue !== readValue };
  });
  const extra = diffs.flatMap((d) => (d.kind === "extra" ? [d.name] : []));
  return { rows, extra, hasRead: true, differences: rows.filter((r) => r.differs).length + extra.length, knockout };
}
