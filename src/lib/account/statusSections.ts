/**
 * Shared lifecycle sections for the "My Stuff" entity grids (Game Nights +
 * Tournaments). One ordered scheme so both tabs read the same way; each tab maps
 * its own statuses onto these keys and only renders the non-empty sections.
 */

export type SectionKey = "draft" | "registration" | "in_progress" | "complete" | "cancelled";

export const MYSTUFF_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "registration", label: "Registration" },
  { key: "in_progress", label: "In Progress" },
  { key: "complete", label: "Complete" },
  { key: "cancelled", label: "Cancelled" },
];

/** Tournament status → lifecycle section. */
export function sectionForTournamentStatus(status: string): SectionKey {
  switch (status) {
    case "draft": return "draft";
    case "open": return "registration";
    case "in_progress": return "in_progress";
    case "complete": return "complete";
    case "cancelled": return "cancelled";
    default: return "registration";
  }
}

/** Board-game-night status → lifecycle section (no in-progress phase). */
export function sectionForNightStatus(status: string): SectionKey {
  switch (status) {
    case "draft": return "draft";
    case "scheduled": return "registration";
    case "ended": return "complete";
    case "cancelled": return "cancelled";
    default: return "registration";
  }
}
