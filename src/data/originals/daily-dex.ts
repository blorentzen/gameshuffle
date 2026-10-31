/**
 * The Daily Dex's region and debut game hints (src/lib/originals/dailyDex.ts).
 * By default a Pokémon is first found in its generation's region and first
 * appeared in that generation's first pair of games; the overrides cover the
 * ones that arrived later (Ultra Sun and Ultra Moon, Pokémon GO, Legends:
 * Arceus, the DLC). Checked against every species page on Bulbapedia,
 * 2026-10-16: only #803 to 809, #891 to 905 and #1009 to 1025 debuted outside
 * their generation's first pair (the older mythicals all had entries there).
 */

export const DEX_GEN_DEFAULTS: Record<number, { region: string; game: string }> = {
  1: { region: "Kanto", game: "Pokémon Red and Green (Red and Blue outside Japan)" },
  2: { region: "Johto", game: "Pokémon Gold and Silver" },
  3: { region: "Hoenn", game: "Pokémon Ruby and Sapphire" },
  4: { region: "Sinnoh", game: "Pokémon Diamond and Pearl" },
  5: { region: "Unova", game: "Pokémon Black and White" },
  6: { region: "Kalos", game: "Pokémon X and Y" },
  7: { region: "Alola", game: "Pokémon Sun and Moon" },
  8: { region: "Galar", game: "Pokémon Sword and Shield" },
  9: { region: "Paldea", game: "Pokémon Scarlet and Violet" },
};

/** Where a Pokémon is first found, when it isn't its generation's region. */
export const DEX_REGION: Record<string, string> = {
  // Found in Kanto in Let's Go, Pikachu! and Let's Go, Eevee! (Pokémon GO is set in the real world).
  Meltan: "Kanto", Melmetal: "Kanto",
  // Pokémon Legends: Arceus, Sinnoh long ago.
  Wyrdeer: "Hisui", Kleavor: "Hisui", Ursaluna: "Hisui", Basculegion: "Hisui", Sneasler: "Hisui", Overqwil: "Hisui", Enamorus: "Hisui",
  // The Teal Mask, and Pecharunt in the Mochi Mayhem epilogue.
  Dipplin: "Kitakami", Poltchageist: "Kitakami", Sinistcha: "Kitakami", Okidogi: "Kitakami", Munkidori: "Kitakami", Fezandipiti: "Kitakami", Ogerpon: "Kitakami", Pecharunt: "Kitakami",
  // Evolution only, with the Metal Alloy and Dragon Cheer from Blueberry Academy.
  Archaludon: "Unova", Hydrapple: "Unova",
};

const USUM = "Pokémon Ultra Sun and Ultra Moon";
const ARMOR = "Pokémon Sword and Shield: The Isle of Armor";
const TUNDRA = "Pokémon Sword and Shield: The Crown Tundra";
const LEGENDS = "Pokémon Legends: Arceus";
const TEAL = "Pokémon Scarlet and Violet: The Teal Mask";
const INDIGO = "Pokémon Scarlet and Violet: The Indigo Disk";

/** The game a Pokémon first appeared in, when it isn't its generation's first pair. */
export const DEX_DEBUT: Record<string, string> = {
  Poipole: USUM, Naganadel: USUM, Stakataka: USUM, Blacephalon: USUM, Zeraora: USUM,
  Meltan: "Pokémon GO", Melmetal: "Pokémon GO",
  Kubfu: ARMOR, Urshifu: ARMOR, Zarude: ARMOR,
  Regieleki: TUNDRA, Regidrago: TUNDRA, Glastrier: TUNDRA, Spectrier: TUNDRA, Calyrex: TUNDRA,
  Wyrdeer: LEGENDS, Kleavor: LEGENDS, Ursaluna: LEGENDS, Basculegion: LEGENDS, Sneasler: LEGENDS, Overqwil: LEGENDS, Enamorus: LEGENDS,
  Dipplin: TEAL, Poltchageist: TEAL, Sinistcha: TEAL, Okidogi: TEAL, Munkidori: TEAL, Fezandipiti: TEAL, Ogerpon: TEAL,
  Archaludon: INDIGO, Hydrapple: INDIGO, "Gouging Fire": INDIGO, "Raging Bolt": INDIGO, "Iron Boulder": INDIGO, "Iron Crown": INDIGO, Terapagos: INDIGO,
  // Caught in the Mochi Mayhem epilogue, which came with The Indigo Disk (Bulbapedia and Serebii both file it there).
  Pecharunt: INDIGO,
};
