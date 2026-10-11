/**
 * Shared lifecycle sections for the "My Stuff" entity grids (Game Nights +
 * Tournaments). One ordered scheme so both tabs read the same way; each tab maps
 * its own statuses onto these keys and only renders the non-empty sections.
 */

export type SectionKey = "draft" | "registration" | "in_progress" | "complete" | "archived";

/** In order. "archived" (cancelled or archived) renders collapsed at the bottom. */
export const MYSTUFF_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "registration", label: "Registration" },
  { key: "in_progress", label: "In Progress" },
  { key: "complete", label: "Complete" },
  { key: "archived", label: "Archived" },
];

/** Tournament status → lifecycle section. Cancelled or archived → "archived". */
export function sectionForTournamentStatus(status: string, archivedAt?: string | null): SectionKey {
  if (archivedAt) return "archived";
  switch (status) {
    case "draft": return "draft";
    case "open": return "registration";
    case "in_progress": return "in_progress";
    case "complete": return "complete";
    case "cancelled": return "archived";
    default: return "registration";
  }
}

/** Game night status → lifecycle section (no in-progress phase). Cancelled or archived → "archived". */
export function sectionForNightStatus(status: string, archivedAt?: string | null): SectionKey {
  if (archivedAt) return "archived";
  switch (status) {
    case "draft": return "draft";
    case "scheduled": return "registration";
    case "ended": return "complete";
    case "cancelled": return "archived";
    default: return "registration";
  }
}
