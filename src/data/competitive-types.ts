export interface CompetitiveConfig {
  game_slug: string;
  tier_list_url: string | null;
  tier_list_updated: string | null;
  standard_ruleset: CompetitiveRuleset;
  community_links: CommunityLink[];
  notes: string | null;
}

export interface CompetitiveRuleset {
  cc: string;
  items: boolean;
  teamMode: boolean;
  [key: string]: string | boolean | number;
}

export interface CommunityLink {
  label: string;
  url: string;
}

export interface CompTrack {
  id: string;
  game_slug: string;
  name: string;
  shortcode: string;
  cup: string;
  category: string;
  status: "legal" | "banned" | "hidden";
  comp_notes: string | null;
  sort_order: number;
  image_url: string | null;
}

export interface CompCharacter {
  id: string;
  game_slug: string;
  name: string;
  tier: string | null;
  weight_class: string | null;
  tags: string[];
  is_banned: boolean;
  comp_notes: string | null;
  image_url: string | null;
  sort_order: number;
}

export type RulesetPreset = "150cc-no-items" | "200cc-no-items" | "custom";

export interface BanState {
  bannedTrackIds: string[];
  maxBans: number;
}
