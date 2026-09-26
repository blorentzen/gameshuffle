/**
 * Tournament format labels, client-safe.
 *
 * This map used to be private to `src/lib/events/browse.ts`, which is
 * server-only (it builds a service client), so the browse UI could render a
 * format as a chip but never offer it as a filter. Sharing it here is what lets
 * "what kind of tournament is this" become something you can narrow by, which
 * is the first question someone scanning a hub actually asks.
 *
 * Order is the order the filter lists them: the two everyone recognises first,
 * then the league-shaped ones.
 */

export const TOURNAMENT_FORMATS = [
  { value: "single_elim", label: "Single elim" },
  { value: "double_elim", label: "Double elim" },
  { value: "ffa_points", label: "Points" },
  { value: "round_robin", label: "Round robin" },
  { value: "heat_mains", label: "Heat → Mains" },
] as const;

export const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  TOURNAMENT_FORMATS.map((f) => [f.value, f.label]),
);

export function formatLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return FORMAT_LABEL[key] ?? key;
}
