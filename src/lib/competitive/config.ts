/**
 * What "competitive" means for a given game, as data.
 *
 * The MK8DX page used to hardcode its points table, race counts, lobby size and
 * team modes, which meant a second title was a fork of the page rather than a
 * row in a table. This reads that model from `game_competitive_configs.scoring`.
 *
 * Client-safe: the shapes and the MK8DX fallback are pure. The loader takes a
 * Supabase client so it works from either side.
 */

export interface PointsRow { place: string; points: number }
export interface CommunityLink { label: string; url: string; blurb?: string }
export interface TeamMode { value: string; label: string; teams: number; perTeam: number }

export interface CompetitiveConfig {
  gameSlug: string;
  displayName: string;
  /** What one scored unit is called: "race", "game", "map". */
  roundLabel: string;
  lobbySize: number;
  raceCounts: number[];
  defaultRaceCount: number;
  /** Whether this game has the per-character data the select screen needs. */
  hasCharacterSelect: boolean;
  pointsTable: PointsRow[];
  teamModes: TeamMode[];
  /** Outbound links to the game's real community resources. */
  communityLinks: CommunityLink[];
}

/**
 * MK8DX, exactly as the page hardcoded it. Kept as a fallback so the competitive
 * hub keeps working on an environment where `competitive-m1.sql` has not been
 * applied yet, rather than rendering an empty scoring table.
 */
export const MK8DX_FALLBACK: CompetitiveConfig = {
  gameSlug: "mario-kart-8-deluxe",
  displayName: "Mario Kart 8 Deluxe",
  roundLabel: "race",
  lobbySize: 12,
  raceCounts: [4, 6, 8, 12, 16],
  defaultRaceCount: 12,
  hasCharacterSelect: true,
  pointsTable: [
    { place: "1st", points: 15 }, { place: "2nd", points: 12 }, { place: "3rd", points: 10 },
    { place: "4th", points: 9 }, { place: "5th", points: 8 }, { place: "6th", points: 7 },
    { place: "7th", points: 6 }, { place: "8th", points: 5 }, { place: "9th", points: 4 },
    { place: "10th", points: 3 }, { place: "11th", points: 2 }, { place: "12th", points: 1 },
  ],
  communityLinks: [
    { label: "MKCentral", url: "https://www.mariokartcentral.com/", blurb: "Rankings, events and the wider competitive community." },
    { label: "MK8DX Lounge", url: "https://www.mk8dx-lounge.com/", blurb: "The ranked ladder: MMR, tiers and season standings." },
  ],
  teamModes: [
    { value: "ffa", label: "FFA", teams: 12, perTeam: 1 },
    { value: "2v2", label: "2v2", teams: 6, perTeam: 2 },
    { value: "3v3", label: "3v3", teams: 4, perTeam: 3 },
    { value: "4v4", label: "4v4", teams: 3, perTeam: 4 },
    { value: "6v6", label: "6v6", teams: 2, perTeam: 6 },
  ],
};

interface MinimalClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): { maybeSingle(): Promise<{ data: unknown; error: unknown }> };
      order(col: string): Promise<{ data: unknown; error: unknown }>;
    };
  };
}

function toConfig(row: Record<string, unknown>): CompetitiveConfig | null {
  const s = row.scoring as Partial<CompetitiveConfig> | null;
  if (!s || !Array.isArray(s.pointsTable) || s.pointsTable.length === 0) return null;
  return {
    gameSlug: row.game_slug as string,
    displayName: (row.display_name as string | null) ?? (row.game_slug as string),
    roundLabel: s.roundLabel ?? "race",
    lobbySize: s.lobbySize ?? 12,
    raceCounts: s.raceCounts ?? [12],
    defaultRaceCount: s.defaultRaceCount ?? 12,
    hasCharacterSelect: s.hasCharacterSelect ?? false,
    pointsTable: s.pointsTable,
    teamModes: s.teamModes ?? [{ value: "ffa", label: "FFA", teams: s.lobbySize ?? 12, perTeam: 1 }],
    communityLinks: (row.community_links as CommunityLink[] | null) ?? [],
  };
}

/** One game's competitive model. Falls back to MK8DX's built-in table pre-migration. */
export async function loadCompetitiveConfig(client: MinimalClient, gameSlug: string): Promise<CompetitiveConfig | null> {
  try {
    const { data, error } = await client
      .from("game_competitive_configs")
      .select("game_slug, display_name, scoring, active, community_links")
      .eq("game_slug", gameSlug)
      .maybeSingle();
    if (error || !data) throw new Error("no row");
    return toConfig(data as Record<string, unknown>);
  } catch {
    return gameSlug === MK8DX_FALLBACK.gameSlug ? MK8DX_FALLBACK : null;
  }
}

/** Every game with a competitive surface, for the hub index and route validation. */
export async function listCompetitiveGames(client: MinimalClient): Promise<CompetitiveConfig[]> {
  try {
    const { data, error } = await client
      .from("game_competitive_configs")
      .select("game_slug, display_name, scoring, active, community_links")
      .order("game_slug");
    if (error) throw new Error("query failed");
    return ((data as Record<string, unknown>[]) ?? [])
      .filter((r) => r.active !== false)
      .map(toConfig)
      .filter((c): c is CompetitiveConfig => c !== null);
  } catch {
    return [MK8DX_FALLBACK];
  }
}

/** Points for a finishing position (1-indexed). Outside the table scores nothing. */
export function pointsForPosition(config: CompetitiveConfig, position: number): number {
  return config.pointsTable[position - 1]?.points ?? 0;
}
