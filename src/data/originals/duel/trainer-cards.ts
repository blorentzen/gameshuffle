/**
 * Daily Duel: each trainer's picture (picks 2026-10-21, https://claude.ai/artifact/4YeQz1MVRnuBLkSHmkMCmp,
 * every option as recommended). A person's picture is the art window of their own Supporter card,
 * the regular print (never a full art), every trainer framed the same way; a person with no card
 * of their own gets their ace's card art instead (the last card of the team on screen), cut to the
 * same art window the hologram uses. Keyed by person (rules.ts personOf), so every team of a
 * person shares the picture.
 *
 * Cards: the newest regular print of a Supporter card named for the person, found on the public
 * Pokémon TCG API (whose ids match Scrydex's) on 2026-10-21, with an earlier print where the newest
 * has an autograph across its art (Crown Zenith) or a weak portrait (notes beside each). The
 * illustrator is the one that API gives, read off the card's own "Illus." line where the API has
 * none (16 newer cards). The cards are stored in our Scrydex catalog by
 * `scripts/populate-duel-cards.ts --trainers --run` (1 credit per card not stored yet), and
 * scripts/build-duel-cards.ts writes each picture's image (exactly as Scrydex returned it) and
 * shape to trainer-art.generated.ts.
 *
 * `face`: where the face is in the art window (x and y as shares of its width and height) and the
 * round portrait's zoom (1 shows the art window's full height in the circle, 2 half of it). Set by
 * hand from a contact sheet of the round crops. Client-safe: no server imports.
 */

/** A rectangle on a card image: x, y, width, height as shares of the image. */
export type ArtBox = readonly [number, number, number, number];

/** A person's own Supporter card, or `{ card: null }`: no card shows them, so the picture is their ace's card art. */
export type DuelTrainerCardPlan =
  | {
    /** The Scrydex id of the regular print. */
    card: string;
    /** The card's printed name, its set and its illustrator, for the credit. */
    name: string;
    set: string;
    artist: string;
    /** The face in the art window (x, y as shares of it) and the round portrait's zoom. */
    face: readonly [number, number, number];
    /** An art window for this card alone, when its era's doesn't fit. */
    box?: ArtBox;
  }
  | { card: null };

/**
 * A Supporter card's art window by era, measured on Scrydex's medium images on 2026-10-21 and set a
 * hair inside the art (about 1% a side), so no frame ever shows at an edge. Scarlet & Violet was
 * measured again to the pixel on 2026-10-22 across its 36 cards (art from row 72 to 263 and column 29
 * to 337 of 367x512, inside the thin grey border): the 1% cut the top of Larry's hair, which runs to
 * the picture's edge.
 */
export const SUPPORTER_ART: Record<"sv" | "swsh" | "sm" | "xy" | "pl", ArtBox> = {
  sv: [0.08, 0.141, 0.838, 0.373],
  swsh: [0.088, 0.15, 0.824, 0.364],
  sm: [0.088, 0.152, 0.824, 0.36],
  xy: [0.105, 0.168, 0.786, 0.336],
  pl: [0.10, 0.15, 0.80, 0.345],
};

/** The era a card id belongs to, for its art window (Mega Evolution cards share Scarlet & Violet's frame; Generations and Black & White share XY's). */
export function supporterEra(id: string): keyof typeof SUPPORTER_ART {
  if (/^(sv|rsv|me)/.test(id)) return "sv";
  if (/^swsh/.test(id)) return "swsh";
  if (/^sm/.test(id)) return "sm";
  if (/^(xy|g1|bw)/.test(id)) return "xy";
  return "pl";
}

/** A Pokémon card's art window (the hologram's crop, TypeCard's window): an ace's picture. */
export const POKEMON_ART: ArtBox = [0.11, 0.13, 0.78, 0.305];

/** The default round crop of an ace's art: the middle, a little closer. */
export const ACE_FACE: readonly [number, number, number] = [0.5, 0.5, 1.15];

/** A full art card's picture: the illustration between the name bar and the attack text. */
const FULL_ART: ArtBox = [0.06, 0.165, 0.88, 0.345];

/**
 * Each ace's art window and face, by card id (only the 32 aces of people with no card are ever
 * shown): the full illustration of a full art card, a shorter window where text or a set stamp
 * sits inside the usual one, and where the Pokémon's face is. Set by hand from a contact sheet.
 */
export const ACE_ART: Record<string, { box?: ArtBox; face?: readonly [number, number, number] }> = {
  "ecard3-H22": { face: [0.72, 0.72, 1.3] }, // Pryce's Piloswine
  "xy5-108": { box: [0.11, 0.175, 0.78, 0.26], face: [0.5, 0.3, 1.3] }, // Clair's and Juan's Kingdra: its Ancient Trait sits at the top of the window
  "me5-89": { box: FULL_ART, face: [0.25, 0.55, 1.3] }, // Wattson's Manectric
  "sm12-69": { face: [0.4, 0.5, 1.2] }, // Wattson's Magneton
  "sv4pt5-174": { face: [0.72, 0.32, 1.4] }, // Maylene's Lucario
  "zsv10pt5-147": { box: FULL_ART, face: [0.42, 0.45, 1.3] }, // Drayden's Haxorus
  "svp-172": { face: [0.47, 0.5, 1.3] }, // Valerie's Sylveon
  "sm6-30": { face: [0.66, 0.3, 1.3] }, // Wulfric's Avalugg
  "sv3pt5-14": { face: [0.4, 0.35, 1.3] }, // Bugsy's Kakuna
  "sm1-32": { face: [0.65, 0.4, 1.3] }, // Chuck's Poliwrath
  "mep-85": { box: [0.11, 0.13, 0.78, 0.26], face: [0.42, 0.6, 1.2] }, // Byron's Bastiodon: a set stamp in the bottom corner
  "swsh12pt5-89": { face: [0.45, 0.45, 1.3] }, // Byron's Aggron
  "me4-97": { box: FULL_ART, face: [0.52, 0.42, 1.3] }, // Lenora's Watchog
  "rsv10pt5-89": { box: FULL_ART, face: [0.55, 0.35, 1.3] }, // Burgh's Leavanny
  "zsv10pt5-110": { box: FULL_ART, face: [0.42, 0.3, 1.3] }, // Brycen's Beartic
  "swsh5-42": { face: [0.32, 0.65, 1.3] }, // Marlon's Jellicent
  "sv8-193": { box: FULL_ART, face: [0.55, 0.5, 1.15] }, // Viola's Vivillon
  "sm4-11": { face: [0.62, 0.25, 1.3] }, // Ramos's Gogoat
  "me55-134": { box: FULL_ART, face: [0.6, 0.45, 1.3] }, // Ryme's Toxtricity
  "sv7-158": { box: [0.06, 0.17, 0.88, 0.36], face: [0.65, 0.45, 1.3] }, // Lorelei's Lapras ex: a full art with its Ability over the top of the art
  "me55-131": { box: FULL_ART, face: [0.62, 0.3, 1.3] }, // Lorelei's Lapras
  "swsh7-109": { face: [0.6, 0.2, 1.4] }, // Drake's Salamence
  "rsv10pt5-134": { box: FULL_ART, face: [0.45, 0.28, 1.3] }, // Marshal's Mienshao
  "zsv10pt5-127": { box: FULL_ART, face: [0.42, 0.5, 1.3] }, // Marshal's Conkeldurr
  "me3-91": { box: FULL_ART, face: [0.82, 0.8, 1.4] }, // Malva's Talonflame
  "sv4-210": { box: FULL_ART, face: [0.45, 0.5, 1.2] }, // Wikstrom's Aegislash
  "ex10-110": { face: [0.4, 0.45, 1.3] }, // Silver's Typhlosion ex
  "xy10-13": { face: [0.62, 0.25, 1.3] }, // Calem's Delphox
  "sv10-192": { box: FULL_ART, face: [0.32, 0.62, 1.4] }, // Brendan's Blaziken
  "np-9": { box: [0.11, 0.13, 0.78, 0.26], face: [0.35, 0.2, 1.2] }, // May's Combusken: a set stamp in the bottom corner
  "svp-169": { face: [0.75, 0.35, 1.3] }, // Trace's Jolteon
  "zsv10pt5-100": { box: FULL_ART, face: [0.38, 0.62, 1.3] }, // Alder's Volcarona
};

export const DUEL_TRAINER_CARDS: Record<string, DuelTrainerCardPlan> = {
  // ── Gym Leaders and kahunas ───────────────────────────────────────────────────────────────────
  "allister": { card: "swsh4-146", name: "Allister", set: "Vivid Voltage", artist: "take", face: [0.55, 0.32, 1.8] },
  // Bea: Crown Zenith's Bea carries an autograph across the art; her Vivid Voltage card doesn't.
  "bea": { card: "swsh4-147", name: "Bea", set: "Vivid Voltage", artist: "take", face: [0.45, 0.33, 2] },
  "blaine": { card: "sm115-52", name: "Blaine's Last Stand", set: "Hidden Fates", artist: "Ken Sugimori", face: [0.43, 0.25, 2] },
  "brassius": { card: "sv3-187", name: "Brassius", set: "Obsidian Flames", artist: "GIDORA", face: [0.5, 0.2, 2] },
  // Brawly: the only regular print, with a Battle Style mark in its art.
  "brawly": { card: "swsh6-131", name: "Brawly", set: "Chilling Reign", artist: "Megumi Mizutani", face: [0.44, 0.26, 2] },
  "brock": { card: "sv9-146", name: "Brock's Scouting", set: "Journey Together", artist: "Teeziro", face: [0.53, 0.22, 2] },
  "brycen": { card: null },
  "bugsy": { card: null },
  "burgh": { card: null },
  "byron": { card: null },
  "candice": { card: "swsh12-152", name: "Candice", set: "Silver Tempest", artist: "Ken Sugimori", face: [0.51, 0.18, 2] },
  "chuck": { card: null },
  // Cilan: his own card (Chili & Cilan & Cress shows all three).
  "cilan": { card: "bw4-86", name: "Cilan", set: "Next Destinies", artist: "Yusuke Ohmura", face: [0.53, 0.18, 2] },
  "clair": { card: null },
  "clay": { card: "sm12-188", name: "Clay", set: "Cosmic Eclipse", artist: "Yusuke Ohmura", face: [0.6, 0.15, 2] },
  "clemont": { card: "sv8-167", name: "Clemont's Quick Wit", set: "Surging Sparks", artist: "Naoki Saito", face: [0.38, 0.32, 1.5] },
  "crasher-wake": { card: "sm6-104", name: "Crasher Wake", set: "Forbidden Light", artist: "Ken Sugimori", face: [0.48, 0.17, 2] },
  "drayden": { card: null },
  "elesa": { card: "bw11-RC20", name: "Elesa", set: "Legendary Treasures", artist: "Yusuke Ohmura", face: [0.4, 0.22, 2] },
  "erika": { card: "sm12-191", name: "Erika", set: "Cosmic Eclipse", artist: "Megumi Mizutani", face: [0.52, 0.22, 2] },
  "falkner": { card: "sv2-180", name: "Falkner", set: "Paldea Evolved", artist: "Ryuta Fuse", face: [0.38, 0.2, 2] },
  "fantina": { card: "swsh11-157", name: "Fantina", set: "Lost Origin", artist: "Ryuta Fuse", face: [0.4, 0.3, 2] },
  // Flannery: the only regular print, with a Battle Style mark in its art.
  "flannery": { card: "swsh6-139", name: "Flannery", set: "Chilling Reign", artist: "Megumi Mizutani", face: [0.43, 0.33, 1.8] },
  "gardenia": { card: "swsh10-143", name: "Gardenia's Vigor", set: "Astral Radiance", artist: "Yuu Nishida", face: [0.27, 0.18, 2] },
  "giovanni": { card: "sv3pt5-161", name: "Giovanni's Charisma", set: "151", artist: "hncl", face: [0.47, 0.22, 2] },
  "gordie": { card: "swsh7-149", name: "Gordie", set: "Evolving Skies", artist: "take", face: [0.48, 0.17, 2] },
  "grant": { card: "swsh10-144", name: "Grant", set: "Astral Radiance", artist: "Hideki Ishikawa", face: [0.53, 0.22, 2] },
  "grusha": { card: "sv2-184", name: "Grusha", set: "Paldea Evolved", artist: "GIDORA", face: [0.52, 0.25, 2] },
  "hala": { card: "sm2-126", name: "Hala", set: "Guardians Rising", artist: "Ken Sugimori", face: [0.5, 0.15, 2] },
  "hapu": { card: "sm11-200", name: "Hapu", set: "Unified Minds", artist: "Ken Sugimori", face: [0.53, 0.35, 1.7] },
  "iono": { card: "sv4pt5-80", name: "Iono", set: "Paldean Fates", artist: "Sanosuke Sakuma", face: [0.55, 0.23, 2] },
  "iris": { card: "bw10-81", name: "Iris", set: "Plasma Blast", artist: "Yusuke Ohmura", face: [0.46, 0.17, 2] },
  "janine": { card: "sv8pt5-112", name: "Janine's Secret Art", set: "Prismatic Evolutions", artist: "Taira Akitsu", face: [0.37, 0.4, 2] },
  "jasmine": { card: "sv8-178", name: "Jasmine's Gaze", set: "Surging Sparks", artist: "Taira Akitsu", face: [0.47, 0.26, 2] },
  "juan": { card: null },
  "kabu": { card: "swsh35-55", name: "Kabu", set: "Champion's Path", artist: "take", face: [0.53, 0.12, 2] },
  "katy": { card: "sv1-177", name: "Katy", set: "Scarlet & Violet", artist: "Akira Komayama", face: [0.52, 0.28, 2] },
  "kofu": { card: "sv7-138", name: "Kofu", set: "Stellar Crown", artist: "Hideki Ishikawa", face: [0.48, 0.17, 2] },
  "koga": { card: "sm115-59", name: "Koga's Trap", set: "Hidden Fates", artist: "Megumi Mizutani", face: [0.65, 0.35, 2] },
  // Korrina: Korrina's Focus carries the Rapid Strike mark across her art; her own Furious Fists card doesn't.
  "korrina": { card: "xy3-95", name: "Korrina", set: "Furious Fists", artist: "Yusuke Ohmura", face: [0.5, 0.27, 2] },
  "larry": { card: "sv4-165", name: "Larry", set: "Paradox Rift", artist: "Akira Komayama", face: [0.49, 0.22, 2] },
  "lenora": { card: null },
  "lt-surge": { card: "me1-120", name: "Lt. Surge's Bargain", set: "Mega Evolution", artist: "Hideki Ishikawa", face: [0.47, 0.18, 1.6] },
  "marlon": { card: null },
  "maylene": { card: null },
  "melony": { card: "swsh6-146", name: "Melony", set: "Chilling Reign", artist: "take", face: [0.5, 0.18, 2] },
  "milo": { card: "swsh35-57", name: "Milo", set: "Champion's Path", artist: "take", face: [0.5, 0.22, 2] },
  "misty": { card: "me5-80", name: "Misty's Vitality", set: "Pitch Black", artist: "En Morikura", face: [0.5, 0.29, 2] },
  "morty": { card: "sm8-186", name: "Morty", set: "Lost Thunder", artist: "Ken Sugimori", face: [0.57, 0.17, 2] },
  "nanu": { card: "sm9-150", name: "Nanu", set: "Team Up", artist: "Ken Sugimori", face: [0.53, 0.2, 2] },
  // Nessa: Crown Zenith's Nessa carries an autograph across the art; her Vivid Voltage card doesn't.
  "nessa": { card: "swsh4-157", name: "Nessa", set: "Vivid Voltage", artist: "take", face: [0.5, 0.13, 2] },
  "norman": { card: "sv4-168", name: "Norman", set: "Paradox Rift", artist: "Hideki Ishikawa", face: [0.51, 0.18, 2] },
  "olivia": { card: "sm3-119", name: "Olivia", set: "Burning Shadows", artist: "Ken Sugimori", face: [0.53, 0.15, 2] },
  "olympia": { card: "g1-66", name: "Olympia", set: "Generations", artist: "Ken Sugimori", face: [0.55, 0.17, 2] },
  "opal": { card: "swsh4-158", name: "Opal", set: "Vivid Voltage", artist: "take", face: [0.4, 0.22, 2] },
  "piers": { card: "swsh35-58", name: "Piers", set: "Champion's Path", artist: "take", face: [0.45, 0.2, 2] },
  "pryce": { card: null },
  // Raihan: Crown Zenith's Raihan carries an autograph across the art; his Evolving Skies card doesn't.
  "raihan": { card: "swsh7-152", name: "Raihan", set: "Evolving Skies", artist: "take", face: [0.5, 0.13, 2] },
  "ramos": { card: null },
  "roark": { card: "sv4-173", name: "Roark", set: "Paradox Rift", artist: "Ryuta Fuse", face: [0.33, 0.16, 2] },
  "roxanne": { card: "swsh10-150", name: "Roxanne", set: "Astral Radiance", artist: "Megumi Mizutani", face: [0.48, 0.25, 2] },
  "roxie": { card: "me4-81", name: "Roxie's Performance", set: "Chaos Rising", artist: "Nobusawa/Mochipuyo", face: [0.55, 0.25, 2] },
  "ryme": { card: null },
  "sabrina": { card: "sm115-65", name: "Sabrina's Suggestion", set: "Hidden Fates", artist: "Hitoshi Ariga", face: [0.6, 0.26, 2] },
  "skyla": { card: "swsh2-166", name: "Skyla", set: "Rebel Clash", artist: "Hideki Ishikawa", face: [0.3, 0.33, 1.7] },
  "tate-liza": { card: "sm7-148", name: "Tate & Liza", set: "Celestial Storm", artist: "Megumi Mizutani", face: [0.46, 0.3, 1.4] },
  "tulip": { card: "sv4-181", name: "Tulip", set: "Paradox Rift", artist: "Naoki Saito", face: [0.5, 0.18, 2] },
  "valerie": { card: null },
  "viola": { card: null },
  "volkner": { card: "sm5-135", name: "Volkner", set: "Ultra Prism", artist: "Ken Sugimori", face: [0.47, 0.37, 2] },
  "wallace": { card: "swsh12-166", name: "Wallace", set: "Silver Tempest", artist: "Megumi Mizutani", face: [0.46, 0.18, 2] },
  "wattson": { card: null },
  "whitney": { card: "sm8-193", name: "Whitney", set: "Lost Thunder", artist: "Ken Sugimori", face: [0.47, 0.17, 2] },
  "winona": { card: "xy6-96", name: "Winona", set: "Roaring Skies", artist: "Megumi Mizutani", face: [0.53, 0.27, 2] },
  "wulfric": { card: null },
  // ── Elite Four ────────────────────────────────────────────────────────────────────────────────
  "aaron": { card: "pl2-88", name: "Aaron's Collection", set: "Rising Rivals", artist: "Ken Sugimori", face: [0.5, 0.25, 2] },
  "acerola": { card: "sm3-112", name: "Acerola", set: "Burning Shadows", artist: "Ken Sugimori", face: [0.5, 0.3, 2] },
  "agatha": { card: "swsh6-129", name: "Agatha", set: "Chilling Reign", artist: "Ken Sugimori", face: [0.55, 0.15, 2] },
  "amarys": { card: "sv8pt5-93", name: "Amarys", set: "Prismatic Evolutions", artist: "Akira Komayama", face: [0.53, 0.16, 2] },
  "bertha": { card: "pl2-90", name: "Bertha's Warmth", set: "Rising Rivals", artist: "Ken Sugimori", face: [0.48, 0.27, 2] },
  // Bruno: the only regular print, with a Battle Style mark in its art.
  "bruno": { card: "swsh5-121", name: "Bruno", set: "Battle Styles", artist: "Ken Sugimori", face: [0.5, 0.17, 2] },
  "caitlin": { card: "swsh6-132", name: "Caitlin", set: "Chilling Reign", artist: "Sanosuke Sakuma", face: [0.59, 0.3, 2] },
  "crispin": { card: "sv8pt5-105", name: "Crispin", set: "Prismatic Evolutions", artist: "GIDORA", face: [0.52, 0.22, 2] },
  "drake": { card: null },
  "drasna": { card: "sv8-173", name: "Drasna", set: "Surging Sparks", artist: "Hideki Ishikawa", face: [0.6, 0.17, 2] },
  "drayton": { card: "sv8-174", name: "Drayton", set: "Surging Sparks", artist: "GIDORA", face: [0.48, 0.22, 2] },
  "flint": { card: "pl2-91", name: "Flint's Willpower", set: "Rising Rivals", artist: "Ken Sugimori", face: [0.53, 0.25, 2] },
  "grimsley": { card: "sm11-199", name: "Grimsley", set: "Unified Minds", artist: "kodama", face: [0.47, 0.17, 2] },
  "hassel": { card: "sv6-151", name: "Hassel", set: "Twilight Masquerade", artist: "GOSSAN", face: [0.59, 0.15, 2] },
  "kahili": { card: "sm8-179", name: "Kahili", set: "Lost Thunder", artist: "Ken Sugimori", face: [0.53, 0.3, 2] },
  "karen": { card: "xyp-XY177", name: "Karen", set: "XY Black Star Promos", artist: "You Iribi", face: [0.37, 0.27, 2] },
  "lacey": { card: "sv8pt5-114", name: "Lacey", set: "Prismatic Evolutions", artist: "Sanosuke Sakuma", face: [0.47, 0.22, 2] },
  "lance": { card: "swsh12-159", name: "Lance", set: "Silver Tempest", artist: "Ken Sugimori", face: [0.6, 0.18, 2] },
  // Lorelei: only on Misty & Lorelei, a card for two.
  "lorelei": { card: null },
  "lucian": { card: "sv6-157", name: "Lucian", set: "Twilight Masquerade", artist: "hncl", face: [0.42, 0.2, 2] },
  "malva": { card: null },
  "marshal": { card: null },
  "molayne": { card: "sm10-181", name: "Molayne", set: "Unbroken Bonds", artist: "Ken Sugimori", face: [0.48, 0.22, 2] },
  "phoebe": { card: "swsh5-130", name: "Phoebe", set: "Battle Styles", artist: "GAME FREAK inc.", face: [0.52, 0.2, 2] },
  "poppy": { card: "sv3-193", name: "Poppy", set: "Obsidian Flames", artist: "yuu", face: [0.53, 0.27, 2] },
  "rika": { card: "sv4-172", name: "Rika", set: "Paradox Rift", artist: "GIDORA", face: [0.44, 0.2, 2] },
  "shauntal": { card: "sv4-174", name: "Shauntal", set: "Paradox Rift", artist: "yuu", face: [0.5, 0.3, 2] },
  "sidney": { card: "swsh8-241", name: "Sidney", set: "Fusion Strike", artist: "Hideki Ishikawa", face: [0.42, 0.4, 2] },
  // Siebold: the only regular print, with a Battle Style mark in its art.
  "siebold": { card: "swsh6-153", name: "Siebold", set: "Chilling Reign", artist: "Ken Sugimori", face: [0.5, 0.18, 2] },
  "wikstrom": { card: null },
  "will": { card: "sm12-208", name: "Will", set: "Cosmic Eclipse", artist: "Ken Sugimori", face: [0.52, 0.28, 2] },
  // ── Rivals ────────────────────────────────────────────────────────────────────────────────────
  "arven": { card: "sv3-186", name: "Arven", set: "Obsidian Flames", artist: "GIDORA", face: [0.5, 0.18, 2] },
  "barry": { card: "swsh9-130", name: "Barry", set: "Brilliant Stars", artist: "Ken Sugimori", face: [0.53, 0.18, 2] },
  // Bede: Crown Zenith's Bede carries an autograph across the art; his Champion's Path card doesn't.
  "bede": { card: "swsh35-50", name: "Bede", set: "Champion's Path", artist: "Naoki Saito", face: [0.56, 0.25, 2] },
  "bianca": { card: "sv5-142", name: "Bianca's Devotion", set: "Temporal Forces", artist: "En Morikura", face: [0.47, 0.25, 1.8] },
  "brendan": { card: null },
  "calem": { card: null },
  "cheren": { card: "rsv10pt5-81", name: "Cheren", set: "White Flare", artist: "Atsushi Furusawa", face: [0.47, 0.25, 2] },
  "gladion": { card: "sm4-95", name: "Gladion", set: "Crimson Invasion", artist: "Ken Sugimori", face: [0.52, 0.2, 2] },
  // Hop: Crown Zenith's Hop carries an autograph across the art; his Champion's Path card doesn't.
  "hop": { card: "swsh35-53", name: "Hop", set: "Champion's Path", artist: "Sanosuke Sakuma", face: [0.55, 0.35, 2] },
  "hugh": { card: "bw7-130", name: "Hugh", set: "Boundaries Crossed", artist: "Yusuke Ohmura", face: [0.47, 0.17, 2] },
  "marnie": { card: "swsh35-56", name: "Marnie", set: "Champion's Path", artist: "kirisAki", face: [0.5, 0.27, 2] },
  "may": { card: null },
  "n": { card: "xy10-105", name: "N", set: "Fates Collide", artist: "Megumi Mizutani", face: [0.33, 0.35, 1.8] },
  "nemona": { card: "sv4pt5-82", name: "Nemona", set: "Paldean Fates", artist: "Sanosuke Sakuma", face: [0.53, 0.18, 2] },
  "penny": { card: "sv1-183", name: "Penny", set: "Scarlet & Violet", artist: "yuu", face: [0.45, 0.23, 2] },
  "serena": { card: "swsh12-164", name: "Serena", set: "Silver Tempest", artist: "Ken Sugimori", face: [0.55, 0.15, 2] },
  "shauna": { card: "swsh8-240", name: "Shauna", set: "Fusion Strike", artist: "Yuu Nishida", face: [0.38, 0.32, 1.8] },
  "silver": { card: null },
  "trace": { card: null },
  "wally": { card: "g1-RC27", name: "Wally", set: "Generations", artist: "Megumi Mizutani", face: [0.36, 0.58, 1.6] },
  // ── Bosses ────────────────────────────────────────────────────────────────────────────────────
  "archie": { card: "xy5-124", name: "Archie's Ace in the Hole", set: "Primal Clash", artist: "Yusuke Ohmura", face: [0.47, 0.16, 2] },
  "colress": { card: "sv6pt5-57", name: "Colress's Tenacity", set: "Shrouded Fable", artist: "hncl", face: [0.62, 0.3, 2] },
  // Cyrus: Cyrus's Conspiracy in place of the newest print, Cyrus's Initiative (Supreme Victors), whose art reads poorly as a portrait.
  "cyrus": { card: "pl1-105", name: "Cyrus's Conspiracy", set: "Platinum", artist: "Ken Sugimori", face: [0.52, 0.3, 2] },
  "ghetsis": { card: "bw9-101", name: "Ghetsis", set: "Plasma Freeze", artist: "Yusuke Ohmura", face: [0.5, 0.12, 2] },
  "guzma": { card: "sm3-115", name: "Guzma", set: "Burning Shadows", artist: "Ken Sugimori", face: [0.53, 0.18, 2] },
  "lusamine": { card: "sm4-96", name: "Lusamine", set: "Crimson Invasion", artist: "take", face: [0.6, 0.13, 2] },
  "lysandre": { card: "xy7-78", name: "Lysandre", set: "Ancient Origins", artist: "Ken Sugimori", face: [0.5, 0.24, 2] },
  "maxie": { card: "xy5-133", name: "Maxie's Hidden Ball Trick", set: "Primal Clash", artist: "Ken Sugimori", face: [0.5, 0.15, 2] },
  "rose": { card: "swsh3-168", name: "Rose", set: "Darkness Ablaze", artist: "Yusuke Ohmura", face: [0.46, 0.17, 2] },
  "volo": { card: "swsh11-169", name: "Volo", set: "Lost Origin", artist: "kirisAki", face: [0.48, 0.2, 2] },
  // ── Champions ─────────────────────────────────────────────────────────────────────────────────
  "alder": { card: null },
  "blue": { card: "sm11-188", name: "Blue's Tactics", set: "Unified Minds", artist: "Megumi Mizutani", face: [0.5, 0.27, 2] },
  "cynthia": { card: "sm5-119", name: "Cynthia", set: "Ultra Prism", artist: "Ken Sugimori", face: [0.47, 0.17, 2] },
  "diantha": { card: "sm6-105", name: "Diantha", set: "Forbidden Light", artist: "Ken Sugimori", face: [0.53, 0.2, 2] },
  "geeta": { card: "sv3-188", name: "Geeta", set: "Obsidian Flames", artist: "kirisAki", face: [0.52, 0.22, 2] },
  "hau": { card: "sm7-132", name: "Hau", set: "Celestial Storm", artist: "TOKIYA", face: [0.5, 0.22, 2] },
  "kieran": { card: "sv8pt5-113", name: "Kieran", set: "Prismatic Evolutions", artist: "GIDORA", face: [0.47, 0.25, 2] },
  "kukui": { card: "sm1-128", name: "Professor Kukui", set: "Sun & Moon", artist: "Ken Sugimori", face: [0.47, 0.17, 2] },
  // Leon: Crown Zenith's Leon carries an autograph across the art; his Vivid Voltage card doesn't.
  "leon": { card: "swsh4-154", name: "Leon", set: "Vivid Voltage", artist: "Ken Sugimori", face: [0.49, 0.18, 2.2] },
  "red": { card: "sm10-184", name: "Red's Challenge", set: "Unbroken Bonds", artist: "Megumi Mizutani", face: [0.5, 0.21, 2] },
  "steven": { card: "xy6-90", name: "Steven", set: "Roaring Skies", artist: "Megumi Mizutani", face: [0.6, 0.17, 2] },
};
