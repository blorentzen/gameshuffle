/**
 * LiveSplit's split groups (subsplits), read and written (speedrun templates picks 2026-11-10, 7A): a split whose name
 * starts with "-" is inside a group, and the split that closes the group is named "{Group} Name" ("{Mushroom Cup}
 * Thwomp Ruins"). Runners who group by cup kept seeing those marks on stream ("-Water Park"); every place GameShuffle
 * shows a run now shows plain names, with the group as a small label where there's room. Pure, client-safe.
 */

import type { RelaySegment, RelayState } from "./types";

const CLOSES = /^\{([^}]*)\}\s*(.*)$/;

/** One split name as LiveSplit writes it: its plain name, whether it sits in a group, and the group it closes. */
export function readSplitName(raw: string): { name: string; sub: boolean; closes: string | null } {
  const s = raw.trim();
  const m = CLOSES.exec(s);
  if (m) return { name: m[2].trim() || m[1].trim(), sub: false, closes: m[1].trim() || null };
  if (s.startsWith("-") && s.length > 1) return { name: s.slice(1).trim(), sub: true, closes: null };
  return { name: s, sub: false, closes: null };
}

/** The plain name to show for a split. */
export const shownName = (raw: string): string => readSplitName(raw).name;

/** Each split's group: the "-" splits before a "{Group}" split, and that split itself. Null outside a group. */
export function groupsOf(names: string[]): (string | null)[] {
  const out: (string | null)[] = names.map(() => null);
  let start = 0;
  names.forEach((raw, i) => {
    const r = readSplitName(raw);
    if (r.closes) {
      for (let j = start; j <= i; j++) if (j === i || readSplitName(names[j]).sub) out[j] = r.closes;
      start = i + 1;
    } else if (!r.sub) start = i + 1;
  });
  return out;
}

export type ShownSegment = RelaySegment & { group?: string | null };

/** Segments with plain names and their group (marks read once, wherever a run is shown). Idempotent. */
export function shownSegments(segments: RelaySegment[]): ShownSegment[] {
  const groups = groupsOf(segments.map((s) => s.name));
  return segments.map((s, i) => ({ ...s, name: shownName(s.name), group: groups[i] ?? (s as ShownSegment).group ?? null }));
}

/** A run state for showing: plain names, each split's group kept beside it. */
export function shownState<T extends RelayState>(st: T): Omit<T, "segments"> & { segments: ShownSegment[] } {
  return { ...st, segments: shownSegments(st.segments) };
}

export interface SplitGroup { group: string | null; names: string[] }

/** Names in groups as LiveSplit writes them: a group of one keeps its plain name (LiveSplit needs two to fold). */
export function groupedNames(groups: SplitGroup[]): string[] {
  return groups.flatMap((g) => {
    if (!g.group || g.names.length < 2) return g.names;
    return g.names.map((n, i) => (i === g.names.length - 1 ? `{${g.group}} ${n}` : `-${n}`));
  });
}

/** The other way: LiveSplit names back into groups (the setup page's preview of a typed or imported list). */
export function namesToGroups(names: string[]): SplitGroup[] {
  const groups = groupsOf(names);
  const out: SplitGroup[] = [];
  names.forEach((raw, i) => {
    const g = groups[i];
    const last = out[out.length - 1];
    if (g && last && last.group === g && i > 0 && groups[i - 1] === g) last.names.push(shownName(raw));
    else out.push({ group: g, names: [shownName(raw)] });
  });
  return out;
}
