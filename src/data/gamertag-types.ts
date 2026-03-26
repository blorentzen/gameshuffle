export interface Gamertags {
  psn?: string;
  nso?: string;
  xbox?: string;
  steam?: string;
  discord?: string;
}

export const GAMERTAG_PLATFORMS = [
  { key: "psn", label: "PlayStation Network", placeholder: "PSN ID" },
  { key: "nso", label: "Nintendo Switch Online", placeholder: "Friend Code (SW-XXXX-XXXX-XXXX)" },
  { key: "xbox", label: "Xbox Live", placeholder: "Gamertag" },
  { key: "steam", label: "Steam", placeholder: "Steam username or Friend Code" },
  { key: "discord", label: "Discord", placeholder: "Username" },
] as const;
