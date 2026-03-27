export interface Gamertags {
  psn?: string;
  nso?: string;
  xbox?: string;
  steam?: string;
  discord?: string;
  twitch?: string;
  epic?: string;
}

export const GAMERTAG_PLATFORMS = [
  { key: "discord", label: "Discord", placeholder: "Username" },
  { key: "twitch", label: "Twitch", placeholder: "Twitch username" },
  { key: "nso", label: "Nintendo Switch Online", placeholder: "Friend Code (SW-XXXX-XXXX-XXXX)" },
  { key: "psn", label: "PlayStation Network", placeholder: "PSN ID" },
  { key: "xbox", label: "Xbox Live", placeholder: "Gamertag" },
  { key: "steam", label: "Steam", placeholder: "Steam username or Friend Code" },
  { key: "epic", label: "Epic Games", placeholder: "Epic display name" },
] as const;
