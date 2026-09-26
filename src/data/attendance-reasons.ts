/**
 * Why someone withdrew or did not turn up. Client-safe, shared by the
 * withdrawal prompt, the post-event prompt and the organizer's summary, so the
 * three always use the same words.
 *
 * Short on purpose. A long list gets skipped, and a judgemental one gets lied
 * to; either way the data stops being worth collecting. Every option is
 * something a reasonable person would tick without feeling told off, which is
 * what makes the aggregate honest.
 *
 * "Prefer not to say" is deliberate. Making it easy to decline is what keeps
 * the other six meaningful, and someone who has to invent a reason will pick
 * whichever one sounds best rather than the true one.
 */

export type AttendanceReason =
  | "something_came_up"
  | "ran_late"
  | "wrong_time_for_me"
  | "technical_problem"
  | "not_ready"
  | "changed_my_mind"
  | "prefer_not_to_say";

export interface ReasonOption {
  value: AttendanceReason;
  /** What the player picks. */
  label: string;
  /** How it reads back to the organizer in the summary. */
  organizerLabel: string;
  /** Show this one when withdrawing, when explaining a no-show, or both. */
  when: "withdraw" | "no_show" | "both";
}

export const ATTENDANCE_REASONS: ReasonOption[] = [
  { value: "something_came_up", label: "Something came up", organizerLabel: "Something came up", when: "both" },
  { value: "ran_late", label: "I couldn't make the start", organizerLabel: "Couldn't make the start", when: "no_show" },
  { value: "wrong_time_for_me", label: "The time didn't work for me", organizerLabel: "Time didn't suit", when: "both" },
  { value: "technical_problem", label: "Technical problem", organizerLabel: "Technical problem", when: "both" },
  { value: "not_ready", label: "I wasn't ready to play", organizerLabel: "Not ready to play", when: "both" },
  { value: "changed_my_mind", label: "Changed my mind", organizerLabel: "Changed their mind", when: "withdraw" },
  { value: "prefer_not_to_say", label: "Prefer not to say", organizerLabel: "No reason given", when: "both" },
];

export const reasonsFor = (kind: "withdraw" | "no_show"): ReasonOption[] =>
  ATTENDANCE_REASONS.filter((r) => r.when === "both" || r.when === kind);

export const reasonLabel = (v: string): string =>
  ATTENDANCE_REASONS.find((r) => r.value === v)?.organizerLabel ?? v;

/** Shown above the picker, every time. The player should never be guessing who
 *  reads this, and the honest answer is that the organizer does. */
export const FEEDBACK_DISCLOSURE =
  "Optional, and only the organizer of this event sees it. It does not change your attendance record.";
