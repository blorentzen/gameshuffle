/**
 * Per gs-connections-architecture.md §3 — Discord and Twitch live in the
 * new Connections card on the Profile tab, not in the manual-input
 * Gamertags list. Their handles are derived from the linked OAuth
 * identity automatically.
 *
 * Discord and Twitch are intentionally kept on the `Gamertags` type as
 * optional string fields for backwards compatibility with any existing
 * rows that have them populated, but we no longer surface them in the
 * Gamertags UI or the GAMERTAG_PLATFORMS iteration.
 */
export interface Gamertags {
  psn?: string;
  nso?: string;
  xbox?: string;
  steam?: string;
  /** @deprecated — surfaced via Connections, not Gamertags. */
  discord?: string;
  /** @deprecated — surfaced via Connections, not Gamertags. */
  twitch?: string;
  epic?: string;
}

export const GAMERTAG_PLATFORMS = [
  { key: "nso", label: "Nintendo Switch Online", placeholder: "Friend Code (SW-XXXX-XXXX-XXXX)" },
  { key: "psn", label: "PlayStation Network", placeholder: "PSN ID" },
  { key: "xbox", label: "Xbox Live", placeholder: "Gamertag" },
  { key: "steam", label: "Steam", placeholder: "Steam username or Friend Code" },
  { key: "epic", label: "Epic Games", placeholder: "Epic display name" },
] as const;
