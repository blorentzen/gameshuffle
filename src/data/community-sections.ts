import type { ComponentType } from "react";
import { IconHeartHandshake, IconDice5, IconBuilding, IconConfetti, IconUsers } from "@tabler/icons-react";

/**
 * Toggleable community-page sections. Client-safe (no server-only imports) so
 * both the owner editor (client) and the store (server) can share it. Feed +
 * members always show; these four an owner can hide to tailor the community
 * (e.g. a family/org community turns off the competitive + economy sections).
 */

export const COMMUNITY_TOGGLEABLE_SECTIONS = [
  { key: "markets", label: "Live predictions" },
  { key: "crews", label: "Crews" },
  { key: "battles", label: "Crew battles" },
  { key: "leaderboard", label: "Token leaderboard" },
] as const;

export type CommunitySectionKey = (typeof COMMUNITY_TOGGLEABLE_SECTIONS)[number]["key"];

export const COMMUNITY_SECTION_KEYS = new Set<string>(
  COMMUNITY_TOGGLEABLE_SECTIONS.map((s) => s.key),
);

/** Group community flavors (cosmetic label + section defaults on create). */
export const COMMUNITY_SUBTYPES = [
  { value: "family", label: "Family" },
  { value: "friends", label: "Friend group" },
  { value: "org", label: "Organization" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
] as const;

export type CommunitySubtype = (typeof COMMUNITY_SUBTYPES)[number]["value"];

/**
 * Which sections a new `group` community hides by default, by subtype. Social
 * flavors hide all the competitive/economy sections; orgs/events keep crews +
 * battles (leagues) but hide the token economy. Owners can re-enable anything.
 */
export function defaultHiddenSectionsForSubtype(subtype: string | null): string[] {
  switch (subtype) {
    case "family":
    case "friends":
      return ["markets", "leaderboard", "crews", "battles"];
    case "org":
    case "event":
      return ["markets", "leaderboard"];
    default:
      return ["markets", "leaderboard"];
  }
}

/**
 * Phase 3 — subtype-specific presentation for the `/c` page: an icon for the
 * header, the order sections render in, and copy that fits the community's
 * flavor. Channels stay competitive-forward (markets/crews first); group
 * flavors lead with the feed + members (social-first), orgs are
 * announcements-forward. Ordering only reorders ENABLED sections — hidden ones
 * are filtered out regardless.
 */
export interface CommunityPresentation {
  /** Tabler component for this community kind, or null for a plain channel. */
  icon: ComponentType<{ size?: number | string; stroke?: number }> | null;
  /** Section keys in render order: markets · crews · battles · feed · gamenights · leaderboard · members. */
  sectionOrder: string[];
  feedHeading: string;
  feedEmpty: string;
  /** Noun for the members section ("Members", "Attendees", "Family members"…). */
  membersLabel: string;
  /** Empty-state copy for the members section. */
  membersEmpty: string;
  /** A one-line "what this is" shown under the name when the owner set no tagline. */
  descriptor: string;
  /** Join CTA label + the joined-state label (e.g. "RSVP" / "Going ✓" for events). */
  joinLabel: string;
  joinedLabel: string;
}

const ORDER_CHANNEL = ["markets", "raffles", "crews", "battles", "feed", "leaderboard", "gamenights", "members"];
const ORDER_SOCIAL = ["feed", "members", "gamenights", "crews", "battles", "leaderboard", "markets"];
const ORDER_ORG = ["feed", "gamenights", "crews", "battles", "members", "leaderboard", "markets"];
const ORDER_EVENT = ["gamenights", "feed", "members", "crews", "battles", "leaderboard", "markets"];

export function communityPresentation(kind: string, subtype: string | null): CommunityPresentation {
  if (kind !== "group") {
    return { icon: null, sectionOrder: ORDER_CHANNEL, feedHeading: "Community feed", feedEmpty: "No posts yet.", membersLabel: "Members", membersEmpty: "Be the first to join.", descriptor: "", joinLabel: "Join community", joinedLabel: "Joined ✓" };
  }
  switch (subtype) {
    case "family":
      return { icon: IconHeartHandshake, sectionOrder: ORDER_SOCIAL, feedHeading: "Family feed", feedEmpty: "No posts yet. Share what the family's playing.", membersLabel: "Family members", membersEmpty: "No family members yet.", descriptor: "A family game-night community", joinLabel: "Join the family", joinedLabel: "Joined ✓" };
    case "friends":
      return { icon: IconDice5, sectionOrder: ORDER_SOCIAL, feedHeading: "Group feed", feedEmpty: "No posts yet. Kick off the group chat.", membersLabel: "Members", membersEmpty: "No one's joined yet.", descriptor: "A friend-group community", joinLabel: "Join the group", joinedLabel: "Joined ✓" };
    case "org":
      return { icon: IconBuilding, sectionOrder: ORDER_ORG, feedHeading: "Announcements", feedEmpty: "No announcements yet.", membersLabel: "Members", membersEmpty: "No members yet.", descriptor: "An organization community", joinLabel: "Join", joinedLabel: "Joined ✓" };
    case "event":
      return { icon: IconConfetti, sectionOrder: ORDER_EVENT, feedHeading: "Event updates", feedEmpty: "No updates yet. Post the details, schedule, or a welcome.", membersLabel: "Attendees", membersEmpty: "No one's RSVP'd yet. Be the first.", descriptor: "A game-night event", joinLabel: "RSVP", joinedLabel: "Going ✓" };
    default:
      return { icon: IconUsers, sectionOrder: ORDER_SOCIAL, feedHeading: "Community feed", feedEmpty: "No posts yet.", membersLabel: "Members", membersEmpty: "Be the first to join.", descriptor: "A community", joinLabel: "Join community", joinedLabel: "Joined ✓" };
  }
}
