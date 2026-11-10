/**
 * Notification groups: one row per kind of news in Settings ▸ Notifications, with three ways it can reach you
 * side by side (journeys picks 2026-11-06, 8A): On site (the bell and the Comms Center), Email and Discord (a
 * message from the GameShuffle bot). Every registered type belongs to one group; `system` and `moderation_notice`
 * have none and always come through on site. Preferences live in users.notification_prefs:
 *   muted    group ids that are off on site (the original list, kept as is)
 *   email    { group: on } where someone changed Email from its default (`emailDefault`)
 *   discord  { group: on } (off by default)
 * createNotification reads them (src/lib/social/notifications.ts); types with their own email (reminders, the lounge
 * report) follow the Email column through `emailAllowed`. Client-safe.
 */

import type { GsNotificationType } from "@/lib/social/notificationTypes";
import { MESSAGING_ON } from "./messagingOn";

export interface NotificationGroup {
  id: string;
  label: string;
  helper: string;
  types: GsNotificationType[];
  /** Email starts on (the groups that already emailed before the matrix: reminders, the lounge report). */
  emailDefault?: boolean;
  /** Where the row sits in Settings. */
  section: "people" | "games" | "tools";
}

export const NOTIFICATION_SECTIONS: { id: NotificationGroup["section"]; label: string }[] = [
  { id: "people", label: "Your people" },
  { id: "games", label: "Games and events" },
  { id: "tools", label: "Your tools" },
];

export const NOTIFICATION_GROUPS: NotificationGroup[] = [
  { id: "social", section: "people", label: "Follows, comments and reactions", helper: "Someone follows you, comments, replies, reacts or mentions you.", types: ["follow", "joined_from_link", "post_reaction", "post_comment", "comment_reply", "comment_like", "post_mention"] },
  // Messages are shelved (MESSAGING_ON), so their switch is hidden; it returns with them.
  ...(MESSAGING_ON ? [{ id: "messages", section: "people", label: "Messages", helper: "A new direct message. The message itself stays in Comms.", types: ["message"] } as NotificationGroup] : []),
  { id: "nudges", section: "people", label: "Nudges from friends", helper: "A friend wants you on today's daily, sends their result to beat, or saves you a seat at a night. Friends only, once a day each.", types: ["daily_nudge", "night_invite"] },
  { id: "invites", section: "people", label: "Invitations", helper: "Invites to streams, tournaments, championships and Chat Brain co-streams.", types: ["session_invite", "tournament_invite", "championship_invite", "chatbrain_costream"] },
  { id: "tournaments", section: "games", emailDefault: true, label: "Tournaments", helper: "Reminders, check-in opening, when you're up, changes from the organizer, and people waiting to get into your own tournament.", types: ["tournament_reminder", "tournament_checkin_open", "tournament_youre_up", "tournament_update", "tournament_claim_offer", "tournament_plan_waitlist"] },
  { id: "game_nights", section: "games", emailDefault: true, label: "Game nights", helper: "Reminders for nights you're going to, and RSVPs to your own.", types: ["game_night_rsvp", "game_night_reminder"] },
  { id: "dailies", section: "games", label: "Daily games", helper: "Leaderboard prizes, making yesterday's top 5, and tokens from your invite link.", types: ["daily_prize", "daily_top5", "referral"] },
  { id: "lounge", section: "games", emailDefault: true, label: "Mario Kart lounge", helper: "Your Monday lounge report with GS Pro: last week's MMR change, best night and rivals.", types: ["lounge_weekly"] },
  { id: "streaming", section: "tools", label: "Streaming and payouts", helper: "Crew promotions, your Discord question pool running low, and ticket payouts.", types: ["crew_promotion", "qotd_low", "payout_paid", "payout_failed"] },
  { id: "ideas", section: "tools", label: "Idea Board", helper: "Updates on ideas you sent in.", types: ["idea_accepted", "idea_in_review", "idea_verdict", "idea_shipped"] },
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

export type NotifChannel = "site" | "email" | "discord";

export interface NotifPrefs {
  muted: string[];
  email: Record<string, boolean>;
  discord: Record<string, boolean>;
  /** When the bot last failed to reach this person on Discord (DMs closed, or no server in common). */
  discordBlockedAt?: string | null;
}

const boolMap = (raw: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) if (isGroupId(k) && typeof v === "boolean") out[k] = v;
  }
  return out;
};

/** users.notification_prefs as stored (any shape, or null) → the preferences. */
export function readNotifPrefs(raw: unknown): NotifPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    muted: Array.isArray(r.muted) ? r.muted.filter(isGroupId) : [],
    email: boolMap(r.email),
    discord: boolMap(r.discord),
    discordBlockedAt: typeof r.discordBlockedAt === "string" ? r.discordBlockedAt : null,
  };
}

/** Whether a group reaches someone one way. */
export function channelOn(p: NotifPrefs, groupId: string, ch: NotifChannel): boolean {
  if (ch === "site") return !p.muted.includes(groupId);
  if (ch === "email") return p.email[groupId] ?? !!NOTIFICATION_GROUPS.find((g) => g.id === groupId)?.emailDefault;
  return p.discord[groupId] ?? false;
}

/** Types that send their own email (reminders, check-in, you're up, organizer changes, the lounge report): the
 *  Email column decides whether they go, and createNotification doesn't add a second, plain one. */
export const OWN_EMAIL_TYPES: ReadonlySet<string> = new Set<GsNotificationType>([
  "tournament_reminder", "tournament_checkin_open", "tournament_youre_up", "tournament_update", "game_night_reminder", "lounge_weekly",
]);
