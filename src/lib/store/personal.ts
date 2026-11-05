/**
 * Made when ordered (picks 2026-11-04, all 14 as recommended): designs where the buyer picks something
 * from lists we wrote, never typed text. Every choice is a print file made ahead from the Figma art (406
 * files, `PERSONAL.files`), so an order only attaches the right file; nothing is drawn at order time.
 *
 * A personalized Printful product names its kind and ink in `PERSONAL.products` (by sync product id): its
 * colors share one ink, so the picked file is `<file family>-<ink>-<pick>`. The pick is a short code
 * ("p3-h2", "since-1985", "7", "v2", "p4") checked here, and its label is what the cart, order and emails
 * show. Client-safe: no server imports.
 */

import manifest from "@/data/store/personal-picks.json";

export type PickKind = "player" | "joined" | "cap" | "member" | "kidmember" | "level" | "patch" | "seat";
export type Ink = "navy" | "white" | "cream";

export interface PickOption { value: string; label: string }
export interface PickField { id: string; label: string; options: PickOption[]; /** only shown when another field has this value */ when?: { field: string; value: string } }
/** Where the print sits in the blank's print area (Printful's order file position), as the mockups placed it. */
export interface PrintPosition { area_width: number; area_height: number; width: number; height: number; top: number; left: number }
export interface PersonalProduct { kind: PickKind; ink: Ink; position: PrintPosition }
export interface PickFile { id: number; threads?: string[] }

export const PERSONAL = manifest as { products: Record<string, PersonalProduct>; files: Record<string, PickFile> };

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Players 1 to 6 (bigger families), hearts 0 to 5 (0 is "out of hearts"). */
export const PLAYERS = range(1, 6);
export const HEARTS = range(0, 5);
export const LEVELS = range(1, 16);
export const PATCH_VERSIONS = range(1, 5);
export const SEATS = range(1, 6);
/** Member since: adults from 1980, kids from 2010, up to the newest year with files. */
export const SINCE_FROM: Record<"member" | "kidmember", number> = { member: 1980, kidmember: 2010 };

export const MEMBER_LINES: Record<"member" | "kidmember", { value: string; label: string }[]> = {
  member: [
    { value: "none", label: "No line" },
    { value: "founding", label: "Founding member" },
    { value: "lifetime", label: "Lifetime member" },
    { value: "honorary", label: "Honorary member" },
    { value: "good-standing", label: "Member in good standing" },
    { value: "since", label: "Member since (year)" },
  ],
  kidmember: [
    { value: "none", label: "No line" },
    { value: "junior", label: "Junior member" },
    { value: "training", label: "Member in training" },
    { value: "since", label: "Member since (year)" },
  ],
};

/** The lines each patch notes version prints (picks page, approved 2026-11-04). */
export const PATCH_NOTES: Record<number, [string, string, string]> = {
  1: ["Added walking", "Added first words", "Removed sleeping in"],
  2: ["Added running", "Added “why?”", "Removed naps"],
  3: ["Added jumping", "Added “I do it”", "Removed diapers"],
  4: ["Added knock-knock jokes", "Added “one more”", "Removed the stroller"],
  5: ["Added reading", "Added “five more minutes”", "Removed training wheels"],
};

/** The print file family for a kind (the baby "has joined" and the cap have their own art). */
const FAMILY: Record<PickKind, string> = { player: "player", joined: "joined", cap: "cap", member: "member", kidmember: "kidmember", level: "level", patch: "patch", seat: "seat" };

export const DEFAULT_PICK: Record<PickKind, string> = { player: "p1-h3", cap: "p1-h3", joined: "p2", member: "none", kidmember: "none", level: "7", patch: "v2", seat: "p1" };

/** The newest "member since" year that has files for this kind and ink (new years get files each January). */
export function newestSince(kind: "member" | "kidmember", ink: Ink, files: Record<string, PickFile> = PERSONAL.files): number {
  let y = SINCE_FROM[kind];
  for (let n = y; n <= y + 200; n++) if (files[`${FAMILY[kind]}-${ink}-since-${n}`]) y = n; else if (n > SINCE_FROM[kind] + 1) break;
  return y;
}

/** The pickers a kind shows on the product page, in order. */
export function fieldsFor(kind: PickKind, ink: Ink, files: Record<string, PickFile> = PERSONAL.files): PickField[] {
  switch (kind) {
    case "player": case "cap":
      return [
        { id: "p", label: "Player", options: PLAYERS.map((n) => ({ value: String(n), label: String(n) })) },
        { id: "h", label: "Hearts", options: HEARTS.map((n) => ({ value: String(n), label: String(n) })) },
      ];
    case "joined":
      return [{ id: "p", label: "Player", options: PLAYERS.map((n) => ({ value: String(n), label: String(n) })) }];
    case "member": case "kidmember": {
      const top = newestSince(kind, ink, files);
      return [
        { id: "line", label: "Line under the badge", options: MEMBER_LINES[kind] },
        { id: "year", label: "Member since", options: range(SINCE_FROM[kind], top).reverse().map((y) => ({ value: String(y), label: String(y) })), when: { field: "line", value: "since" } },
      ];
    }
    case "level":
      return [{ id: "n", label: "Level", options: LEVELS.map((n) => ({ value: String(n), label: String(n) })) }];
    case "patch":
      return [{ id: "v", label: "Version", options: PATCH_VERSIONS.map((n) => ({ value: String(n), label: `v${n}.0` })) }];
    case "seat":
      return [{ id: "s", label: "Seat", options: SEATS.map((n) => ({ value: String(n), label: `P${n}` })) }];
  }
}

/** Field values → the pick code. */
export function pickFromValues(kind: PickKind, v: Record<string, string>): string {
  switch (kind) {
    case "player": case "cap": return `p${v.p}-h${v.h}`;
    case "joined": return `p${v.p}`;
    case "member": case "kidmember": return v.line === "since" ? `since-${v.year}` : v.line;
    case "level": return v.n;
    case "patch": return `v${v.v}`;
    case "seat": return `p${v.s}`;
  }
}

/** The pick code → field values (null when it isn't one this kind offers). */
export function valuesFromPick(kind: PickKind, pick: string): Record<string, string> | null {
  let m: RegExpMatchArray | null;
  switch (kind) {
    case "player": case "cap":
      m = pick.match(/^p(\d)-h(\d)$/); return m && PLAYERS.includes(+m[1]) && HEARTS.includes(+m[2]) ? { p: m[1], h: m[2] } : null;
    case "joined": case "seat":
      m = pick.match(/^p(\d)$/); if (!m) return null;
      return (kind === "joined" ? PLAYERS : SEATS).includes(+m[1]) ? (kind === "joined" ? { p: m[1] } : { s: m[1] }) : null;
    case "member": case "kidmember": {
      m = pick.match(/^since-(\d{4})$/);
      if (m) return +m[1] >= SINCE_FROM[kind] ? { line: "since", year: m[1] } : null;
      return MEMBER_LINES[kind].some((l) => l.value === pick && l.value !== "since") ? { line: pick, year: "" } : null;
    }
    case "level": return /^\d{1,2}$/.test(pick) && LEVELS.includes(+pick) ? { n: pick } : null;
    case "patch": m = pick.match(/^v(\d)$/); return m && PATCH_VERSIONS.includes(+m[1]) ? { v: m[1] } : null;
  }
}

/** The print file key for a pick on a product of this kind and ink. */
export const fileKey = (kind: PickKind, ink: Ink, pick: string) => `${FAMILY[kind]}-${ink}-${pick}`;

/** A pick is good when this kind offers it and its print file exists. */
export function isValidPick(kind: PickKind, ink: Ink, pick: string, files: Record<string, PickFile> = PERSONAL.files): boolean {
  return !!valuesFromPick(kind, pick) && !!files[fileKey(kind, ink, pick)];
}

/** What the cart, order and emails say: "Player 2 · 4 hearts", "Member since 1985", "Level 7". */
export function pickLabel(kind: PickKind, pick: string): string {
  const v = valuesFromPick(kind, pick);
  if (!v) return pick;
  switch (kind) {
    case "player": case "cap": return `Player ${v.p} · ${v.h === "0" ? "out of hearts" : `${v.h} ${v.h === "1" ? "heart" : "hearts"}`}`;
    case "joined": return `Player ${v.p} has joined`;
    case "member": case "kidmember": return v.line === "since" ? `Member since ${v.year}` : MEMBER_LINES[kind].find((l) => l.value === v.line)!.label;
    case "level": return `Level ${v.n}`;
    case "patch": return `Patch notes v${v.v}.0`;
    case "seat": return `Seat P${v.s}`;
  }
}

/** Where the flat preview of a pick lives (made with the print files). */
export const previewPath = (kind: PickKind, ink: Ink, pick: string) => `/images/merch/picks/${fileKey(kind, ink, pick)}.webp`;

/** A cart line's identity: the same shirt with two different picks is two lines. */
export const lineKey = (sku: string, pick?: string | null) => (pick ? `${sku}|${pick}` : sku);
