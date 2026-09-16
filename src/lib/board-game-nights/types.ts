export type NightLength = "quick" | "moderate" | "long";
export type NightVisibility = "public" | "unlisted";
export type NightStatus = "draft" | "scheduled" | "ended" | "cancelled";
export type NightLevel = "casual" | "intermediate" | "advanced";
export type RsvpStatus = "going" | "maybe" | "declined";

/** A game being brought to a night. Name is required (free-text baseline);
 *  the rest is BGG enrichment when available. */
export interface NightGame {
  name: string;
  bggId?: number | null;
  length?: NightLength | null;
  imageUrl?: string | null;
  notes?: string | null;
}

export interface BoardGameNight {
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
