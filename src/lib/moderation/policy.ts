/**
 * Platform-moderation POLICY configuration (Social Spec 4 §3).
 *
 * Every value here is a DECISION REQUIRED item that belongs to Britton, per the
 * spec — the mechanisms that read these are built, but the values are dormant /
 * uncommitted until he decides. Sentinels keep the platform SAFE while unset:
 *   • auto-hide is OFF until a threshold is chosen (null)
 *   • the suspension ladder is EMPTY until defined
 *   • the contact gate sits at the Spec-1 placeholder, not a committed choice
 *
 * §3.2 (age signals / youth accounts) is intentionally ABSENT — that is decided
 * in conversation, never in code. Nothing here differentiates minors.
 */

// §3.1 — stranger contact gate. Placeholder carried from Spec 1 (NOT decided).
export type StrangerContactGate = "any" | "shared_context" | "shared_context_minor_safe";
export const STRANGER_CONTACT_GATE: StrangerContactGate = "shared_context";

// §3.4 — auto-hide report threshold. `null` = auto-hide DISABLED (the safe
// default until a number is chosen; a threshold depends on real report volume).
export const AUTO_HIDE_THRESHOLD: number | null = null;

// §3.5 — suspension duration ladder, in hours. Empty = no preset durations yet.
// `permanentAllowed` gates whether any action may be indefinite.
export const SUSPENSION_DURATIONS_HOURS: readonly number[] = [];
export const PERMANENT_ACTIONS_ALLOWED = false;

// §7.3 — strike decay window (days). `null` = strikes do not decay yet
// (decay window is a consult item; a permanent record over-bans on old minor
// incidents, so this stays unset rather than guessed).
export const STRIKE_DECAY_DAYS: number | null = null;

// §3.3 — default profile discoverability for NEW accounts is a DECISION
// REQUIRED item too; deliberately not encoded here (the moderation layer only
// reads standing, it doesn't set signup defaults). Left for that conversation.
