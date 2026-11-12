/**
 * Pokémon Champions' current regulation (the season list in champions.json). Regulations rotate every one to three
 * months; when a new one is announced, replace champions.json's rows (dex, name with its form, types, flags) and
 * these lines, and bump `checkedOn`. A monthly reminder (/api/cron/champions-season) asks staff to check; nothing
 * updates itself.
 *
 * Checked 2026-11-11 (Pokémon Champions game space picks, 2026-11-11): Regulation Set M-C is still the one in play
 * and its list hasn't changed since the 2026-09-29 research. The official pages name the regulation, its dates and
 * its highlights, and point to the game for the full roster, so the list itself comes from Serebii's three "newly
 * usable" tables (M-A, M-B, M-C), diffed against champions.json: the same 231 Pokédex numbers, the same types.
 * Rules from the Play! Pokémon VGC handbook (revised Sept 1, 2026): a team of four to six, four brought to each game,
 * no two Pokémon with the same National Pokédex number, no two holding the same item, everyone at level 50, open
 * team lists. No Legendary or Mythical Pokémon are in M-C.
 */

export interface ChampionsSeason {
  /** Short name ("M-C"). */
  regulation: string;
  /** Its full name. */
  name: string;
  /** Pacific days it runs (inclusive). */
  starts: string;
  ends: string;
  /** The Pacific day someone last checked the list against official sources. */
  checkedOn: string;
  sources: { label: string; url: string; official: boolean }[];
}

export const CHAMPIONS_SEASON: ChampionsSeason = {
  regulation: "M-C",
  name: "Regulation Set M-C",
  // Sep 9, 2026 02:00 UTC to Dec 2, 2026 01:59 UTC: Sep 8 7pm PDT to Dec 1 5:59pm PST.
  starts: "2026-09-08",
  ends: "2026-12-01",
  checkedOn: "2026-11-11",
  sources: [
    { label: "Get ready for Regulation Set M-C (pokemon.com, Sep 2)", url: "https://www.pokemon.com/us/news/get-ready-for-regulation-set-m-c-in-pokemon-champions", official: true },
    { label: "Regulation M-C overview (pokemon.com, Oct 22)", url: "https://www.pokemon.com/us/features/pokemon-champions-regulation-m-c-overview", official: true },
    { label: "Pokémon Champions news", url: "https://champions.pokemon.com/en-us/news/", official: true },
    { label: "Play! Pokémon VGC tournament handbook (Sept 1, 2026)", url: "https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-vgc-tournament-handbook-en.pdf", official: true },
    { label: "Serebii: Regulation M-C", url: "https://www.serebii.net/pokemonchampions/rankedbattle/regulationm-c.shtml", official: false },
  ],
};
