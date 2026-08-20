/**
 * Notification type registry — the single source of truth for every kind of
 * notification GameShuffle can emit.
 *
 * Spec 2 §7: "the type enum lives in one place. Adding a type is one edit, and
 * consumers render unknown types gracefully rather than crashing." Both the
 * server writer (`createNotification`) and the client renderer
 * (`useNotifications`) derive from this map — add a row here and both pick it up.
 *
 * Client-safe (type-only CDS import), so it can be imported from either side.
 */

import type { NotificationType as CdsNotificationType } from "@empac/cascadeds";

interface NotificationTypeDef {
  /** CDS NotificationData `type` used to render the row (icon/accent). */
  cds: CdsNotificationType;
  /** Actionable invite → the row renders Accept/Decline (needs
   *  `data.invitationId`). */
  invite: boolean;
}

export const NOTIFICATION_TYPES = {
  follow: { cds: "info", invite: false },
  message: { cds: "comment", invite: false },
  session_invite: { cds: "info", invite: true },
  tournament_invite: { cds: "info", invite: true },
  tournament_reminder: { cds: "info", invite: false },
  tournament_update: { cds: "warning", invite: false },
  championship_invite: { cds: "success", invite: false },
  system: { cds: "system", invite: false },
  // Idea Board (spec §6.6) — all per-event, none actionable.
  idea_accepted: { cds: "success", invite: false },
  idea_in_review: { cds: "info", invite: false },
  idea_verdict: { cds: "info", invite: false },
  idea_shipped: { cds: "success", invite: false },
  // Platform moderation (Spec 4 §10.2) — notice to an actioned user.
  moderation_notice: { cds: "warning", invite: false },
  // Social feed (community platform) — all per-event, none actionable.
  post_reaction: { cds: "info", invite: false },
  post_comment: { cds: "comment", invite: false },
  comment_reply: { cds: "comment", invite: false },
  post_mention: { cds: "info", invite: false },
  game_night_rsvp: { cds: "success", invite: false },
} as const satisfies Record<string, NotificationTypeDef>;

/** The registered GS notification types. New producers must register here. */
export type GsNotificationType = keyof typeof NOTIFICATION_TYPES;

// Widened view for lookups against a stored string that may predate the registry.
const REGISTRY: Record<string, NotificationTypeDef> = NOTIFICATION_TYPES;

/** CDS render type for a stored type string — falls back gracefully so an
 *  unknown/legacy type renders as a plain info row instead of crashing. */
export function cdsNotificationType(type: string): CdsNotificationType {
  return REGISTRY[type]?.cds ?? "info";
}

/** Whether a stored type is an actionable invite (Accept/Decline row). */
export function isInviteNotification(type: string): boolean {
  return REGISTRY[type]?.invite ?? false;
}
