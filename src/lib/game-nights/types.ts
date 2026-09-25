export type NightLength = "quick" | "moderate" | "long";
export type NightVisibility = "public" | "unlisted";
export type NightStatus = "draft" | "scheduled" | "ended" | "cancelled";
export type NightLevel = "casual" | "intermediate" | "advanced";
export type RsvpStatus = "going" | "maybe" | "declined" | "waitlisted";

/** What kind of games a night is built around. Drives discovery filters, the
 *  games picker's catalog, and the card badge. Stored on `board_game_nights.kind`
 *  (table name predates the widening from Board Game Nights to Game Nights). */
export type NightKind = "board" | "video" | "tcg" | "mixed";
export const NIGHT_KINDS: { value: NightKind; label: string; short: string }[] = [
  { value: "board", label: "Board & card games", short: "Board games" },
  { value: "video", label: "Video games", short: "Video games" },
  { value: "tcg", label: "Trading card games", short: "TCG" },
  { value: "mixed", label: "A bit of everything", short: "Mixed" },
];
export function nightKindLabel(kind: string | null | undefined, short = false): string {
  const k = NIGHT_KINDS.find((x) => x.value === kind) ?? NIGHT_KINDS[0];
  return short ? k.short : k.label;
}

/** A game being brought to a night. Name is required (free-text baseline);
 *  the rest is BGG enrichment when available. */
export interface NightGame {
  name: string;
  bggId?: number | null;
  length?: NightLength | null;
  imageUrl?: string | null;
  notes?: string | null;
}

export interface GameNight {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  place: string | null;
  lat: number | null;
  lng: number | null;
  starts_at: string | null;
  timezone: string | null;
  capacity: number | null;
  visibility: NightVisibility;
  genres: string[] | null;
  level: NightLevel | null;
  /** Absent on rows written before the kind migration; treat as "board". */
  kind?: NightKind | null;
  /** Absent until the lobby migration is applied; treat as "in_person",
   *  which is what every night was before it. */
  location_type?: "in_person" | "online" | "tba" | null;
  games: NightGame[];
  status: NightStatus;
  /** Optional R2 cover image. Absent until the cover migration is applied. */
  cover_image_url?: string | null;
  /** Optional community this night is posted to. Absent until its migration is applied. */
  community_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NightRsvp {
  night_id: string;
  user_id: string;
  status: RsvpStatus;
  created_at: string;
}
