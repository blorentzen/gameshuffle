/**
 * Notification groups: how people mute on-site notifications (the bell and the
 * Comms Center) without facing 28 switches. Every registered type belongs to
 * one group; `system` and `moderation_notice` are never mutable (account and
 * safety notices). Mutes live in users.notification_prefs.muted (group ids);
 * createNotification skips a muted group. Client-safe.
 */

import type { GsNotificationType } from "@/lib/social/notificationTypes";

export interface NotificationGroup {
  id: string;
  label: string;
  helper: string;
  types: GsNotificationType[];
}

export const NOTIFICATION_GROUPS: NotificationGroup[] = [
  { id: "social", label: "Follows, comments and reactions", helper: "Someone follows you, comments, replies, reacts or mentions you.", types: ["follow", "post_reaction", "post_comment", "comment_reply", "comment_like", "post_mention"] },
  { id: "messages", label: "Messages", helper: "A new direct message. The message itself still arrives in Comms.", types: ["message"] },
  { id: "invites", label: "Invitations", helper: "Invites to sessions, tournaments and championships.", types: ["session_invite", "tournament_invite", "championship_invite"] },
  { id: "tournaments", label: "Tournaments", helper: "Reminders, check-in opening, when you're up, and changes from the organizer.", types: ["tournament_reminder", "tournament_checkin_open", "tournament_youre_up", "tournament_update", "tournament_claim_offer"] },
  { id: "game_nights", label: "Game nights", helper: "RSVPs to your nights and reminders for the ones you're going to.", types: ["game_night_rsvp", "game_night_reminder"] },
  { id: "ideas", label: "Idea Board", helper: "Updates on ideas you submitted.", types: ["idea_accepted", "idea_in_review", "idea_verdict", "idea_shipped"] },
  { id: "streaming", label: "Streaming and payouts", helper: "Crew promotions, your Discord question pool running low, and ticket payouts.", types: ["crew_promotion", "qotd_low", "payout_paid", "payout_failed"] },
];

/** Never muted: account notices and moderation decisions. */
export const ALWAYS_ON_TYPES: GsNotificationType[] = ["system", "moderation_notice"];

const GROUP_OF = new Map<string, string>(NOTIFICATION_GROUPS.flatMap((g) => g.types.map((t) => [t, g.id] as const)));

/** The group a notification type belongs to (null = always on). */
export function groupOf(type: string): string | null {
  return GROUP_OF.get(type) ?? null;
}

export function isGroupId(id: unknown): id is string {
  return typeof id === "string" && NOTIFICATION_GROUPS.some((g) => g.id === id);
}
