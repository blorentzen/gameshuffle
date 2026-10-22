/**
 * Daily Duel: the trainer roster. Each day a trainer from the Pokémon games brings the team they used
 * in ONE game, in that game's order (the lead first), from their main battle there (a rematch only
 * where noted). Every team was checked against Bulbapedia on 2026-10-21; Bulbapedia blocks scripted
 * reads, so each source line names the Bulbapedia page and the Wayback Machine snapshot read
 * (https://web.archive.org/web/<snapshot>/<page>).
 *
 * Difficulty by weekday: Monday/Tuesday gym leaders and kahunas (2-5 cards: their first Gym battle,
 * however many the game gives them), Wednesday/Thursday Elite Four (4-6), Friday rivals (3-6),
 * Saturday a villain team's boss (5-6), Sunday Champions (6).
 *
 * The rotation goes by person (rules.ts trainerFor): `person` defaults to the name ("Lt. Surge" →
 * "lt-surge"). A person can have a team in more than one tier (Giovanni the Gym Leader and Giovanni
 * the boss), and later a team for each game they appear in: add a person's next team AFTER their
 * earlier ones in the same tier, and they bring one team per visit, in roster order.
 *
 * `species` is the team as card names spell them ("Alolan Ninetales"); the card for each slot is
 * picked by scripts/populate-duel-cards.ts into team-picks.generated.ts (the trainer's own card when
 * one exists, like "Misty's Starmie"). `owner` is the name on those cards. Ids never change once a
 * day has used them; add trainers, don't edit teams a past day has shown.
 */

import { personKey } from "@/lib/originals/duel/rules";
import type { DuelSignature, DuelTier, DuelTrainer } from "@/lib/originals/duel/types";
import { DUEL_TEAM_PICKS } from "./team-picks.generated";

export interface DuelTrainerPlan {
  id: string;
  /** Who this is across teams; defaults to the name made into a key (rules.ts personKey). Set it when two people share a name. */
  person?: string;
  name: string;
  title: string;
  game: string;
  tier: DuelTier;
  /** The team in battle order, as card names spell each Pokémon. */
  species: string[];
  /** The name printed on the trainer's own cards ("Misty" for "Misty's Starmie"), when they have some. */
  owner?: string;
  /** A card chosen by hand for a slot (slot index → card id), kept over the automatic pick. */
  pin?: Record<number, string>;
  signature: { title: string; effect: DuelSignature };
}

export const DUEL_TRAINER_PLANS: DuelTrainerPlan[] = [
  // ── Gym Leaders and kahunas (Monday, Tuesday) ─────────────────────────────────────────────────

  // Bulbapedia: Vermilion_Gym, FireRed/LeafGreen (snapshot 20260824004235).
  { id: "lt-surge-firered", name: "Lt. Surge", title: "Vermilion City Gym Leader", game: "Pokémon FireRed and LeafGreen", tier: "gym",
    species: ["Voltorb", "Pikachu", "Raichu"], owner: "Lt. Surge",
    signature: { title: "Lightning ambush", effect: "boost30" } },
  // Bulbapedia: Celadon_Gym, FireRed/LeafGreen (snapshot 20260805181139).
  { id: "erika-firered", name: "Erika", title: "Celadon City Gym Leader", game: "Pokémon FireRed and LeafGreen", tier: "gym",
    species: ["Victreebel", "Tangela", "Vileplume"], owner: "Erika",
    signature: { title: "Soothing scent", effect: "heal50" } },
  // Bulbapedia: Fuchsia_Gym, FireRed/LeafGreen (snapshot 20260824135459). Koffing twice, as in the game.
  { id: "koga-firered", name: "Koga", title: "Fuchsia City Gym Leader", game: "Pokémon FireRed and LeafGreen", tier: "gym",
    species: ["Koffing", "Muk", "Koffing", "Weezing"], owner: "Koga",
    signature: { title: "Ninja tricks", effect: "energy2" } },
  // Bulbapedia: Saffron_Gym, FireRed/LeafGreen (snapshot 20260823002846).
  { id: "sabrina-firered", name: "Sabrina", title: "Saffron City Gym Leader", game: "Pokémon FireRed and LeafGreen", tier: "gym",
    species: ["Kadabra", "Mr. Mime", "Venomoth", "Alakazam"], owner: "Sabrina",
    signature: { title: "I saw this coming", effect: "energy2" } },
  // Bulbapedia: Cinnabar_Gym, FireRed/LeafGreen (snapshot 20260909114723).
  { id: "blaine-firered", name: "Blaine", title: "Cinnabar Island Gym Leader", game: "Pokémon FireRed and LeafGreen", tier: "gym",
    species: ["Growlithe", "Ponyta", "Rapidash", "Arcanine"], owner: "Blaine",
    signature: { title: "Hot-headed quiz", effect: "boost30" } },
  // Bulbapedia: Viridian_Gym, Let's Go Pikachu/Eevee (snapshot 20260715221410). Let's Go is the one
  // game where his Gym team has 4 (FireRed/LeafGreen, Red/Blue and Yellow have 5).
  { id: "giovanni-letsgo", name: "Giovanni", title: "Viridian City Gym Leader", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "gym",
    species: ["Dugtrio", "Nidoqueen", "Nidoking", "Rhydon"], owner: "Giovanni",
    signature: { title: "The boss's orders", effect: "energy2" } },
  // Bulbapedia: Cerulean_Gym, HeartGold/SoulSilver (snapshot 20260824151940). In FireRed/LeafGreen she has only 2.
  { id: "misty-heartgold", name: "Misty", title: "Cerulean City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Golduck", "Quagsire", "Lapras", "Starmie"], owner: "Misty",
    signature: { title: "All-out offensive", effect: "boost30" } },
  // Bulbapedia: Ecruteak_Gym, HeartGold/SoulSilver (snapshot 20260829073938). Haunter twice.
  { id: "morty-heartgold", name: "Morty", title: "Ecruteak City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Gastly", "Haunter", "Gengar", "Haunter"],
    signature: { title: "Ghostly vision", effect: "energy2" } },
  // Bulbapedia: Mahogany_Gym, HeartGold/SoulSilver (snapshot 20260920021232).
  { id: "pryce-heartgold", name: "Pryce", title: "Mahogany Town Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Seel", "Dewgong", "Piloswine"],
    signature: { title: "Winter's patience", effect: "heal50" } },
  // Bulbapedia: Blackthorn_Gym, HeartGold/SoulSilver (snapshot 20260926091135). Dragonair twice.
  { id: "clair-heartgold", name: "Clair", title: "Blackthorn City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Gyarados", "Dragonair", "Dragonair", "Kingdra"],
    signature: { title: "Dragon pride", effect: "boost30" } },
  // Bulbapedia: Mauville_Gym, Emerald first battle (snapshot 20260907114633).
  { id: "wattson-emerald", name: "Wattson", title: "Mauville City Gym Leader", game: "Pokémon Emerald", tier: "gym",
    species: ["Voltorb", "Electrike", "Magneton", "Manectric"],
    signature: { title: "Wahahaha!", effect: "energy2" } },
  // Bulbapedia: Lavaridge_Gym, Emerald (snapshot 20260904075440).
  { id: "flannery-emerald", name: "Flannery", title: "Lavaridge Town Gym Leader", game: "Pokémon Emerald", tier: "gym",
    species: ["Numel", "Slugma", "Camerupt", "Torkoal"],
    signature: { title: "Fiery passion", effect: "boost30" } },
  // Bulbapedia: Petalburg_Gym, Emerald (snapshot 20261001071708).
  { id: "norman-emerald", name: "Norman", title: "Petalburg City Gym Leader", game: "Pokémon Emerald", tier: "gym",
    species: ["Spinda", "Vigoroth", "Linoone", "Slaking"],
    signature: { title: "A father's lesson", effect: "heal50" } },
  // Bulbapedia: Oreburgh_Gym, Platinum (snapshot 20260909045336).
  { id: "roark-platinum", name: "Roark", title: "Oreburgh City Gym Leader", game: "Pokémon Platinum", tier: "gym",
    species: ["Geodude", "Onix", "Cranidos"],
    signature: { title: "Rock-solid defense", effect: "heal50" } },
  // Bulbapedia: Hearthome_Gym, Platinum (snapshot 20260901064522).
  { id: "fantina-platinum", name: "Fantina", title: "Hearthome City Gym Leader", game: "Pokémon Platinum", tier: "gym",
    species: ["Duskull", "Haunter", "Mismagius"],
    signature: { title: "Haunting dance", effect: "energy2" } },
  // Bulbapedia: Veilstone_Gym, Platinum (snapshot 20260819051635).
  { id: "maylene-platinum", name: "Maylene", title: "Veilstone City Gym Leader", game: "Pokémon Platinum", tier: "gym",
    species: ["Meditite", "Machoke", "Lucario"],
    signature: { title: "Barefoot strength", effect: "boost30" } },
  // Bulbapedia: Pastoria_Gym, Platinum (snapshot 20260625023433).
  { id: "crasher-wake-platinum", name: "Crasher Wake", title: "Pastoria City Gym Leader", game: "Pokémon Platinum", tier: "gym",
    species: ["Gyarados", "Quagsire", "Floatzel"],
    signature: { title: "Crashing wave", effect: "boost30" } },
  // Bulbapedia: Snowpoint_Gym, Platinum (snapshot 20260810070626).
  { id: "candice-platinum", name: "Candice", title: "Snowpoint City Gym Leader", game: "Pokémon Platinum", tier: "gym",
    species: ["Sneasel", "Piloswine", "Abomasnow", "Froslass"],
    signature: { title: "Focus!", effect: "energy2" } },
  // Bulbapedia: Sunyshore_Gym, Platinum (snapshot 20260824014420).
  { id: "volkner-platinum", name: "Volkner", title: "Sunyshore City Gym Leader", game: "Pokémon Platinum", tier: "gym",
    species: ["Jolteon", "Raichu", "Luxray", "Electivire"],
    signature: { title: "Shining spark", effect: "boost30" } },
  // Bulbapedia: Nimbasa_Gym, Black/White (snapshot 20260828070023). Emolga twice.
  { id: "elesa-black", name: "Elesa", title: "Nimbasa City Gym Leader", game: "Pokémon Black and White", tier: "gym",
    species: ["Emolga", "Emolga", "Zebstrika"],
    signature: { title: "Dazzling spotlight", effect: "energy2" } },
  // Bulbapedia: Opelucid_Gym, Pokémon Black (snapshot 20260828084129).
  { id: "drayden-black", name: "Drayden", title: "Opelucid City Gym Leader", game: "Pokémon Black", tier: "gym",
    species: ["Fraxure", "Druddigon", "Haxorus"],
    signature: { title: "Dragon's wisdom", effect: "heal50" } },
  // Bulbapedia: Laverre_Gym, X/Y (snapshot 20260823055503).
  { id: "valerie-x", name: "Valerie", title: "Laverre City Gym Leader", game: "Pokémon X and Y", tier: "gym",
    species: ["Mawile", "Mr. Mime", "Sylveon"],
    signature: { title: "Fairy's grace", effect: "heal50" } },
  // Bulbapedia: Snowbelle_Gym, X/Y (snapshot 20260825183625).
  { id: "wulfric-x", name: "Wulfric", title: "Snowbelle City Gym Leader", game: "Pokémon X and Y", tier: "gym",
    species: ["Abomasnow", "Cryogonal", "Avalugg"],
    signature: { title: "Wall of ice", effect: "heal50" } },
  // Bulbapedia: Motostoke_Stadium, Sword/Shield (snapshot 20260911234553).
  { id: "kabu-sword", name: "Kabu", title: "Motostoke Gym Leader", game: "Pokémon Sword and Shield", tier: "gym",
    species: ["Ninetales", "Arcanine", "Centiskorch"],
    signature: { title: "Burning will", effect: "boost30" } },
  // Bulbapedia: Ballonlea_Stadium, Sword/Shield (snapshot 20260818031639).
  { id: "opal-sword", name: "Opal", title: "Ballonlea Gym Leader", game: "Pokémon Sword and Shield", tier: "gym",
    species: ["Galarian Weezing", "Mawile", "Togekiss", "Alcremie"],
    signature: { title: "Got any pink?", effect: "energy2" } },
  // Bulbapedia: Hammerlocke_Stadium, Sword/Shield (snapshot 20260914114527).
  { id: "raihan-sword", name: "Raihan", title: "Hammerlocke Gym Leader", game: "Pokémon Sword and Shield", tier: "gym",
    species: ["Gigalith", "Flygon", "Sandaconda", "Duraludon"],
    signature: { title: "Sandstorm selfie", effect: "boost30" } },
  // Bulbapedia: Levincia_Gym, Scarlet/Violet (snapshot 20260825023105).
  { id: "iono-scarlet", name: "Iono", title: "Levincia Gym Leader", game: "Pokémon Scarlet and Violet", tier: "gym",
    species: ["Wattrel", "Bellibolt", "Luxio", "Mismagius"], owner: "Iono",
    signature: { title: "Electrifying stream", effect: "boost30" } },
  // Bulbapedia: Medali_Gym, Scarlet/Violet (snapshot 20260906015020).
  { id: "larry-scarlet", name: "Larry", title: "Medali Gym Leader", game: "Pokémon Scarlet and Violet", tier: "gym",
    species: ["Komala", "Dudunsparce", "Staraptor"], owner: "Larry",
    signature: { title: "Just an ordinary guy", effect: "energy2" } },
  // Bulbapedia: Alfornada_Gym, Scarlet/Violet (snapshot 20260907100621).
  { id: "tulip-scarlet", name: "Tulip", title: "Alfornada Gym Leader", game: "Pokémon Scarlet and Violet", tier: "gym",
    species: ["Farigiraf", "Gardevoir", "Espathra", "Florges"],
    signature: { title: "Picture-perfect bloom", effect: "heal50" } },
  // Bulbapedia: Glaseado_Gym, Scarlet/Violet (snapshot 20260607034005).
  { id: "grusha-scarlet", name: "Grusha", title: "Glaseado Gym Leader", game: "Pokémon Scarlet and Violet", tier: "gym",
    species: ["Frosmoth", "Beartic", "Cetitan", "Altaria"],
    signature: { title: "Cold as ice", effect: "heal50" } },

  // Added in the roster round of 2026-10-21 (picks https://claude.ai/artifact/GPbG7XLVeDeTJfkCGd1pTg):
  // each one's first Gym battle in the game named, however many Pokémon it has. Johto, Unova,
  // Kalos and Galar give some leaders 2 (their rematches have 6, too many for a Monday).

  // Bulbapedia: Pewter_Gym, HeartGold/SoulSilver (snapshot 20260826165854). FireRed/LeafGreen and Let's Go give him 2.
  { id: "brock-heartgold", name: "Brock", title: "Pewter City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Graveler", "Rhyhorn", "Omastar", "Onix", "Kabutops"], owner: "Brock",
    signature: { title: "Hard as a rock", effect: "heal50" } },
  // Bulbapedia: Janine, HeartGold/SoulSilver Gym battle (snapshot 20260901054420). Ariados twice.
  { id: "janine-heartgold", name: "Janine", title: "Fuchsia City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Crobat", "Weezing", "Ariados", "Ariados", "Venomoth"],
    signature: { title: "Secret ninja art", effect: "energy2" } },
  // Bulbapedia: Falkner, HeartGold/SoulSilver Gym battle (snapshot 20260828031131).
  { id: "falkner-heartgold", name: "Falkner", title: "Violet City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Pidgey", "Pidgeotto"],
    pin: { 0: "sv3-162", 1: "sv3-163" }, // the hardest-hitting prints: with the gentlest ones the obvious play always won
    signature: { title: "Riding the wind", effect: "boost30" } },
  // Bulbapedia: Whitney, HeartGold/SoulSilver Gym battle (snapshot 20261010121807).
  { id: "whitney-heartgold", name: "Whitney", title: "Goldenrod City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Clefairy", "Miltank"],
    pin: { 1: "sv8pt5-81" }, // Moomoo Rolling for 100: the automatic pick hit for 10 and the obvious play always won
    signature: { title: "Unstoppable rollout", effect: "boost30" } },
  // Bulbapedia: Jasmine, HeartGold/SoulSilver Gym battle (snapshot 20260918130825). Magnemite twice.
  { id: "jasmine-heartgold", name: "Jasmine", title: "Olivine City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Magnemite", "Magnemite", "Steelix"],
    signature: { title: "Steely calm", effect: "heal50" } },
  // Bulbapedia: Roxanne, Emerald Gym battle (snapshot 20260907150322). Geodude twice.
  { id: "roxanne-emerald", name: "Roxanne", title: "Rustboro City Gym Leader", game: "Pokémon Emerald", tier: "gym",
    species: ["Geodude", "Geodude", "Nosepass"],
    pin: { 0: "sm10-87", 1: "pl3-105", 2: "me3-37" }, // harder hitters than the automatic picks, which the obvious play beat
    signature: { title: "Textbook strategy", effect: "energy2" } },
  // Bulbapedia: Brawly, Emerald Gym battle (snapshot 20261013113400).
  { id: "brawly-emerald", name: "Brawly", title: "Dewford Town Gym Leader", game: "Pokémon Emerald", tier: "gym",
    species: ["Machop", "Meditite", "Makuhita"],
    signature: { title: "Riding the big wave", effect: "boost30" } },
  // Bulbapedia: Winona, Omega Ruby/Alpha Sapphire Gym battle (snapshot 20261013013334). Emerald gives her 5.
  { id: "winona-omegaruby", name: "Winona", title: "Fortree City Gym Leader", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "gym",
    species: ["Swellow", "Pelipper", "Skarmory", "Altaria"],
    signature: { title: "Wings of grace", effect: "heal50" } },
  // Bulbapedia: Tate_and_Liza, Emerald Gym battle (snapshot 20261015045022). A Double Battle in the
  // game; here the twins' four come out one at a time as one team.
  { id: "tate-liza-emerald", name: "Tate & Liza", title: "Mossdeep City Gym Leaders", game: "Pokémon Emerald", tier: "gym",
    species: ["Claydol", "Xatu", "Lunatone", "Solrock"],
    signature: { title: "Twin telepathy", effect: "energy2" } },
  // Bulbapedia: Gardenia, Platinum Gym battle (snapshot 20260902153202).
  { id: "gardenia-platinum", name: "Gardenia", title: "Eterna City Gym Leader", game: "Pokémon Platinum", tier: "gym",
    species: ["Turtwig", "Cherrim", "Roserade"],
    signature: { title: "Forest in bloom", effect: "heal50" } },
  // Bulbapedia: Cilan, Black/White Gym battle (snapshot 20260920190102). One of the three Striaton
  // brothers: Cilan is the one you face after choosing Oshawott.
  { id: "cilan-black", name: "Cilan", title: "Striaton City Gym Leader", game: "Pokémon Black and White", tier: "gym",
    species: ["Lillipup", "Pansage"],
    pin: { 0: "sm12-174", 1: "bw4-6" }, // the hardest-hitting prints: with the automatic picks the obvious play always won
    signature: { title: "A connoisseur's call", effect: "energy2" } },
  // Bulbapedia: Clay, Black/White Gym battle (snapshot 20260906200800).
  { id: "clay-black", name: "Clay", title: "Driftveil City Gym Leader", game: "Pokémon Black and White", tier: "gym",
    species: ["Krokorok", "Palpitoad", "Excadrill"],
    signature: { title: "Hit pay dirt", effect: "boost30" } },
  // Bulbapedia: Skyla, Black/White Gym battle (snapshot 20260908201330).
  { id: "skyla-black", name: "Skyla", title: "Mistralton City Gym Leader", game: "Pokémon Black and White", tier: "gym",
    species: ["Swoobat", "Unfezant", "Swanna"],
    signature: { title: "Tailwind takeoff", effect: "energy2" } },
  // Bulbapedia: Roxie, Black 2/White 2 Gym battle, Easy and Normal Mode (snapshot 20260828174314).
  { id: "roxie-black2", name: "Roxie", title: "Virbank City Gym Leader", game: "Pokémon Black 2 and White 2", tier: "gym",
    species: ["Koffing", "Whirlipede"],
    signature: { title: "Turn it up!", effect: "boost30" } },
  // Bulbapedia: Grant, X/Y Gym battle (snapshot 20261011042005).
  { id: "grant-x", name: "Grant", title: "Cyllage City Gym Leader", game: "Pokémon X and Y", tier: "gym",
    species: ["Amaura", "Tyrunt"],
    signature: { title: "Climb to the top", effect: "boost30" } },
  // Bulbapedia: Korrina, X/Y Gym battle at Shalour Gym (snapshot 20261013113358).
  { id: "korrina-x", name: "Korrina", title: "Shalour City Gym Leader", game: "Pokémon X and Y", tier: "gym",
    species: ["Mienfoo", "Machoke", "Hawlucha"],
    signature: { title: "Mega bond", effect: "energy2" } },
  // Bulbapedia: Clemont, X/Y Gym battle (snapshot 20260912071829).
  { id: "clemont-x", name: "Clemont", title: "Lumiose City Gym Leader", game: "Pokémon X and Y", tier: "gym",
    species: ["Emolga", "Magneton", "Heliolisk"],
    signature: { title: "Science is amazing!", effect: "energy2" } },
  // Bulbapedia: Olympia, X/Y Gym battle (snapshot 20260903230257).
  { id: "olympia-x", name: "Olympia", title: "Anistar City Gym Leader", game: "Pokémon X and Y", tier: "gym",
    species: ["Sigilyph", "Slowking", "Meowstic"],
    signature: { title: "Written in the stars", effect: "heal50" } },
  // Bulbapedia: Milo, Sword/Shield Gym battle (snapshot 20260819102238).
  { id: "milo-sword", name: "Milo", title: "Turffield Gym Leader", game: "Pokémon Sword and Shield", tier: "gym",
    species: ["Gossifleur", "Eldegoss"],
    signature: { title: "Farm-fresh strength", effect: "heal50" } },
  // Bulbapedia: Nessa, Sword/Shield Gym battle (snapshot 20260815131235).
  { id: "nessa-sword", name: "Nessa", title: "Hulbury Gym Leader", game: "Pokémon Sword and Shield", tier: "gym",
    species: ["Goldeen", "Arrokuda", "Drednaw"],
    signature: { title: "Surging tide", effect: "boost30" } },
  // Bulbapedia: Bea, Pokémon Sword Gym battle (snapshot 20261003115415).
  { id: "bea-sword", name: "Bea", title: "Stow-on-Side Gym Leader", game: "Pokémon Sword", tier: "gym",
    species: ["Hitmontop", "Pangoro", "Galarian Sirfetch'd", "Machamp"],
    signature: { title: "Unbreakable training", effect: "boost30" } },
  // Bulbapedia: Allister, Pokémon Shield Gym battle (snapshot 20261005174623).
  { id: "allister-shield", name: "Allister", title: "Stow-on-Side Gym Leader", game: "Pokémon Shield", tier: "gym",
    species: ["Galarian Yamask", "Mimikyu", "Galarian Cursola", "Gengar"],
    signature: { title: "Behind the mask", effect: "energy2" } },
  // Bulbapedia: Gordie, Pokémon Sword Gym battle (snapshot 20261013043725).
  { id: "gordie-sword", name: "Gordie", title: "Circhester Gym Leader", game: "Pokémon Sword", tier: "gym",
    species: ["Barbaracle", "Shuckle", "Stonjourner", "Coalossal"],
    signature: { title: "Coal-fired swagger", effect: "boost30" } },
  // Bulbapedia: Melony, Pokémon Shield Gym battle (snapshot 20261013222834).
  { id: "melony-shield", name: "Melony", title: "Circhester Gym Leader", game: "Pokémon Shield", tier: "gym",
    species: ["Frosmoth", "Galarian Darmanitan", "Eiscue", "Lapras"],
    signature: { title: "Warm-hearted chill", effect: "heal50" } },
  // Bulbapedia: Piers, Sword/Shield Gym battle (snapshot 20260826174647).
  { id: "piers-sword", name: "Piers", title: "Spikemuth Gym Leader", game: "Pokémon Sword and Shield", tier: "gym",
    species: ["Scrafty", "Malamar", "Skuntank", "Galarian Obstagoon"],
    signature: { title: "Punk encore", effect: "energy2" } },
  // Bulbapedia: Katy, Scarlet/Violet Gym battle (snapshot 20260907231059).
  { id: "katy-scarlet", name: "Katy", title: "Cortondo Gym Leader", game: "Pokémon Scarlet and Violet", tier: "gym",
    species: ["Nymble", "Tarountula", "Teddiursa"],
    pin: { 0: "sv2-20", 1: "sv2-17", 2: "dp2-105" }, // the hardest-hitting prints: with the automatic picks the obvious play always won
    signature: { title: "Fresh-baked treat", effect: "heal50" } },
  // Bulbapedia: Brassius, Scarlet/Violet Gym battle (snapshot 20260903214451).
  { id: "brassius-scarlet", name: "Brassius", title: "Artazon Gym Leader", game: "Pokémon Scarlet and Violet", tier: "gym",
    species: ["Petilil", "Smoliv", "Sudowoodo"],
    signature: { title: "Bloom of genius", effect: "boost30" } },
  // Bulbapedia: Kofu, Scarlet/Violet Gym battle (snapshot 20260909070422).
  { id: "kofu-scarlet", name: "Kofu", title: "Cascarrafa Gym Leader", game: "Pokémon Scarlet and Violet", tier: "gym",
    species: ["Veluza", "Wugtrio", "Crabominable"],
    signature: { title: "Fresh catch", effect: "heal50" } },
  // Bulbapedia: Hala, Sun/Moon grand trial (snapshot 20261002171643). The Alola kahunas stand in for Gym Leaders.
  { id: "hala-sun", name: "Hala", title: "Kahuna of Melemele Island", game: "Pokémon Sun and Moon", tier: "gym",
    species: ["Mankey", "Makuhita", "Crabrawler"],
    signature: { title: "Kahuna's blessing", effect: "heal50" } },
  // Bulbapedia: Olivia, Sun/Moon grand trial (snapshot 20260906091737).
  { id: "olivia-sun", name: "Olivia", title: "Kahuna of Akala Island", game: "Pokémon Sun and Moon", tier: "gym",
    species: ["Nosepass", "Boldore", "Lycanroc"],
    signature: { title: "Dazzling gems", effect: "energy2" } },
  // Bulbapedia: Nanu, Sun/Moon grand trial (snapshot 20260824150228).
  { id: "nanu-sun", name: "Nanu", title: "Kahuna of Ula'ula Island", game: "Pokémon Sun and Moon", tier: "gym",
    species: ["Sableye", "Krokorok", "Alolan Persian"],
    signature: { title: "Undercover tricks", effect: "energy2" } },
  // Bulbapedia: Hapu, Sun/Moon grand trial (snapshot 20260911051803).
  { id: "hapu-sun", name: "Hapu", title: "Kahuna of Poni Island", game: "Pokémon Sun and Moon", tier: "gym",
    species: ["Alolan Dugtrio", "Gastrodon", "Flygon", "Mudsdale"],
    signature: { title: "Earth-shaking stomp", effect: "boost30" } },

  // The gym leaders below have no Supporter card of their own that we found (picked after the ones above).

  // Bulbapedia: Bugsy, HeartGold/SoulSilver Gym battle (snapshot 20260915025028).
  { id: "bugsy-heartgold", name: "Bugsy", title: "Azalea Town Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Scyther", "Metapod", "Kakuna"],
    signature: { title: "Bug expert's study", effect: "energy2" } },
  // Bulbapedia: Chuck, HeartGold/SoulSilver Gym battle (snapshot 20260909040226).
  { id: "chuck-heartgold", name: "Chuck", title: "Cianwood City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Primeape", "Poliwrath"],
    signature: { title: "Waterfall training", effect: "boost30" } },
  // Bulbapedia: Juan, Emerald Gym battle (snapshot 20260911190628).
  { id: "juan-emerald", name: "Juan", title: "Sootopolis City Gym Leader", game: "Pokémon Emerald", tier: "gym",
    species: ["Luvdisc", "Whiscash", "Sealeo", "Crawdaunt", "Kingdra"],
    signature: { title: "Artistic flourish", effect: "heal50" } },
  // Bulbapedia: Byron, Platinum Gym battle (snapshot 20260927191429).
  { id: "byron-platinum", name: "Byron", title: "Canalave City Gym Leader", game: "Pokémon Platinum", tier: "gym",
    species: ["Magneton", "Steelix", "Bastiodon"],
    signature: { title: "Mining muscle", effect: "boost30" } },
  // Bulbapedia: Lenora, Black/White Gym battle (snapshot 20260908202923).
  { id: "lenora-black", name: "Lenora", title: "Nacrene City Gym Leader", game: "Pokémon Black and White", tier: "gym",
    species: ["Herdier", "Watchog"],
    signature: { title: "Museum research", effect: "energy2" } },
  // Bulbapedia: Burgh, Black/White Gym battle (snapshot 20261017063021).
  { id: "burgh-black", name: "Burgh", title: "Castelia City Gym Leader", game: "Pokémon Black and White", tier: "gym",
    species: ["Whirlipede", "Dwebble", "Leavanny"],
    signature: { title: "Struck by inspiration", effect: "boost30" } },
  // Bulbapedia: Icirrus_Gym, Black/White (snapshot 20260828214253).
  { id: "brycen-black", name: "Brycen", title: "Icirrus City Gym Leader", game: "Pokémon Black and White", tier: "gym",
    species: ["Vanillish", "Cryogonal", "Beartic"],
    signature: { title: "Frosty stare", effect: "heal50" } },
  // Bulbapedia: Marlon, Black 2/White 2 Gym battle, Easy and Normal Mode (snapshot 20261008214255).
  { id: "marlon-black2", name: "Marlon", title: "Humilau City Gym Leader", game: "Pokémon Black 2 and White 2", tier: "gym",
    species: ["Carracosta", "Wailord", "Jellicent"],
    signature: { title: "Ocean tide", effect: "heal50" } },
  // Bulbapedia: Viola, X/Y Gym battle (snapshot 20260824165535).
  { id: "viola-x", name: "Viola", title: "Santalune City Gym Leader", game: "Pokémon X and Y", tier: "gym",
    species: ["Surskit", "Vivillon"],
    signature: { title: "Snapshot moment", effect: "energy2" } },
  // Bulbapedia: Ramos, X/Y Gym battle (snapshot 20261008195355).
  { id: "ramos-x", name: "Ramos", title: "Coumarine City Gym Leader", game: "Pokémon X and Y", tier: "gym",
    species: ["Jumpluff", "Weepinbell", "Gogoat"],
    signature: { title: "Garden wisdom", effect: "heal50" } },
  // Bulbapedia: Ryme, Scarlet/Violet Gym battle (snapshot 20260913143419).
  { id: "ryme-scarlet", name: "Ryme", title: "Montenevera Gym Leader", game: "Pokémon Scarlet and Violet", tier: "gym",
    species: ["Banette", "Mimikyu", "Houndstone", "Toxtricity"],
    signature: { title: "Drop the beat", effect: "boost30" } },

  // Second teams (roster round pass 2, 2026-10-21): each person's team from another game, or a rematch
  // marked in its game name, added after their earlier teams so they come back with it next time. Gym
  // rematches only where they have 2 to 5 (Emerald's first rematch, Platinum's, Galar's Champion
  // tournaments, Paldea's Gym rematches); 6-Pokémon rematches are left out. Wallace, Iris and Cheren
  // battle here as Gym Leaders in the games named, so they're also gym people.

  // Bulbapedia: Wallace, Omega Ruby/Alpha Sapphire Gym battle; the same person as the Champion of Hoenn, in another tier (snapshot 20260912183710).
  { id: "wallace-omegaruby", person: "wallace", name: "Wallace", title: "Sootopolis City Gym Leader", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "gym",
    species: ["Luvdisc", "Whiscash", "Sealeo", "Seaking", "Milotic"],
    signature: { title: "Graceful splash", effect: "heal50" } },
  // Bulbapedia: Iris, Pokémon White Gym battle; the same person as the Champion of Unova, in another tier (snapshot 20260930114308).
  { id: "iris-white", person: "iris", name: "Iris", title: "Opelucid City Gym Leader", game: "Pokémon White", tier: "gym",
    species: ["Fraxure", "Druddigon", "Haxorus"],
    signature: { title: "Dragon girl's dash", effect: "energy2" } },
  // Left out (2026-10-21): Cheren's Black 2/White 2 Gym team (Patrat, Lillipup) can't make a puzzle; even the
  // hardest-hitting prints (60 HP each) lose to the obvious play with every pack. He stays a rival.
  // Bulbapedia: Lt._Surge, HeartGold/SoulSilver Gym battle; Electrode twice (snapshot 20261013013338).
  { id: "lt-surge-heartgold", person: "lt-surge", name: "Lt. Surge", title: "Vermilion City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Raichu", "Electrode", "Electrode", "Magneton", "Electabuzz"], owner: "Lt. Surge",
    signature: { title: "Electric veteran", effect: "boost30" } },
  // Bulbapedia: Lt._Surge, Let's Go Gym battle (snapshot 20261013013338).
  { id: "lt-surge-letsgo", person: "lt-surge", name: "Lt. Surge", title: "Vermilion City Gym Leader", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "gym",
    species: ["Voltorb", "Magnemite", "Raichu"], owner: "Lt. Surge",
    signature: { title: "Lightning trap", effect: "energy2" } },
  // Bulbapedia: Erika, HeartGold/SoulSilver Gym battle (snapshot 20260911174808).
  { id: "erika-heartgold", person: "erika", name: "Erika", title: "Celadon City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Jumpluff", "Tangela", "Victreebel", "Bellossom"], owner: "Erika",
    signature: { title: "Flower arrangement", effect: "heal50" } },
  // Bulbapedia: Erika, Let's Go Gym battle (snapshot 20260911174808).
  { id: "erika-letsgo", person: "erika", name: "Erika", title: "Celadon City Gym Leader", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "gym",
    species: ["Tangela", "Weepinbell", "Vileplume"], owner: "Erika",
    signature: { title: "Garden nap", effect: "heal50" } },
  // Bulbapedia: Koga, Let's Go Gym battle (snapshot 20260901074728).
  { id: "koga-letsgo", person: "koga", name: "Koga", title: "Fuchsia City Gym Leader", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "gym",
    species: ["Weezing", "Muk", "Golbat", "Venomoth"], owner: "Koga",
    signature: { title: "Smoke screen", effect: "energy2" } },
  // Bulbapedia: Koga, Yellow Gym battle; Venonat three times (snapshot 20260901074728).
  { id: "koga-yellow", person: "koga", name: "Koga", title: "Fuchsia City Gym Leader", game: "Pokémon Yellow", tier: "gym",
    species: ["Venonat", "Venonat", "Venonat", "Venomoth"], owner: "Koga",
    signature: { title: "Swarm of moths", effect: "energy2" } },
  // Bulbapedia: Sabrina, HeartGold/SoulSilver Gym battle (snapshot 20261003143001).
  { id: "sabrina-heartgold", person: "sabrina", name: "Sabrina", title: "Saffron City Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Espeon", "Mr. Mime", "Alakazam"], owner: "Sabrina",
    signature: { title: "Mind over matter", effect: "energy2" } },
  // Bulbapedia: Sabrina, Let's Go Gym battle (snapshot 20261003143001).
  { id: "sabrina-letsgo", person: "sabrina", name: "Sabrina", title: "Saffron City Gym Leader", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "gym",
    species: ["Mr. Mime", "Slowbro", "Jynx", "Alakazam"], owner: "Sabrina",
    signature: { title: "Psychic premonition", effect: "boost30" } },
  // Bulbapedia: Sabrina, Yellow Gym battle (snapshot 20261003143001).
  { id: "sabrina-yellow", person: "sabrina", name: "Sabrina", title: "Saffron City Gym Leader", game: "Pokémon Yellow", tier: "gym",
    species: ["Abra", "Kadabra", "Alakazam"], owner: "Sabrina",
    signature: { title: "Telekinetic trio", effect: "energy2" } },
  // Bulbapedia: Blaine, HeartGold/SoulSilver Gym battle (snapshot 20260901074852).
  { id: "blaine-heartgold", person: "blaine", name: "Blaine", title: "Cinnabar Island Gym Leader", game: "Pokémon HeartGold and SoulSilver", tier: "gym",
    species: ["Magcargo", "Magmar", "Rapidash"], owner: "Blaine",
    signature: { title: "Volcano rebuilt", effect: "boost30" } },
  // Bulbapedia: Blaine, Let's Go Gym battle (snapshot 20260901074852).
  { id: "blaine-letsgo", person: "blaine", name: "Blaine", title: "Cinnabar Island Gym Leader", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "gym",
    species: ["Magmar", "Rapidash", "Ninetales", "Arcanine"], owner: "Blaine",
    signature: { title: "Burning riddle", effect: "boost30" } },
  // Bulbapedia: Misty, FireRed/LeafGreen Gym battle (snapshot 20260911163112).
  { id: "misty-firered", person: "misty", name: "Misty", title: "Cerulean City Gym Leader", game: "Pokémon FireRed and LeafGreen", tier: "gym",
    species: ["Staryu", "Starmie"], owner: "Misty",
    signature: { title: "Cerulean splash", effect: "boost30" } },
  // Bulbapedia: Misty, Let's Go Gym battle (snapshot 20260911163112).
  { id: "misty-letsgo", person: "misty", name: "Misty", title: "Cerulean City Gym Leader", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "gym",
    species: ["Psyduck", "Starmie"], owner: "Misty",
    signature: { title: "Water starter", effect: "heal50" } },
  // Bulbapedia: Brock, FireRed/LeafGreen Gym battle; Let's Go has the same team (snapshot 20260916083453).
  { id: "brock-firered", person: "brock", name: "Brock", title: "Pewter City Gym Leader", game: "Pokémon FireRed and LeafGreen", tier: "gym",
    species: ["Geodude", "Onix"], owner: "Brock",
    pin: { 0: "sm10-87", 1: "sv3pt5-95" }, // harder hitters than his own Gym Heroes cards, which the obvious play always beat
    signature: { title: "Boulder wall", effect: "heal50" } },
  // Bulbapedia: Giovanni, FireRed/LeafGreen Gym battle; Rhyhorn twice (snapshot 20260912184836).
  { id: "giovanni-firered", person: "giovanni", name: "Giovanni", title: "Viridian City Gym Leader", game: "Pokémon FireRed and LeafGreen", tier: "gym",
    species: ["Rhyhorn", "Dugtrio", "Nidoqueen", "Nidoking", "Rhyhorn"], owner: "Giovanni",
    signature: { title: "Earthquake master", effect: "boost30" } },
  // Bulbapedia: Roxanne, Omega Ruby/Alpha Sapphire Gym battle (snapshot 20260907150322).
  { id: "roxanne-omegaruby", person: "roxanne", name: "Roxanne", title: "Rustboro City Gym Leader", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "gym",
    species: ["Geodude", "Nosepass"],
    signature: { title: "Study hall", effect: "energy2" } },
  // Bulbapedia: Roxanne, Emerald first rematch (snapshot 20260907150322).
  { id: "roxanne-emerald-rematch", person: "roxanne", name: "Roxanne", title: "Rustboro City Gym Leader", game: "Pokémon Emerald (rematch)", tier: "gym",
    species: ["Golem", "Kabuto", "Onix", "Nosepass"],
    signature: { title: "Fossil lesson", effect: "heal50" } },
  // Bulbapedia: Brawly, Omega Ruby/Alpha Sapphire Gym battle (snapshot 20261013113400).
  { id: "brawly-omegaruby", person: "brawly", name: "Brawly", title: "Dewford Town Gym Leader", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "gym",
    species: ["Machop", "Makuhita"],
    signature: { title: "Big wave", effect: "boost30" } },
  // Bulbapedia: Brawly, Emerald first rematch (snapshot 20261013113400).
  { id: "brawly-emerald-rematch", person: "brawly", name: "Brawly", title: "Dewford Town Gym Leader", game: "Pokémon Emerald (rematch)", tier: "gym",
    species: ["Machamp", "Meditite", "Hitmontop", "Hariyama"],
    signature: { title: "Surf and spar", effect: "boost30" } },
  // Bulbapedia: Wattson, Omega Ruby/Alpha Sapphire Gym battle (snapshot 20261013014652).
  { id: "wattson-omegaruby", person: "wattson", name: "Wattson", title: "Mauville City Gym Leader", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "gym",
    species: ["Magnemite", "Voltorb", "Magneton"],
    signature: { title: "Spark of joy", effect: "energy2" } },
  // Bulbapedia: Wattson, Emerald first rematch (snapshot 20261013014652).
  { id: "wattson-emerald-rematch", person: "wattson", name: "Wattson", title: "Mauville City Gym Leader", game: "Pokémon Emerald (rematch)", tier: "gym",
    species: ["Mareep", "Electrode", "Magneton", "Manectric"],
    signature: { title: "Power plant laugh", effect: "energy2" } },
  // Bulbapedia: Flannery, Omega Ruby/Alpha Sapphire Gym battle (snapshot 20260828064010).
  { id: "flannery-omegaruby", person: "flannery", name: "Flannery", title: "Lavaridge Town Gym Leader", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "gym",
    species: ["Slugma", "Numel", "Torkoal"],
    signature: { title: "Hot temper", effect: "boost30" } },
  // Bulbapedia: Flannery, Emerald first rematch (snapshot 20260828064010).
  { id: "flannery-emerald-rematch", person: "flannery", name: "Flannery", title: "Lavaridge Town Gym Leader", game: "Pokémon Emerald (rematch)", tier: "gym",
    species: ["Magcargo", "Ponyta", "Camerupt", "Torkoal"],
    signature: { title: "Grandpa's flames", effect: "boost30" } },
  // Bulbapedia: Norman, Omega Ruby/Alpha Sapphire Gym battle; Slaking twice (snapshot 20260912190103).
  { id: "norman-omegaruby", person: "norman", name: "Norman", title: "Petalburg City Gym Leader", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "gym",
    species: ["Slaking", "Vigoroth", "Slaking"],
    signature: { title: "Slacking off", effect: "heal50" } },
  // Bulbapedia: Norman, Emerald first rematch; Slaking twice (snapshot 20260912190103).
  { id: "norman-emerald-rematch", person: "norman", name: "Norman", title: "Petalburg City Gym Leader", game: "Pokémon Emerald (rematch)", tier: "gym",
    species: ["Chansey", "Slaking", "Spinda", "Slaking"],
    signature: { title: "Father's strength", effect: "heal50" } },
  // Bulbapedia: Winona, Emerald Gym battle (snapshot 20261013013334).
  { id: "winona-emerald", person: "winona", name: "Winona", title: "Fortree City Gym Leader", game: "Pokémon Emerald", tier: "gym",
    species: ["Swablu", "Tropius", "Pelipper", "Skarmory", "Altaria"],
    signature: { title: "Sky dance", effect: "heal50" } },
  // Bulbapedia: Tate_and_Liza, Omega Ruby/Alpha Sapphire Gym battle (snapshot 20261015045022).
  { id: "tate-liza-omegaruby", person: "tate-liza", name: "Tate & Liza", title: "Mossdeep City Gym Leaders", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "gym",
    species: ["Lunatone", "Solrock"],
    signature: { title: "Twin moons", effect: "energy2" } },
  // Bulbapedia: Tate_and_Liza, Emerald first rematch (snapshot 20261015045022).
  { id: "tate-liza-emerald-rematch", person: "tate-liza", name: "Tate & Liza", title: "Mossdeep City Gym Leaders", game: "Pokémon Emerald (rematch)", tier: "gym",
    species: ["Slowpoke", "Claydol", "Xatu", "Lunatone", "Solrock"],
    signature: { title: "Space center minds", effect: "energy2" } },
  // Bulbapedia: Juan, Emerald first rematch (snapshot 20260911190628).
  { id: "juan-emerald-rematch", person: "juan", name: "Juan", title: "Sootopolis City Gym Leader", game: "Pokémon Emerald (rematch)", tier: "gym",
    species: ["Poliwag", "Whiscash", "Walrein", "Crawdaunt", "Kingdra"],
    signature: { title: "Water art", effect: "heal50" } },
  // Bulbapedia: Roark, Platinum rematch at the Battleground (snapshot 20260904183649).
  { id: "roark-platinum-rematch", person: "roark", name: "Roark", title: "Oreburgh City Gym Leader", game: "Pokémon Platinum (rematch)", tier: "gym",
    species: ["Aerodactyl", "Probopass", "Golem", "Rampardos", "Tyranitar"],
    signature: { title: "Fossil fury", effect: "heal50" } },
  // Bulbapedia: Gardenia, Brilliant Diamond/Shining Pearl Gym battle (snapshot 20260902153202).
  { id: "gardenia-bdsp", person: "gardenia", name: "Gardenia", title: "Eterna City Gym Leader", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "gym",
    species: ["Cherubi", "Turtwig", "Roserade"],
    signature: { title: "Grass is greener", effect: "heal50" } },
  // Bulbapedia: Gardenia, Platinum rematch at the Battleground (snapshot 20260902153202).
  { id: "gardenia-platinum-rematch", person: "gardenia", name: "Gardenia", title: "Eterna City Gym Leader", game: "Pokémon Platinum (rematch)", tier: "gym",
    species: ["Jumpluff", "Cherrim", "Bellossom", "Torterra", "Roserade"],
    signature: { title: "Full bloom", effect: "heal50" } },
  // Bulbapedia: Maylene, Platinum rematch at the Battleground (snapshot 20261015105513).
  { id: "maylene-platinum-rematch", person: "maylene", name: "Maylene", title: "Veilstone City Gym Leader", game: "Pokémon Platinum (rematch)", tier: "gym",
    species: ["Hitmontop", "Medicham", "Breloom", "Machamp", "Lucario"],
    signature: { title: "Barefoot comeback", effect: "boost30" } },
  // Bulbapedia: Crasher_Wake, Platinum rematch at the Battleground (snapshot 20260901054554).
  { id: "crasher-wake-platinum-rematch", person: "crasher-wake", name: "Crasher Wake", title: "Pastoria City Gym Leader", game: "Pokémon Platinum (rematch)", tier: "gym",
    species: ["Sharpedo", "Quagsire", "Floatzel", "Gyarados", "Ludicolo"],
    signature: { title: "Masked wave", effect: "boost30" } },
  // Bulbapedia: Fantina, Brilliant Diamond/Shining Pearl Gym battle (snapshot 20260825001909).
  { id: "fantina-bdsp", person: "fantina", name: "Fantina", title: "Hearthome City Gym Leader", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "gym",
    species: ["Drifblim", "Gengar", "Mismagius"],
    signature: { title: "Contest spotlight", effect: "energy2" } },
  // Bulbapedia: Fantina, Platinum rematch at the Battleground (snapshot 20260825001909).
  { id: "fantina-platinum-rematch", person: "fantina", name: "Fantina", title: "Hearthome City Gym Leader", game: "Pokémon Platinum (rematch)", tier: "gym",
    species: ["Banette", "Mismagius", "Drifblim", "Dusknoir", "Gengar"],
    signature: { title: "Spooky waltz", effect: "energy2" } },
  // Bulbapedia: Byron, Brilliant Diamond/Shining Pearl Gym battle (snapshot 20260927191429).
  { id: "byron-bdsp", person: "byron", name: "Byron", title: "Canalave City Gym Leader", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "gym",
    species: ["Bronzor", "Steelix", "Bastiodon"],
    signature: { title: "Steel father", effect: "boost30" } },
  // Bulbapedia: Byron, Platinum rematch at the Battleground (snapshot 20260927191429).
  { id: "byron-platinum-rematch", person: "byron", name: "Byron", title: "Canalave City Gym Leader", game: "Pokémon Platinum (rematch)", tier: "gym",
    species: ["Skarmory", "Magnezone", "Steelix", "Bastiodon", "Aggron"],
    signature: { title: "Iron ore", effect: "heal50" } },
  // Bulbapedia: Candice, Brilliant Diamond/Shining Pearl Gym battle (snapshot 20260921151803).
  { id: "candice-bdsp", person: "candice", name: "Candice", title: "Snowpoint City Gym Leader", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "gym",
    species: ["Snover", "Sneasel", "Medicham", "Abomasnow"],
    signature: { title: "Snowpoint focus", effect: "energy2" } },
  // Bulbapedia: Candice, Platinum rematch at the Battleground (snapshot 20260921151803).
  { id: "candice-platinum-rematch", person: "candice", name: "Candice", title: "Snowpoint City Gym Leader", game: "Pokémon Platinum (rematch)", tier: "gym",
    species: ["Weavile", "Mamoswine", "Abomasnow", "Froslass", "Glaceon"],
    signature: { title: "Diamond dust", effect: "heal50" } },
  // Bulbapedia: Volkner, Brilliant Diamond/Shining Pearl Gym battle (snapshot 20261013034557).
  { id: "volkner-bdsp", person: "volkner", name: "Volkner", title: "Sunyshore City Gym Leader", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "gym",
    species: ["Raichu", "Ambipom", "Octillery", "Luxray"],
    signature: { title: "Bright lighthouse", effect: "boost30" } },
  // Bulbapedia: Volkner, Platinum rematch at the Battleground (snapshot 20261013034557).
  { id: "volkner-platinum-rematch", person: "volkner", name: "Volkner", title: "Sunyshore City Gym Leader", game: "Pokémon Platinum (rematch)", tier: "gym",
    species: ["Jolteon", "Raichu", "Luxray", "Lanturn", "Electivire"],
    signature: { title: "Thunder at last", effect: "boost30" } },
  // Bulbapedia: Burgh, Black 2/White 2 Gym battle, Easy and Normal Mode (snapshot 20261017063021).
  { id: "burgh-black2", person: "burgh", name: "Burgh", title: "Castelia City Gym Leader", game: "Pokémon Black 2 and White 2", tier: "gym",
    species: ["Swadloon", "Dwebble", "Leavanny"],
    signature: { title: "Artist's cocoon", effect: "heal50" } },
  // Bulbapedia: Elesa, Black 2/White 2 Gym battle, Easy and Normal Mode (snapshot 20260828045343).
  { id: "elesa-black2", person: "elesa", name: "Elesa", title: "Nimbasa City Gym Leader", game: "Pokémon Black 2 and White 2", tier: "gym",
    species: ["Emolga", "Flaaffy", "Zebstrika"],
    signature: { title: "Runway lights", effect: "energy2" } },
  // Bulbapedia: Clay, Black 2/White 2 Gym battle, Easy and Normal Mode (snapshot 20260906200800).
  { id: "clay-black2", person: "clay", name: "Clay", title: "Driftveil City Gym Leader", game: "Pokémon Black 2 and White 2", tier: "gym",
    species: ["Krokorok", "Sandslash", "Excadrill"],
    signature: { title: "Ground pounding", effect: "boost30" } },
  // Bulbapedia: Skyla, Black 2/White 2 Gym battle, Easy and Normal Mode (snapshot 20260908201330).
  { id: "skyla-black2", person: "skyla", name: "Skyla", title: "Mistralton City Gym Leader", game: "Pokémon Black 2 and White 2", tier: "gym",
    species: ["Swoobat", "Skarmory", "Swanna"],
    signature: { title: "Cargo flight", effect: "energy2" } },
  // Bulbapedia: Drayden, Black 2/White 2 Gym battle, Easy and Normal Mode (snapshot 20261009042241).
  { id: "drayden-black2", person: "drayden", name: "Drayden", title: "Opelucid City Gym Leader", game: "Pokémon Black 2 and White 2", tier: "gym",
    species: ["Druddigon", "Flygon", "Haxorus"],
    signature: { title: "Mayor's dragons", effect: "heal50" } },
  // Bulbapedia: Milo, Sword Champion tournament, before the Galarian Star Tournament (snapshot 20260819102238).
  { id: "milo-sword-rematch", person: "milo", name: "Milo", title: "Turffield Gym Leader", game: "Pokémon Sword (rematch)", tier: "gym",
    species: ["Shiftry", "Eldegoss", "Bellossom", "Cherrim", "Flapple"],
    signature: { title: "Harvest time", effect: "heal50" } },
  // Bulbapedia: Nessa, Sword/Shield Champion tournament (snapshot 20260815131235).
  { id: "nessa-sword-rematch", person: "nessa", name: "Nessa", title: "Hulbury Gym Leader", game: "Pokémon Sword and Shield (rematch)", tier: "gym",
    species: ["Golisopod", "Pelipper", "Quagsire", "Toxapex", "Drednaw"],
    signature: { title: "Riptide", effect: "boost30" } },
  // Bulbapedia: Kabu, Sword/Shield Champion tournament (snapshot 20260828050031).
  { id: "kabu-sword-rematch", person: "kabu", name: "Kabu", title: "Motostoke Gym Leader", game: "Pokémon Sword and Shield (rematch)", tier: "gym",
    species: ["Torkoal", "Ninetales", "Arcanine", "Salazzle", "Centiskorch"],
    signature: { title: "Fire within", effect: "boost30" } },
  // Bulbapedia: Bea, Sword Champion tournament (snapshot 20261003115415).
  { id: "bea-sword-rematch", person: "bea", name: "Bea", title: "Stow-on-Side Gym Leader", game: "Pokémon Sword (rematch)", tier: "gym",
    species: ["Hawlucha", "Grapploct", "Galarian Sirfetch'd", "Falinks", "Machamp"],
    signature: { title: "Karate chop", effect: "boost30" } },
  // Bulbapedia: Allister, Shield Champion tournaments (snapshot 20261005174623).
  { id: "allister-shield-rematch", person: "allister", name: "Allister", title: "Stow-on-Side Gym Leader", game: "Pokémon Shield (rematch)", tier: "gym",
    species: ["Dusknoir", "Chandelure", "Galarian Cursola", "Galarian Runerigus", "Gengar"],
    signature: { title: "Masked ghosts", effect: "energy2" } },
  // Bulbapedia: Gordie, Sword Champion tournaments (snapshot 20261013043725).
  { id: "gordie-sword-rematch", person: "gordie", name: "Gordie", title: "Circhester Gym Leader", game: "Pokémon Sword (rematch)", tier: "gym",
    species: ["Barbaracle", "Shuckle", "Stonjourner", "Tyranitar", "Coalossal"],
    signature: { title: "Rock star", effect: "boost30" } },
  // Bulbapedia: Melony, Shield Champion tournaments (snapshot 20261013222834).
  { id: "melony-shield-rematch", person: "melony", name: "Melony", title: "Circhester Gym Leader", game: "Pokémon Shield (rematch)", tier: "gym",
    species: ["Frosmoth", "Galarian Mr. Rime", "Eiscue", "Galarian Darmanitan", "Lapras"],
    signature: { title: "Frost bite", effect: "heal50" } },
  // Bulbapedia: Raihan, Sword/Shield Champion tournaments (snapshot 20260927025648).
  { id: "raihan-sword-rematch", person: "raihan", name: "Raihan", title: "Hammerlocke Gym Leader", game: "Pokémon Sword and Shield (rematch)", tier: "gym",
    species: ["Torkoal", "Goodra", "Turtonator", "Flygon", "Duraludon"],
    signature: { title: "Storm of dragons", effect: "boost30" } },
  // Bulbapedia: Katy, Scarlet/Violet Gym rematch (snapshot 20260907231059).
  { id: "katy-scarlet-rematch", person: "katy", name: "Katy", title: "Cortondo Gym Leader", game: "Pokémon Scarlet and Violet (rematch)", tier: "gym",
    species: ["Lokix", "Forretress", "Spidops", "Heracross", "Ursaring"],
    signature: { title: "Sweet sting", effect: "heal50" } },
  // Bulbapedia: Brassius, Scarlet/Violet Gym rematch (snapshot 20260903214451).
  { id: "brassius-scarlet-rematch", person: "brassius", name: "Brassius", title: "Artazon Gym Leader", game: "Pokémon Scarlet and Violet (rematch)", tier: "gym",
    species: ["Lilligant", "Breloom", "Tsareena", "Arboliva", "Sudowoodo"],
    signature: { title: "Living sculpture", effect: "boost30" } },
  // Bulbapedia: Iono, Scarlet/Violet Gym rematch (snapshot 20260913092501).
  { id: "iono-scarlet-rematch", person: "iono", name: "Iono", title: "Levincia Gym Leader", game: "Pokémon Scarlet and Violet (rematch)", tier: "gym",
    species: ["Kilowattrel", "Bellibolt", "Electrode", "Luxray", "Mismagius"], owner: "Iono",
    signature: { title: "Rematch stream", effect: "boost30" } },
  // Bulbapedia: Kofu, Scarlet/Violet Gym rematch (snapshot 20260909070422).
  { id: "kofu-scarlet-rematch", person: "kofu", name: "Kofu", title: "Cascarrafa Gym Leader", game: "Pokémon Scarlet and Violet (rematch)", tier: "gym",
    species: ["Veluza", "Pelipper", "Wugtrio", "Clawitzer", "Crabominable"],
    signature: { title: "Market fresh", effect: "heal50" } },
  // Bulbapedia: Larry, Scarlet/Violet Gym rematch (snapshot 20261015100336).
  { id: "larry-scarlet-rematch", person: "larry", name: "Larry", title: "Medali Gym Leader", game: "Pokémon Scarlet and Violet (rematch)", tier: "gym",
    species: ["Oinkologne", "Komala", "Braviary", "Dudunsparce", "Staraptor"], owner: "Larry",
    signature: { title: "Clocked in", effect: "energy2" } },
  // Bulbapedia: Ryme, Scarlet/Violet Gym rematch (snapshot 20260913143419).
  { id: "ryme-scarlet-rematch", person: "ryme", name: "Ryme", title: "Montenevera Gym Leader", game: "Pokémon Scarlet and Violet (rematch)", tier: "gym",
    species: ["Banette", "Mimikyu", "Spiritomb", "Houndstone", "Toxtricity"],
    signature: { title: "Encore", effect: "boost30" } },
  // Bulbapedia: Grusha, Scarlet/Violet Gym rematch (snapshot 20260904205846).
  { id: "grusha-scarlet-rematch", person: "grusha", name: "Grusha", title: "Glaseado Gym Leader", game: "Pokémon Scarlet and Violet (rematch)", tier: "gym",
    species: ["Frosmoth", "Beartic", "Cetitan", "Weavile", "Altaria"],
    signature: { title: "Avalanche", effect: "heal50" } },
  // Bulbapedia: Tulip, Scarlet/Violet Gym rematch (snapshot 20260905115403).
  { id: "tulip-scarlet-rematch", person: "tulip", name: "Tulip", title: "Alfornada Gym Leader", game: "Pokémon Scarlet and Violet (rematch)", tier: "gym",
    species: ["Farigiraf", "Gardevoir", "Espathra", "Gallade", "Florges"],
    signature: { title: "Makeover", effect: "heal50" } },
  // Bulbapedia: Hala, Ultra Sun/Ultra Moon grand trial (snapshot 20261002171643).
  { id: "hala-ultrasun", person: "hala", name: "Hala", title: "Kahuna of Melemele Island", game: "Pokémon Ultra Sun and Ultra Moon", tier: "gym",
    species: ["Machop", "Makuhita", "Crabrawler"],
    signature: { title: "Kahuna's wisdom", effect: "heal50" } },
  // Bulbapedia: Olivia, Ultra Sun/Ultra Moon grand trial (snapshot 20260906091737).
  { id: "olivia-ultrasun", person: "olivia", name: "Olivia", title: "Kahuna of Akala Island", game: "Pokémon Ultra Sun and Ultra Moon", tier: "gym",
    species: ["Anorith", "Lileep", "Lycanroc"],
    signature: { title: "Ancient fossils", effect: "energy2" } },
  // Bulbapedia: Nanu, Sun/Moon second battle in Seafolk Village (snapshot 20260824150228).
  { id: "nanu-sun-rematch", person: "nanu", name: "Nanu", title: "Kahuna of Ula'ula Island", game: "Pokémon Sun and Moon (rematch)", tier: "gym",
    species: ["Sableye", "Krookodile", "Honchkrow", "Absol", "Alolan Persian"],
    signature: { title: "Night patrol", effect: "energy2" } },
  // Bulbapedia: Hapu, Ultra Sun/Ultra Moon grand trial (snapshot 20260911051803).
  { id: "hapu-ultrasun", person: "hapu", name: "Hapu", title: "Kahuna of Poni Island", game: "Pokémon Ultra Sun and Ultra Moon", tier: "gym",
    species: ["Golurk", "Gastrodon", "Flygon", "Mudsdale"],
    signature: { title: "Desert courage", effect: "boost30" } },
  // Bulbapedia: Hapu, Sun/Moon Title Defense battle (snapshot 20260911051803).
  { id: "hapu-sun-rematch", person: "hapu", name: "Hapu", title: "Kahuna of Poni Island", game: "Pokémon Sun and Moon (title defense)", tier: "gym",
    species: ["Alolan Dugtrio", "Gastrodon", "Krookodile", "Flygon", "Mudsdale"],
    signature: { title: "Title challenger", effect: "boost30" } },

  // ── Elite Four (Wednesday, Thursday) ──────────────────────────────────────────────────────────
  // First Elite Four battle in each game, not rematches. Snapshots between December 2025 and August 2026.

  // Bulbapedia: Lorelei, FireRed/LeafGreen.
  { id: "lorelei-firered", name: "Lorelei", title: "Elite Four of Kanto", game: "Pokémon FireRed and LeafGreen", tier: "elite",
    species: ["Dewgong", "Cloyster", "Slowbro", "Jynx", "Lapras"],
    signature: { title: "Frozen solid", effect: "heal50" } },
  // Bulbapedia: Agatha, FireRed/LeafGreen. Gengar twice.
  { id: "agatha-firered", name: "Agatha", title: "Elite Four of Kanto", game: "Pokémon FireRed and LeafGreen", tier: "elite",
    species: ["Gengar", "Golbat", "Haunter", "Arbok", "Gengar"],
    signature: { title: "An old hand's tricks", effect: "energy2" } },
  // Bulbapedia: Karen, HeartGold/SoulSilver.
  { id: "karen-heartgold", name: "Karen", title: "Elite Four of Johto", game: "Pokémon HeartGold and SoulSilver", tier: "elite",
    species: ["Umbreon", "Vileplume", "Murkrow", "Gengar", "Houndoom"],
    signature: { title: "Favorites win", effect: "boost30" } },
  // Bulbapedia: Sidney, Emerald.
  { id: "sidney-emerald", name: "Sidney", title: "Elite Four of Hoenn", game: "Pokémon Emerald", tier: "elite",
    species: ["Mightyena", "Shiftry", "Cacturne", "Crawdaunt", "Absol"],
    signature: { title: "Bring it on!", effect: "boost30" } },
  // Bulbapedia: Phoebe, Emerald. Dusclops twice and Banette twice.
  { id: "phoebe-emerald", name: "Phoebe", title: "Elite Four of Hoenn", game: "Pokémon Emerald", tier: "elite",
    species: ["Dusclops", "Banette", "Sableye", "Banette", "Dusclops"],
    signature: { title: "Spirit bond", effect: "heal50" } },
  // Bulbapedia: Drake_(Hoenn), Emerald.
  { id: "drake-emerald", name: "Drake", title: "Elite Four of Hoenn", game: "Pokémon Emerald", tier: "elite",
    species: ["Shelgon", "Altaria", "Kingdra", "Flygon", "Salamence"],
    signature: { title: "A dragon's heart", effect: "boost30" } },
  // Bulbapedia: Aaron, Platinum (Yanmega and Scizor replace Diamond/Pearl's Dustox and Beautifly).
  { id: "aaron-platinum", name: "Aaron", title: "Elite Four of Sinnoh", game: "Pokémon Platinum", tier: "elite",
    species: ["Yanmega", "Scizor", "Heracross", "Vespiquen", "Drapion"],
    signature: { title: "Bug swarm", effect: "energy2" } },
  // Bulbapedia: Bertha, Platinum.
  { id: "bertha-platinum", name: "Bertha", title: "Elite Four of Sinnoh", game: "Pokémon Platinum", tier: "elite",
    species: ["Whiscash", "Gliscor", "Hippowdon", "Golem", "Rhyperior"],
    signature: { title: "Grandma's grit", effect: "heal50" } },
  // Bulbapedia: Flint, Platinum.
  { id: "flint-platinum", name: "Flint", title: "Elite Four of Sinnoh", game: "Pokémon Platinum", tier: "elite",
    species: ["Houndoom", "Flareon", "Rapidash", "Infernape", "Magmortar"],
    signature: { title: "Fired up", effect: "boost30" } },
  // Bulbapedia: Lucian, Platinum.
  { id: "lucian-platinum", name: "Lucian", title: "Elite Four of Sinnoh", game: "Pokémon Platinum", tier: "elite",
    species: ["Mr. Mime", "Espeon", "Bronzong", "Alakazam", "Gallade"],
    signature: { title: "Calm reading", effect: "energy2" } },
  // Bulbapedia: Shauntal, Black/White first battle.
  { id: "shauntal-black", name: "Shauntal", title: "Elite Four of Unova", game: "Pokémon Black and White", tier: "elite",
    species: ["Cofagrigus", "Jellicent", "Golurk", "Chandelure"],
    signature: { title: "A chilling chapter", effect: "energy2" } },
  // Bulbapedia: Grimsley, Black/White first battle.
  { id: "grimsley-black", name: "Grimsley", title: "Elite Four of Unova", game: "Pokémon Black and White", tier: "elite",
    species: ["Scrafty", "Krookodile", "Liepard", "Bisharp"],
    signature: { title: "All in", effect: "boost30" } },
  // Bulbapedia: Caitlin, Black/White first battle.
  { id: "caitlin-black", name: "Caitlin", title: "Elite Four of Unova", game: "Pokémon Black and White", tier: "elite",
    species: ["Reuniclus", "Musharna", "Sigilyph", "Gothitelle"],
    signature: { title: "Waking dream", effect: "heal50" } },
  // Bulbapedia: Marshal, Black/White first battle.
  { id: "marshal-black", name: "Marshal", title: "Elite Four of Unova", game: "Pokémon Black and White", tier: "elite",
    species: ["Throh", "Sawk", "Conkeldurr", "Mienshao"],
    signature: { title: "Fighting spirit", effect: "boost30" } },
  // Bulbapedia: Malva, X/Y.
  { id: "malva-x", name: "Malva", title: "Elite Four of Kalos", game: "Pokémon X and Y", tier: "elite",
    species: ["Pyroar", "Torkoal", "Chandelure", "Talonflame"],
    signature: { title: "Searing scorn", effect: "boost30" } },
  // Bulbapedia: Siebold, X/Y.
  { id: "siebold-x", name: "Siebold", title: "Elite Four of Kalos", game: "Pokémon X and Y", tier: "elite",
    species: ["Clawitzer", "Gyarados", "Starmie", "Barbaracle"],
    signature: { title: "Chef's special", effect: "heal50" } },
  // Bulbapedia: Wikstrom, X/Y.
  { id: "wikstrom-x", name: "Wikstrom", title: "Elite Four of Kalos", game: "Pokémon X and Y", tier: "elite",
    species: ["Klefki", "Probopass", "Scizor", "Aegislash"],
    signature: { title: "Knight's honor", effect: "heal50" } },
  // Bulbapedia: Drasna, X/Y.
  { id: "drasna-x", name: "Drasna", title: "Elite Four of Kalos", game: "Pokémon X and Y", tier: "elite",
    species: ["Dragalge", "Druddigon", "Altaria", "Noivern"],
    signature: { title: "Dragon friends", effect: "energy2" } },
  // Bulbapedia: Acerola, Sun/Moon initial battle.
  { id: "acerola-sun", name: "Acerola", title: "Elite Four of Alola", game: "Pokémon Sun and Moon", tier: "elite",
    species: ["Sableye", "Drifblim", "Dhelmise", "Froslass", "Palossand"],
    signature: { title: "Spooky friends", effect: "heal50" } },
  // Bulbapedia: Kahili, Sun/Moon initial battle (Oricorio in Baile Style).
  { id: "kahili-sun", name: "Kahili", title: "Elite Four of Alola", game: "Pokémon Sun and Moon", tier: "elite",
    species: ["Skarmory", "Crobat", "Oricorio", "Mandibuzz", "Toucannon"],
    signature: { title: "Hole in one", effect: "boost30" } },
  // Bulbapedia: Rika, Scarlet/Violet Champion Assessment.
  { id: "rika-scarlet", name: "Rika", title: "Elite Four of Paldea", game: "Pokémon Scarlet and Violet", tier: "elite",
    species: ["Whiscash", "Camerupt", "Donphan", "Dugtrio", "Paldean Clodsire"],
    signature: { title: "Tough interview", effect: "energy2" } },
  // Bulbapedia: Poppy, Scarlet/Violet Champion Assessment.
  { id: "poppy-scarlet", name: "Poppy", title: "Elite Four of Paldea", game: "Pokémon Scarlet and Violet", tier: "elite",
    species: ["Copperajah", "Magnezone", "Bronzong", "Corviknight", "Tinkaton"],
    signature: { title: "Big hammer time", effect: "boost30" } },
  // Bulbapedia: Hassel, Scarlet/Violet Champion Assessment.
  { id: "hassel-scarlet", name: "Hassel", title: "Elite Four of Paldea", game: "Pokémon Scarlet and Violet", tier: "elite",
    species: ["Noivern", "Haxorus", "Dragalge", "Flapple", "Baxcalibur"],
    signature: { title: "The art of dragons", effect: "energy2" } },

  // Added in the roster round of 2026-10-21. Blueberry Academy's Elite Four bring 6 (Double Battles
  // in The Indigo Disk; here one card at a time).

  // Bulbapedia: Bruno, FireRed/LeafGreen first battle (snapshot 20261001202821). Onix twice.
  { id: "bruno-firered", name: "Bruno", title: "Elite Four of Kanto", game: "Pokémon FireRed and LeafGreen", tier: "elite",
    species: ["Onix", "Hitmonchan", "Hitmonlee", "Onix", "Machamp"],
    signature: { title: "Power of muscle", effect: "boost30" } },
  // Bulbapedia: Will, HeartGold/SoulSilver first battle (snapshot 20260902153554). Xatu twice.
  { id: "will-heartgold", name: "Will", title: "Elite Four of Johto", game: "Pokémon HeartGold and SoulSilver", tier: "elite",
    species: ["Xatu", "Jynx", "Slowbro", "Exeggutor", "Xatu"],
    signature: { title: "Masked mind", effect: "energy2" } },
  // Bulbapedia: Molayne, Ultra Sun/Ultra Moon initial Elite Four battle (snapshot 20260904160656).
  { id: "molayne-ultrasun", name: "Molayne", title: "Elite Four of Alola", game: "Pokémon Ultra Sun and Ultra Moon", tier: "elite",
    species: ["Klefki", "Bisharp", "Magnezone", "Metagross", "Alolan Dugtrio"],
    signature: { title: "Tuned to perfection", effect: "heal50" } },
  // Bulbapedia: Crispin, Indigo Disk Elite Four battle (snapshot 20260819072849). Heat Rotom.
  { id: "crispin-indigo", name: "Crispin", title: "Elite Four of Blueberry Academy", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "elite",
    species: ["Heat Rotom", "Talonflame", "Exeggutor", "Camerupt", "Magmortar", "Blaziken"],
    signature: { title: "Too hot to handle", effect: "boost30" } },
  // Bulbapedia: Amarys, Indigo Disk Elite Four battle (snapshot 20261011215507).
  { id: "amarys-indigo", name: "Amarys", title: "Elite Four of Blueberry Academy", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "elite",
    species: ["Skarmory", "Alolan Dugtrio", "Scizor", "Reuniclus", "Empoleon", "Metagross"],
    signature: { title: "Cool and collected", effect: "heal50" } },
  // Bulbapedia: Lacey, Indigo Disk Elite Four battle (snapshot 20261009033217). Her first battle, before she joins the Elite Four, has 3.
  { id: "lacey-indigo", name: "Lacey", title: "Elite Four of Blueberry Academy", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "elite",
    species: ["Whimsicott", "Granbull", "Primarina", "Galarian Slowbro", "Alcremie", "Excadrill"],
    signature: { title: "Rules are rules!", effect: "energy2" } },
  // Bulbapedia: Drayton, Indigo Disk Elite Four battle (snapshot 20260831065218).
  { id: "drayton-indigo", name: "Drayton", title: "Elite Four of Blueberry Academy", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "elite",
    species: ["Dragonite", "Flygon", "Haxorus", "Sceptile", "Kingdra", "Archaludon"],
    signature: { title: "Lazy dragon's roar", effect: "boost30" } },

  // Second teams (roster round pass 2, 2026-10-21), after each person's earlier teams. Lance, Koga, Larry,
  // Hala and Olivia are Elite Four members in the games named, so they're also elite people.

  // Bulbapedia: Lance, FireRed/LeafGreen Elite Four first battle; the same person as the Champion above, in another tier (snapshot 20260912012356).
  { id: "lance-firered", person: "lance", name: "Lance", title: "Elite Four of Kanto", game: "Pokémon FireRed and LeafGreen", tier: "elite",
    species: ["Gyarados", "Dragonair", "Dragonair", "Aerodactyl", "Dragonite"], owner: "Lance",
    signature: { title: "Dragon master's command", effect: "energy2" } },
  // Bulbapedia: Lance, Let's Go Elite Four first battle (snapshot 20260912012356).
  { id: "lance-letsgo", person: "lance", name: "Lance", title: "Elite Four of Kanto", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "elite",
    species: ["Seadra", "Aerodactyl", "Gyarados", "Charizard", "Dragonite"], owner: "Lance",
    signature: { title: "Cape in the wind", effect: "heal50" } },
  // Bulbapedia: Koga, HeartGold/SoulSilver Elite Four first battle; the same person as the Fuchsia Gym Leader, in another tier (snapshot 20260901074728).
  { id: "koga-heartgold", person: "koga", name: "Koga", title: "Elite Four of Johto", game: "Pokémon HeartGold and SoulSilver", tier: "elite",
    species: ["Ariados", "Forretress", "Muk", "Venomoth", "Crobat"], owner: "Koga",
    signature: { title: "Ninja of the league", effect: "energy2" } },
  // Bulbapedia: Lorelei, FireRed/LeafGreen rematch (snapshot 20260912021538).
  { id: "lorelei-firered-rematch", person: "lorelei", name: "Lorelei", title: "Elite Four of Kanto", game: "Pokémon FireRed and LeafGreen (rematch)", tier: "elite",
    species: ["Dewgong", "Cloyster", "Piloswine", "Jynx", "Lapras"],
    signature: { title: "Ice queen's return", effect: "heal50" } },
  // Bulbapedia: Lorelei, Let's Go rematch; her first Let's Go battle has the FireRed/LeafGreen team (snapshot 20260912021538).
  { id: "lorelei-letsgo", person: "lorelei", name: "Lorelei", title: "Elite Four of Kanto", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee! (rematch)", tier: "elite",
    species: ["Dewgong", "Jynx", "Alolan Sandslash", "Cloyster", "Slowbro", "Lapras"],
    signature: { title: "Frozen glare", effect: "energy2" } },
  // Bulbapedia: Agatha, FireRed/LeafGreen rematch (snapshot 20260902154932).
  { id: "agatha-firered-rematch", person: "agatha", name: "Agatha", title: "Elite Four of Kanto", game: "Pokémon FireRed and LeafGreen (rematch)", tier: "elite",
    species: ["Gengar", "Crobat", "Misdreavus", "Arbok", "Gengar"],
    signature: { title: "Haunted veteran", effect: "energy2" } },
  // Bulbapedia: Agatha, Let's Go first battle (snapshot 20260902154932).
  { id: "agatha-letsgo", person: "agatha", name: "Agatha", title: "Elite Four of Kanto", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "elite",
    species: ["Arbok", "Gengar", "Golbat", "Weezing", "Gengar"],
    signature: { title: "Poison and phantoms", effect: "boost30" } },
  // Bulbapedia: Bruno, FireRed/LeafGreen rematch (snapshot 20261001202821).
  { id: "bruno-firered-rematch", person: "bruno", name: "Bruno", title: "Elite Four of Kanto", game: "Pokémon FireRed and LeafGreen (rematch)", tier: "elite",
    species: ["Steelix", "Hitmonchan", "Hitmonlee", "Steelix", "Machamp"],
    signature: { title: "Iron body", effect: "boost30" } },
  // Bulbapedia: Bruno, HeartGold/SoulSilver first battle (snapshot 20261001202821).
  { id: "bruno-heartgold", person: "bruno", name: "Bruno", title: "Elite Four of Johto", game: "Pokémon HeartGold and SoulSilver", tier: "elite",
    species: ["Hitmontop", "Hitmonlee", "Hitmonchan", "Onix", "Machamp"],
    signature: { title: "Fists of fury", effect: "boost30" } },
  // Bulbapedia: Bruno, Let's Go first battle (snapshot 20261001202821).
  { id: "bruno-letsgo", person: "bruno", name: "Bruno", title: "Elite Four of Kanto", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "elite",
    species: ["Onix", "Hitmonchan", "Hitmonlee", "Poliwrath", "Machamp"],
    signature: { title: "Martial spirit", effect: "heal50" } },
  // Bulbapedia: Karen, HeartGold/SoulSilver rematch (snapshot 20261001135229).
  { id: "karen-heartgold-rematch", person: "karen", name: "Karen", title: "Elite Four of Johto", game: "Pokémon HeartGold and SoulSilver (rematch)", tier: "elite",
    species: ["Weavile", "Absol", "Spiritomb", "Houndoom", "Honchkrow", "Umbreon"],
    signature: { title: "Darkness suits me", effect: "boost30" } },
  // Bulbapedia: Will, HeartGold/SoulSilver rematch (snapshot 20260902153554).
  { id: "will-heartgold-rematch", person: "will", name: "Will", title: "Elite Four of Johto", game: "Pokémon HeartGold and SoulSilver (rematch)", tier: "elite",
    species: ["Bronzong", "Jynx", "Grumpig", "Slowbro", "Gardevoir", "Xatu"],
    signature: { title: "Psychic vision", effect: "energy2" } },
  // Bulbapedia: Sidney, Omega Ruby/Alpha Sapphire first battle (snapshot 20260904183500).
  { id: "sidney-omegaruby", person: "sidney", name: "Sidney", title: "Elite Four of Hoenn", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "elite",
    species: ["Mightyena", "Shiftry", "Cacturne", "Sharpedo", "Absol"],
    signature: { title: "Grin and bear it", effect: "boost30" } },
  // Bulbapedia: Phoebe, Omega Ruby/Alpha Sapphire initial battle (snapshot 20260902153703).
  { id: "phoebe-omegaruby", person: "phoebe", name: "Phoebe", title: "Elite Four of Hoenn", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "elite",
    species: ["Dusclops", "Banette", "Sableye", "Banette", "Dusknoir"],
    signature: { title: "Mt. Pyre whispers", effect: "heal50" } },
  // Bulbapedia: Drake_(Hoenn), Omega Ruby/Alpha Sapphire initial battle (snapshot 20260831064648).
  { id: "drake-omegaruby", person: "drake", name: "Drake", title: "Elite Four of Hoenn", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "elite",
    species: ["Altaria", "Flygon", "Kingdra", "Flygon", "Salamence"],
    signature: { title: "Sailor's dragons", effect: "boost30" } },
  // Bulbapedia: Aaron, Brilliant Diamond/Shining Pearl first match; Diamond and Pearl have the same team (snapshot 20260903013049).
  { id: "aaron-bdsp", person: "aaron", name: "Aaron", title: "Elite Four of Sinnoh", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "elite",
    species: ["Dustox", "Beautifly", "Vespiquen", "Heracross", "Drapion"],
    signature: { title: "Bug lover's pride", effect: "energy2" } },
  // Bulbapedia: Bertha, Brilliant Diamond/Shining Pearl first match; Diamond and Pearl have the same team (snapshot 20260904221200).
  { id: "bertha-bdsp", person: "bertha", name: "Bertha", title: "Elite Four of Sinnoh", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "elite",
    species: ["Quagsire", "Sudowoodo", "Golem", "Whiscash", "Hippowdon"],
    signature: { title: "Earthy wisdom", effect: "heal50" } },
  // Bulbapedia: Flint, Brilliant Diamond/Shining Pearl first match; Diamond and Pearl have the same team (snapshot 20260823164048).
  { id: "flint-bdsp", person: "flint", name: "Flint", title: "Elite Four of Sinnoh", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "elite",
    species: ["Rapidash", "Steelix", "Drifblim", "Lopunny", "Infernape"],
    signature: { title: "Hair on fire", effect: "boost30" } },
  // Bulbapedia: Lucian, Brilliant Diamond/Shining Pearl first match; Diamond and Pearl have the same team (snapshot 20260909164347).
  { id: "lucian-bdsp", person: "lucian", name: "Lucian", title: "Elite Four of Sinnoh", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "elite",
    species: ["Mr. Mime", "Girafarig", "Medicham", "Alakazam", "Bronzong"],
    signature: { title: "Bookmark the moment", effect: "energy2" } },
  // Bulbapedia: Shauntal, Black/White rematch; post-National Pokédex (snapshot 20260909034516).
  { id: "shauntal-black-rematch", person: "shauntal", name: "Shauntal", title: "Elite Four of Unova", game: "Pokémon Black and White (rematch)", tier: "elite",
    species: ["Cofagrigus", "Jellicent", "Golurk", "Froslass", "Drifblim", "Chandelure"],
    signature: { title: "Haunted manuscript", effect: "energy2" } },
  // Bulbapedia: Shauntal, Black 2/White 2 first battle, Easy and Normal Mode (snapshot 20260909034516).
  { id: "shauntal-black2", person: "shauntal", name: "Shauntal", title: "Elite Four of Unova", game: "Pokémon Black 2 and White 2", tier: "elite",
    species: ["Cofagrigus", "Drifblim", "Golurk", "Chandelure"],
    signature: { title: "Ghost story hour", effect: "heal50" } },
  // Bulbapedia: Grimsley, Black/White rematch; post-National Pokédex (snapshot 20260912182648).
  { id: "grimsley-black-rematch", person: "grimsley", name: "Grimsley", title: "Elite Four of Unova", game: "Pokémon Black and White (rematch)", tier: "elite",
    species: ["Sharpedo", "Scrafty", "Krookodile", "Liepard", "Drapion", "Bisharp"],
    signature: { title: "High stakes", effect: "boost30" } },
  // Bulbapedia: Grimsley, Black 2/White 2 rematch, Easy and Normal Mode; his first Black 2/White 2 battle has the Black/White team (snapshot 20260912182648).
  { id: "grimsley-black2", person: "grimsley", name: "Grimsley", title: "Elite Four of Unova", game: "Pokémon Black 2 and White 2 (rematch)", tier: "elite",
    species: ["Liepard", "Honchkrow", "Scrafty", "Krookodile", "Houndoom", "Bisharp"],
    signature: { title: "Gambler's luck", effect: "energy2" } },
  // Bulbapedia: Caitlin, Black/White rematch; post-National Pokédex (snapshot 20260915135552).
  { id: "caitlin-black-rematch", person: "caitlin", name: "Caitlin", title: "Elite Four of Unova", game: "Pokémon Black and White (rematch)", tier: "elite",
    species: ["Musharna", "Sigilyph", "Reuniclus", "Gothitelle", "Bronzong", "Metagross"],
    signature: { title: "Sleepy power", effect: "heal50" } },
  // Bulbapedia: Caitlin, Black 2/White 2 rematch, Easy and Normal Mode; her first Black 2/White 2 battle has the Black/White team (snapshot 20260915135552).
  { id: "caitlin-black2", person: "caitlin", name: "Caitlin", title: "Elite Four of Unova", game: "Pokémon Black 2 and White 2 (rematch)", tier: "elite",
    species: ["Musharna", "Sigilyph", "Gothitelle", "Gallade", "Reuniclus", "Metagross"],
    signature: { title: "Graceful mind", effect: "energy2" } },
  // Bulbapedia: Marshal, Black/White rematch; post-National Pokédex (snapshot 20260908175235).
  { id: "marshal-black-rematch", person: "marshal", name: "Marshal", title: "Elite Four of Unova", game: "Pokémon Black and White (rematch)", tier: "elite",
    species: ["Breloom", "Throh", "Sawk", "Mienshao", "Toxicroak", "Conkeldurr"],
    signature: { title: "Iron will", effect: "boost30" } },
  // Bulbapedia: Marshal, Black 2/White 2 rematch, Easy and Normal Mode; his first Black 2/White 2 battle has the Black/White team (snapshot 20260908175235).
  { id: "marshal-black2", person: "marshal", name: "Marshal", title: "Elite Four of Unova", game: "Pokémon Black 2 and White 2 (rematch)", tier: "elite",
    species: ["Throh", "Sawk", "Lucario", "Mienshao", "Medicham", "Conkeldurr"],
    signature: { title: "Disciple's resolve", effect: "heal50" } },
  // Bulbapedia: Acerola, Ultra Sun/Ultra Moon initial battle (snapshot 20260912041445).
  { id: "acerola-ultrasun", person: "acerola", name: "Acerola", title: "Elite Four of Alola", game: "Pokémon Ultra Sun and Ultra Moon", tier: "elite",
    species: ["Banette", "Drifblim", "Dhelmise", "Froslass", "Palossand"],
    signature: { title: "Royal ghost friends", effect: "heal50" } },
  // Bulbapedia: Kahili, Ultra Sun/Ultra Moon initial battle (snapshot 20260823164828).
  { id: "kahili-ultrasun", person: "kahili", name: "Kahili", title: "Elite Four of Alola", game: "Pokémon Ultra Sun and Ultra Moon", tier: "elite",
    species: ["Braviary", "Hawlucha", "Oricorio", "Mandibuzz", "Toucannon"],
    signature: { title: "Eagle shot", effect: "boost30" } },
  // Bulbapedia: Molayne, Sun/Moon Title Defense battle (snapshot 20260904160656).
  { id: "molayne-sun", person: "molayne", name: "Molayne", title: "Hokulani trial captain", game: "Pokémon Sun and Moon (title defense)", tier: "elite",
    species: ["Skarmory", "Alolan Sandslash", "Magnezone", "Metagross", "Alolan Dugtrio"],
    signature: { title: "Captain's code", effect: "heal50" } },
  // Bulbapedia: Rika, League Club Room battle at Blueberry Academy (snapshot 20260907165253).
  { id: "rika-indigo", person: "rika", name: "Rika", title: "Elite Four of Paldea", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "elite",
    species: ["Dugtrio", "Whiscash", "Camerupt", "Torterra", "Donphan", "Paldean Clodsire"],
    signature: { title: "Hard questions", effect: "energy2" } },
  // Bulbapedia: Poppy, League Club Room battle at Blueberry Academy (snapshot 20260901203559).
  { id: "poppy-indigo", person: "poppy", name: "Poppy", title: "Elite Four of Paldea", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "elite",
    species: ["Copperajah", "Bastiodon", "Bronzong", "Magnezone", "Corviknight", "Tinkaton"],
    signature: { title: "Hammer swing", effect: "boost30" } },
  // Bulbapedia: Hassel, Academy Ace Tournament, before catching Terapagos (snapshot 20260904213435).
  { id: "hassel-scarlet-rematch", person: "hassel", name: "Hassel", title: "Elite Four of Paldea", game: "Pokémon Scarlet and Violet (Academy Ace Tournament)", tier: "elite",
    species: ["Noivern", "Haxorus", "Dragalge", "Flapple", "Dragonite", "Baxcalibur"],
    signature: { title: "Art teacher's flair", effect: "energy2" } },
  // Bulbapedia: Hassel, League Club Room battle, after catching Terapagos (snapshot 20260904213435).
  { id: "hassel-indigo", person: "hassel", name: "Hassel", title: "Elite Four of Paldea", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "elite",
    species: ["Duraludon", "Noivern", "Haxorus", "Dragalge", "Dragonite", "Baxcalibur"],
    signature: { title: "Dragon masterpiece", effect: "boost30" } },
  // Bulbapedia: Larry, Scarlet/Violet Champion Assessment; the same person as the Medali Gym Leader, in another tier (snapshot 20261015100336).
  { id: "larry-scarlet-elite", person: "larry", name: "Larry", title: "Elite Four of Paldea", game: "Pokémon Scarlet and Violet", tier: "elite",
    species: ["Tropius", "Oricorio", "Altaria", "Staraptor", "Flamigo"], owner: "Larry",
    signature: { title: "Overtime shift", effect: "energy2" } },
  // Bulbapedia: Hala, Sun/Moon Pokémon League battle; the same person as the Melemele kahuna, in another tier (snapshot 20261002171643).
  { id: "hala-sun-elite", person: "hala", name: "Hala", title: "Elite Four of Alola", game: "Pokémon Sun and Moon", tier: "elite",
    species: ["Hariyama", "Primeape", "Bewear", "Poliwrath", "Crabominable"],
    signature: { title: "Sumo stomp", effect: "boost30" } },
  // Bulbapedia: Olivia, Sun/Moon Pokémon League battle; the same person as the Akala kahuna, in another tier (snapshot 20260906091737).
  { id: "olivia-sun-elite", person: "olivia", name: "Olivia", title: "Elite Four of Alola", game: "Pokémon Sun and Moon", tier: "elite",
    species: ["Relicanth", "Carbink", "Alolan Golem", "Probopass", "Lycanroc"],
    signature: { title: "Glittering rocks", effect: "heal50" } },
  // Bulbapedia: Olivia, Ultra Sun/Ultra Moon Pokémon League battle (snapshot 20260906091737).
  { id: "olivia-ultrasun-elite", person: "olivia", name: "Olivia", title: "Elite Four of Alola", game: "Pokémon Ultra Sun and Ultra Moon", tier: "elite",
    species: ["Armaldo", "Cradily", "Gigalith", "Probopass", "Lycanroc"],
    signature: { title: "Fossil sparkle", effect: "energy2" } },

  // ── Rivals (Friday) ───────────────────────────────────────────────────────────────────────────

  // Bulbapedia: Silver_(game), 5th battle at Victory Road, player chose Chikorita (snapshot 20260828).
  { id: "silver-heartgold", name: "Silver", title: "Rival", game: "Pokémon HeartGold and SoulSilver", tier: "rival",
    species: ["Sneasel", "Golbat", "Magneton", "Kadabra", "Haunter", "Typhlosion"],
    signature: { title: "I'll be the strongest", effect: "boost30" } },
  // Bulbapedia: Wally, 2nd battle at Victory Road (snapshot 20260828).
  { id: "wally-omegaruby", name: "Wally", title: "Rival", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "rival",
    species: ["Altaria", "Delcatty", "Roselia", "Magneton", "Gallade"],
    signature: { title: "I've gotten stronger", effect: "energy2" } },
  // Bulbapedia: Barry_(game)/Platinum, 6th battle at the Pokémon League, player chose Turtwig (snapshot 20260730).
  { id: "barry-platinum", name: "Barry", title: "Rival", game: "Pokémon Platinum", tier: "rival",
    species: ["Staraptor", "Floatzel", "Snorlax", "Heracross", "Roserade", "Infernape"],
    signature: { title: "I'll fine you!", effect: "boost30" } },
  // Bulbapedia: N, 5th battle in N's Castle, Pokémon Black (snapshot 20260929).
  { id: "n-black", name: "N", title: "King of Team Plasma", game: "Pokémon Black and White", tier: "rival",
    species: ["Zekrom", "Carracosta", "Vanilluxe", "Archeops", "Zoroark", "Klinklang"], owner: "N",
    signature: { title: "Ideals made real", effect: "energy2" } },
  // Bulbapedia: Cheren, post-game rematch at Victory Road, player chose Snivy (snapshot 20260912). His
  // last battle before the League has only 4, so this is his one battle with a full team.
  { id: "cheren-black", name: "Cheren", title: "Rival", game: "Pokémon Black and White", tier: "rival",
    species: ["Liepard", "Simisage", "Unfezant", "Gigalith", "Haxorus", "Emboar"],
    signature: { title: "Calculated strength", effect: "heal50" } },
  // Bulbapedia: Hop/Sword_and_Shield, 8th battle, Champion Cup semifinal, player chose Grookey (snapshot 20260219).
  { id: "hop-sword", name: "Hop", title: "Rival", game: "Pokémon Sword and Shield", tier: "rival",
    species: ["Dubwool", "Corviknight", "Pincurchin", "Snorlax", "Inteleon"], owner: "Hop",
    signature: { title: "Just like my brother", effect: "energy2" } },
  // Bulbapedia: Marnie, 3rd battle, Champion Cup semifinal (snapshot 20260911).
  { id: "marnie-sword", name: "Marnie", title: "Rival", game: "Pokémon Sword and Shield", tier: "rival",
    species: ["Liepard", "Toxicroak", "Scrafty", "Morpeko", "Grimmsnarl"], owner: "Marnie",
    signature: { title: "Team Yell cheers", effect: "boost30" } },
  // Bulbapedia: Gladion, Sun/Moon post-game Title Defense, player chose Rowlet (snapshot 20261005). His
  // last battle before the League (Mount Lanakila) has only 4; the title defense is his first with 5.
  { id: "gladion-sun", name: "Gladion", title: "Rival", game: "Pokémon Sun and Moon", tier: "rival",
    species: ["Crobat", "Weavile", "Porygon-Z", "Lucario", "Silvally"],
    signature: { title: "Lone wolf", effect: "heal50" } },
  // Bulbapedia: Nemona, 6th battle in Mesagoza after the League, player chose Sprigatito (snapshot 20261015).
  { id: "nemona-scarlet", name: "Nemona", title: "Champion-rank rival", game: "Pokémon Scarlet and Violet", tier: "rival",
    species: ["Lycanroc", "Goodra", "Dudunsparce", "Orthworm", "Pawmot", "Quaquaval"],
    signature: { title: "Let's battle again!", effect: "boost30" } },
  // Bulbapedia: Arven, Academy Ace Tournament in Mesagoza (snapshot 20261015).
  { id: "arven-scarlet", name: "Arven", title: "Rival", game: "Pokémon Scarlet and Violet", tier: "rival",
    species: ["Greedent", "Cloyster", "Scovillain", "Toedscruel", "Garganacl", "Mabosstiff"], owner: "Arven",
    signature: { title: "Home cooking", effect: "heal50" } },

  // Added in the roster round of 2026-10-21, the player's starter Grass as above. Calem and Serena
  // are the same rival in X and Y (whichever one you don't play as), with the same team: each uses a
  // different battle so they aren't the same duel twice. Brendan and May likewise: May from Emerald,
  // Brendan from Omega Ruby and Alpha Sapphire, whose teams differ. Shauna never brings more than 3,
  // and Brendan and May 4.

  // Bulbapedia: Bianca, Black/White post-game rematch in Nuvema Town, player chose Snivy (snapshot 20260906181402).
  // Her last battle before the League has 4; like Cheren, the rematch is her one battle with a full team.
  { id: "bianca-black", name: "Bianca", title: "Rival", game: "Pokémon Black and White", tier: "rival",
    species: ["Stoutland", "Simisear", "Musharna", "Mienshao", "Chandelure", "Samurott"],
    signature: { title: "Cheerful comeback", effect: "heal50" } },
  // Bulbapedia: Hugh, Black 2/White 2 sixth battle in Undella Town, player chose Snivy (snapshot 20260912163632).
  { id: "hugh-black2", name: "Hugh", title: "Rival", game: "Pokémon Black 2 and White 2", tier: "rival",
    species: ["Unfezant", "Simipour", "Bouffalant", "Flygon", "Eelektross", "Emboar"],
    signature: { title: "Righteous fury", effect: "boost30" } },
  // Bulbapedia: Serena_(game), X/Y fifth battle at Victory Road, player chose Chespin (snapshot 20260913143043).
  { id: "serena-x", name: "Serena", title: "Rival", game: "Pokémon X and Y", tier: "rival",
    species: ["Meowstic", "Jolteon", "Altaria", "Absol", "Delphox"],
    signature: { title: "Shining dream", effect: "energy2" } },
  // Bulbapedia: Shauna, X/Y second battle on Route 19, player chose Chespin (snapshot 20260912041518).
  { id: "shauna-x", name: "Shauna", title: "Rival", game: "Pokémon X and Y", tier: "rival",
    species: ["Delcatty", "Goodra", "Greninja"],
    signature: { title: "Strike a pose", effect: "heal50" } },
  // Bulbapedia: Bede, Sword/Shield post-game Champion tournament at Wyndon Stadium (snapshot 20260826034103).
  // His battles as a rival have 4.
  { id: "bede-sword", name: "Bede", title: "Rival", game: "Pokémon Sword and Shield", tier: "rival",
    species: ["Mawile", "Gardevoir", "Galarian Rapidash", "Sylveon", "Hatterene"],
    signature: { title: "The chosen one", effect: "boost30" } },
  // Bulbapedia: Penny, Scarlet/Violet first battle as the boss of Team Star (snapshot 20261015100338).
  { id: "penny-scarlet", name: "Penny", title: "Leader of Team Star", game: "Pokémon Scarlet and Violet", tier: "rival",
    species: ["Umbreon", "Vaporeon", "Jolteon", "Flareon", "Leafeon", "Sylveon"],
    signature: { title: "Backdoor hack", effect: "energy2" } },

  // The rivals below have no Supporter card of their own that we found.

  // Bulbapedia: Calem, X/Y post-game rematch in Kiloude City, player chose Chespin (snapshot 20260828045345).
  { id: "calem-x", name: "Calem", title: "Rival", game: "Pokémon X and Y", tier: "rival",
    species: ["Meowstic", "Clefable", "Jolteon", "Absol", "Altaria", "Delphox"],
    signature: { title: "Rising rival", effect: "boost30" } },
  // Bulbapedia: Brendan, Omega Ruby/Alpha Sapphire fourth battle in Lilycove City, player chose Treecko (snapshot 20260103232233).
  { id: "brendan-omegaruby", name: "Brendan", title: "Rival", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "rival",
    species: ["Swellow", "Wailord", "Breloom", "Blaziken"],
    signature: { title: "Field research", effect: "energy2" } },
  // Bulbapedia: May_(game), Emerald fifth battle in Lilycove City, player chose Treecko (snapshot 20260904160858).
  { id: "may-emerald", name: "May", title: "Rival", game: "Pokémon Emerald", tier: "rival",
    species: ["Tropius", "Pelipper", "Ludicolo", "Combusken"],
    signature: { title: "Contest sparkle", effect: "heal50" } },
  // Bulbapedia: Trace_(game), Let's Go, Pikachu! Champion battle (snapshot 20260919220555). Let's Go,
  // Eevee! has Raichu in Jolteon's place. His last rival battle before it has 4.
  { id: "trace-letsgo", name: "Trace", title: "Rival", game: "Pokémon: Let's Go, Pikachu!", tier: "rival",
    species: ["Pidgeot", "Vileplume", "Marowak", "Rapidash", "Slowbro", "Jolteon"],
    signature: { title: "Best friend's push", effect: "boost30" } },

  // Second teams (roster round pass 2, 2026-10-21), after each person's earlier teams.

  // Bulbapedia: Silver_(game), HeartGold/SoulSilver rematch at Indigo Plateau, player chose Chikorita (snapshot 20260828045748).
  { id: "silver-heartgold-rematch", person: "silver", name: "Silver", title: "Rival", game: "Pokémon HeartGold and SoulSilver (rematch)", tier: "rival",
    species: ["Sneasel", "Magneton", "Gengar", "Crobat", "Alakazam", "Typhlosion"],
    signature: { title: "Grown strong", effect: "boost30" } },
  // Bulbapedia: Wally, Ruby/Sapphire/Emerald battle at Victory Road (snapshot 20260828055147).
  { id: "wally-emerald", person: "wally", name: "Wally", title: "Rival", game: "Pokémon Ruby, Sapphire, and Emerald", tier: "rival",
    species: ["Altaria", "Delcatty", "Roselia", "Magneton", "Gardevoir"],
    signature: { title: "First Gardevoir", effect: "heal50" } },
  // Bulbapedia: Wally, Omega Ruby/Alpha Sapphire fourth battle onwards at the Battle Resort (snapshot 20260828055147).
  { id: "wally-omegaruby-rematch", person: "wally", name: "Wally", title: "Rival", game: "Pokémon Omega Ruby and Alpha Sapphire (rematch)", tier: "rival",
    species: ["Roserade", "Talonflame", "Azumarill", "Magnezone", "Garchomp", "Gallade"],
    signature: { title: "Battle Resort spirit", effect: "energy2" } },
  // Bulbapedia: N, Black 2/White 2 spring battle in N's Castle (snapshot 20260929221311).
  { id: "n-black2", person: "n", name: "N", title: "Former King of Team Plasma", game: "Pokémon Black 2 and White 2 (spring)", tier: "rival",
    species: ["Politoed", "Lanturn", "Tentacruel", "Omastar", "Kabutops", "Starmie"], owner: "N",
    signature: { title: "Seasons of friends", effect: "heal50" } },
  // Bulbapedia: Hop, Sword tenth battle in the Slumbering Weald, player chose Grookey (snapshot 20260819102201).
  { id: "hop-sword-postgame", person: "hop", name: "Hop", title: "Rival", game: "Pokémon Sword (post-game)", tier: "rival",
    species: ["Dubwool", "Snorlax", "Pincurchin", "Corviknight", "Inteleon", "Zamazenta"], owner: "Hop",
    signature: { title: "Hero of the weald", effect: "boost30" } },
  // Bulbapedia: Gladion, Ultra Sun/Ultra Moon Title Defense battle, player chose Rowlet (snapshot 20261005122456).
  { id: "gladion-ultrasun", person: "gladion", name: "Gladion", title: "Rival", game: "Pokémon Ultra Sun and Ultra Moon (title defense)", tier: "rival",
    species: ["Crobat", "Zoroark", "Porygon-Z", "Lucario", "Venusaur", "Silvally"],
    signature: { title: "Power of the bond", effect: "heal50" } },
  // Bulbapedia: Nemona, seventh battle at Loyalty Plaza (Mochi Mayhem), player chose Sprigatito (snapshot 20261015100340).
  { id: "nemona-indigo", person: "nemona", name: "Nemona", title: "Champion-rank rival", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "rival",
    species: ["Lycanroc", "Kommo-o", "Goodra", "Ribombee", "Pawmot", "Quaquaval"],
    signature: { title: "Never tired of battle", effect: "boost30" } },
  // Bulbapedia: Brendan, Omega Ruby/Alpha Sapphire post-game battle on Route 103, player chose Treecko (snapshot 20260103232233).
  { id: "brendan-omegaruby-postgame", person: "brendan", name: "Brendan", title: "Rival", game: "Pokémon Omega Ruby and Alpha Sapphire (post-game)", tier: "rival",
    species: ["Swellow", "Raichu", "Wailord", "Breloom", "Blaziken"],
    signature: { title: "Professor's kid", effect: "energy2" } },

  // ── Bosses (Saturday) ─────────────────────────────────────────────────────────────────────────
  // Added in the roster round of 2026-10-21 (Saturday became Boss day): each villain team's boss with
  // 5 or 6. Giovanni, Archie, Maxie and Lysandre never bring more than 4 in their own games, so they
  // come from Team Rainbow Rocket in Ultra Sun and Ultra Moon (Ultra Sun where the legend differs).

  // Bulbapedia: Giovanni, Ultra Sun/Ultra Moon Team Rainbow Rocket (snapshot 20260912184836). The same
  // person as the Viridian Gym Leader above, in another tier.
  { id: "giovanni-ultrasun", name: "Giovanni", title: "Boss of Team Rainbow Rocket", game: "Pokémon Ultra Sun and Ultra Moon", tier: "boss",
    species: ["Dugtrio", "Nidoking", "Nidoqueen", "Rhyperior", "Mewtwo"], owner: "Team Rocket",
    signature: { title: "Team Rocket rises", effect: "boost30" } },
  // Bulbapedia: Archie, Ultra Sun/Ultra Moon Team Rainbow Rocket (snapshot 20260908212836). Alpha Sapphire's last battle has 4.
  { id: "archie-ultrasun", name: "Archie", title: "Team Aqua Leader", game: "Pokémon Ultra Sun and Ultra Moon", tier: "boss",
    species: ["Mightyena", "Crobat", "Muk", "Sharpedo", "Kyogre"], owner: "Team Aqua",
    signature: { title: "Rising sea", effect: "heal50" } },
  // Bulbapedia: Maxie, Ultra Sun/Ultra Moon Team Rainbow Rocket (snapshot 20260823065625). Omega Ruby's last battle has 4.
  { id: "maxie-ultrasun", name: "Maxie", title: "Team Magma Leader", game: "Pokémon Ultra Sun and Ultra Moon", tier: "boss",
    species: ["Mightyena", "Crobat", "Weezing", "Camerupt", "Groudon"], owner: "Team Magma",
    signature: { title: "Scorched earth", effect: "boost30" } },
  // Bulbapedia: Cyrus, Platinum third battle in the Distortion World (snapshot 20260904183447).
  { id: "cyrus-platinum", name: "Cyrus", title: "Team Galactic Boss", game: "Pokémon Platinum", tier: "boss",
    species: ["Houndoom", "Honchkrow", "Crobat", "Gyarados", "Weavile"],
    signature: { title: "Cold ambition", effect: "energy2" } },
  // Bulbapedia: Ghetsis, Black/White battle in N's Castle (snapshot 20261012173948).
  { id: "ghetsis-black", name: "Ghetsis", title: "Team Plasma's true leader", game: "Pokémon Black and White", tier: "boss",
    species: ["Cofagrigus", "Bouffalant", "Seismitoad", "Bisharp", "Eelektross", "Hydreigon"],
    signature: { title: "Utterly ruthless", effect: "boost30" } },
  // Bulbapedia: Lysandre, Ultra Sun Team Rainbow Rocket (snapshot 20261009125336). X and Y give him 4.
  { id: "lysandre-ultrasun", name: "Lysandre", title: "Team Flare Boss", game: "Pokémon Ultra Sun", tier: "boss",
    species: ["Mienshao", "Honchkrow", "Pyroar", "Gyarados", "Xerneas"],
    signature: { title: "A world of beauty", effect: "heal50" } },
  // Bulbapedia: Guzma, Sun/Moon fourth battle in Hau'oli City (snapshot 20260910133438). His battle as boss at Aether Paradise has 4.
  { id: "guzma-sun", name: "Guzma", title: "Team Skull Boss", game: "Pokémon Sun and Moon", tier: "boss",
    species: ["Golisopod", "Ariados", "Masquerain", "Pinsir", "Scizor"],
    signature: { title: "Destroyer's swagger", effect: "boost30" } },
  // Bulbapedia: Lusamine, Sun/Moon first battle at Aether Paradise (snapshot 20260910104914).
  { id: "lusamine-sun", name: "Lusamine", title: "Aether Foundation President", game: "Pokémon Sun and Moon", tier: "boss",
    species: ["Clefable", "Lilligant", "Mismagius", "Milotic", "Bewear"],
    signature: { title: "Beautiful obsession", effect: "heal50" } },
  // Bulbapedia: Rose, Sword/Shield battle at the Energy Plant (snapshot 20261005050933).
  { id: "rose-sword", name: "Rose", title: "Chairman of Macro Cosmos", game: "Pokémon Sword and Shield", tier: "boss",
    species: ["Escavalier", "Ferrothorn", "Galarian Perrserker", "Klinklang", "Copperajah"],
    signature: { title: "Galar's future", effect: "energy2" } },
  // Bulbapedia: Colress, Black 2/White 2 third battle on the Plasma Frigate (snapshot 20260912180910).
  { id: "colress-black2", name: "Colress", title: "Boss of the new Team Plasma", game: "Pokémon Black 2 and White 2", tier: "boss",
    species: ["Magneton", "Metang", "Beheeyem", "Magnezone", "Klinklang"],
    signature: { title: "Unleashed potential", effect: "energy2" } },
  // Bulbapedia: Volo, Legends: Arceus battle at the Temple of Sinnoh, first part (snapshot 20260908212645).
  { id: "volo-arceus", name: "Volo", title: "Pokémon Wielder", game: "Pokémon Legends: Arceus", tier: "boss",
    species: ["Spiritomb", "Roserade", "Togekiss", "Hisuian Arcanine", "Lucario", "Garchomp"],
    signature: { title: "True colors", effect: "boost30" } },

  // Second teams (roster round pass 2, 2026-10-21), after each person's earlier teams.

  // Bulbapedia: Cyrus, Ultra Sun Team Rainbow Rocket (snapshot 20260904183447).
  { id: "cyrus-ultrasun", person: "cyrus", name: "Cyrus", title: "Team Galactic Boss", game: "Pokémon Ultra Sun", tier: "boss",
    species: ["Houndoom", "Honchkrow", "Crobat", "Weavile", "Dialga"],
    signature: { title: "Ruler of time", effect: "boost30" } },
  // Bulbapedia: Ghetsis, Black 2/White 2 battle at Giant Chasm (snapshot 20261012173948).
  { id: "ghetsis-black2", person: "ghetsis", name: "Ghetsis", title: "Team Plasma's true leader", game: "Pokémon Black 2 and White 2", tier: "boss",
    species: ["Cofagrigus", "Seismitoad", "Eelektross", "Drapion", "Toxicroak", "Hydreigon"],
    signature: { title: "Plasma's iron grip", effect: "boost30" } },
  // Bulbapedia: Ghetsis, Ultra Sun Team Rainbow Rocket (snapshot 20261012173948).
  { id: "ghetsis-ultrasun", person: "ghetsis", name: "Ghetsis", title: "Team Plasma's true leader", game: "Pokémon Ultra Sun", tier: "boss",
    species: ["Cofagrigus", "Bouffalant", "Bisharp", "Hydreigon", "Zekrom"],
    signature: { title: "Rainbow schemes", effect: "energy2" } },
  // Bulbapedia: Guzma, Ultra Sun/Ultra Moon Title Defense battle (snapshot 20260910133438).
  { id: "guzma-ultrasun", person: "guzma", name: "Guzma", title: "Team Skull Boss", game: "Pokémon Ultra Sun and Ultra Moon (title defense)", tier: "boss",
    species: ["Golisopod", "Vikavolt", "Pinsir", "Masquerain", "Scizor"],
    signature: { title: "Big bad Guzma", effect: "boost30" } },
  // Bulbapedia: Lusamine, Ultra Sun/Ultra Moon battle at Aether Paradise (snapshot 20260910104914).
  { id: "lusamine-ultrasun", person: "lusamine", name: "Lusamine", title: "Aether Foundation President", game: "Pokémon Ultra Sun and Ultra Moon", tier: "boss",
    species: ["Clefable", "Lilligant", "Lopunny", "Milotic", "Bewear"],
    signature: { title: "Mother's ambition", effect: "heal50" } },
  // Bulbapedia: Colress, Black 2/White 2 post-game rematch on the Plasma Frigate (snapshot 20260912180910).
  { id: "colress-black2-rematch", person: "colress", name: "Colress", title: "Boss of the new Team Plasma", game: "Pokémon Black 2 and White 2 (rematch)", tier: "boss",
    species: ["Magneton", "Rotom", "Metagross", "Beheeyem", "Magnezone", "Klinklang"],
    signature: { title: "Science unbound", effect: "energy2" } },

  // ── Champions (Sunday) ────────────────────────────────────────────────────────────────────────

  // Bulbapedia: Blue_(game), Champion battle, player chose Bulbasaur (snapshot 20260912184625).
  { id: "blue-firered", name: "Blue", title: "Champion of Kanto", game: "Pokémon FireRed and LeafGreen", tier: "champion",
    species: ["Pidgeot", "Alakazam", "Rhydon", "Exeggutor", "Gyarados", "Charizard"],
    pin: { 5: "sv3pt5-199" }, // the 151 set's Fire Charizard ex (the automatic pick was a Darkness Tera print)
    signature: { title: "Smell ya later!", effect: "boost30" } },
  // Bulbapedia: Lance, first Champion battle at Indigo Plateau (snapshot 20260912012356).
  { id: "lance-heartgold", name: "Lance", title: "Champion of Johto and Kanto", game: "Pokémon HeartGold and SoulSilver", tier: "champion",
    species: ["Gyarados", "Dragonite", "Dragonite", "Aerodactyl", "Charizard", "Dragonite"], owner: "Lance",
    signature: { title: "Dragon master's roar", effect: "boost30" } },
  // Bulbapedia: Steven_Stone, Omega Ruby/Alpha Sapphire Champion battle (snapshot 20261004000401).
  { id: "steven-omegaruby", name: "Steven", title: "Champion of Hoenn", game: "Pokémon Omega Ruby and Alpha Sapphire", tier: "champion",
    species: ["Skarmory", "Claydol", "Aggron", "Cradily", "Armaldo", "Metagross"], owner: "Steven",
    signature: { title: "Hard as steel", effect: "heal50" } },
  // Bulbapedia: Wallace, Emerald Champion battle (snapshot 20260912183710).
  { id: "wallace-emerald", name: "Wallace", title: "Champion of Hoenn", game: "Pokémon Emerald", tier: "champion",
    species: ["Wailord", "Tentacruel", "Ludicolo", "Whiscash", "Gyarados", "Milotic"],
    signature: { title: "Elegant recovery", effect: "heal50" } },
  // Bulbapedia: Cynthia, Platinum Champion battle before Stark Mountain (snapshot 20260103000601).
  { id: "cynthia-platinum", name: "Cynthia", title: "Champion of Sinnoh", game: "Pokémon Platinum", tier: "champion",
    species: ["Spiritomb", "Roserade", "Togekiss", "Lucario", "Milotic", "Garchomp"], owner: "Cynthia",
    signature: { title: "Champion's resolve", effect: "energy2" } },
  // Bulbapedia: Alder, Black/White Champion battle (snapshot 20260823115100).
  { id: "alder-black", name: "Alder", title: "Champion of Unova", game: "Pokémon Black and White", tier: "champion",
    species: ["Accelgor", "Bouffalant", "Druddigon", "Vanilluxe", "Escavalier", "Volcarona"],
    signature: { title: "Burning spirit", effect: "boost30" } },
  // Bulbapedia: Iris, Black 2/White 2 first Champion battle (snapshot 20260930114308).
  { id: "iris-black2", name: "Iris", title: "Champion of Unova", game: "Pokémon Black 2 and White 2", tier: "champion",
    species: ["Hydreigon", "Druddigon", "Archeops", "Aggron", "Lapras", "Haxorus"],
    signature: { title: "Dragon tamer's cheer", effect: "energy2" } },
  // Bulbapedia: Diantha, X/Y Champion battle (snapshot 20261012130334).
  { id: "diantha-x", name: "Diantha", title: "Champion of Kalos", game: "Pokémon X and Y", tier: "champion",
    species: ["Hawlucha", "Tyrantrum", "Aurorus", "Gourgeist", "Goodra", "Gardevoir"],
    signature: { title: "Shining bond", effect: "energy2" } },
  // Bulbapedia: Professor_Kukui, first battle at the Pokémon League, player chose Rowlet (snapshot 20260223205843).
  { id: "kukui-sun", name: "Kukui", title: "Pokémon Professor of Alola", game: "Pokémon Sun and Moon", tier: "champion",
    species: ["Lycanroc", "Alolan Ninetales", "Braviary", "Magnezone", "Snorlax", "Incineroar"],
    signature: { title: "Woo! Full power!", effect: "boost30" } },
  // Bulbapedia: Leon, Championship Match at Wyndon Stadium, player chose Grookey (snapshot 20261013034059).
  { id: "leon-sword", name: "Leon", title: "Champion of Galar", game: "Pokémon Sword and Shield", tier: "champion",
    species: ["Aegislash", "Dragapult", "Haxorus", "Seismitoad", "Cinderace", "Charizard"],
    signature: { title: "Champion time", effect: "boost30" } },
  // Bulbapedia: Geeta, Champion Assessment (snapshot 20261015100332).
  { id: "geeta-scarlet", name: "Geeta", title: "Top Champion of Paldea", game: "Pokémon Scarlet and Violet", tier: "champion",
    species: ["Espathra", "Gogoat", "Veluza", "Avalugg", "Kingambit", "Glimmora"],
    signature: { title: "Champion's assessment", effect: "heal50" } },
  // Added in the roster round of 2026-10-21.

  // Bulbapedia: Red_(game), HeartGold/SoulSilver battle at Mt. Silver (snapshot 20260906180742).
  { id: "red-heartgold", name: "Red", title: "Former Champion of Kanto", game: "Pokémon HeartGold and SoulSilver", tier: "champion",
    species: ["Pikachu", "Lapras", "Snorlax", "Venusaur", "Charizard", "Blastoise"],
    signature: { title: "Silent strength", effect: "boost30" } },
  // Bulbapedia: Hau, Ultra Sun/Ultra Moon title defense, player chose Rowlet (snapshot 20260910171524).
  { id: "hau-ultrasun", name: "Hau", title: "Champion challenger of Alola", game: "Pokémon Ultra Sun and Ultra Moon", tier: "champion",
    species: ["Alolan Raichu", "Flareon", "Tauros", "Noivern", "Crabominable", "Primarina"],
    signature: { title: "Malasada break", effect: "heal50" } },
  // Bulbapedia: Kieran, Indigo Disk sixth battle as BB League Champion (snapshot 20260925020321).
  { id: "kieran-indigo", name: "Kieran", title: "BB League Champion", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "champion",
    species: ["Dragonite", "Politoed", "Porygon-Z", "Grimmsnarl", "Incineroar", "Hydrapple"],
    signature: { title: "Obsessed with winning", effect: "energy2" } },

  // Second teams (roster round pass 2, 2026-10-21), after each person's earlier teams.

  // Bulbapedia: Blue_(game), FireRed/LeafGreen rematch, player chose Bulbasaur (snapshot 20260912184625).
  { id: "blue-firered-rematch", person: "blue", name: "Blue", title: "Champion of Kanto", game: "Pokémon FireRed and LeafGreen (rematch)", tier: "champion",
    species: ["Heracross", "Alakazam", "Tyranitar", "Exeggutor", "Gyarados", "Charizard"],
    signature: { title: "Back on top", effect: "boost30" } },
  // Bulbapedia: Lance, HeartGold/SoulSilver Champion rematch (snapshot 20260912012356).
  { id: "lance-heartgold-rematch", person: "lance", name: "Lance", title: "Champion of Johto and Kanto", game: "Pokémon HeartGold and SoulSilver (rematch)", tier: "champion",
    species: ["Salamence", "Gyarados", "Garchomp", "Altaria", "Charizard", "Dragonite"], owner: "Lance",
    signature: { title: "Fury of dragons", effect: "boost30" } },
  // Bulbapedia: Steven_Stone, Omega Ruby/Alpha Sapphire Champion rematch (snapshot 20261004000401).
  { id: "steven-omegaruby-rematch", person: "steven", name: "Steven", title: "Champion of Hoenn", game: "Pokémon Omega Ruby and Alpha Sapphire (rematch)", tier: "champion",
    species: ["Skarmory", "Claydol", "Aggron", "Carbink", "Aerodactyl", "Metagross"], owner: "Steven",
    signature: { title: "Stone collector", effect: "heal50" } },
  // Bulbapedia: Cynthia, Brilliant Diamond/Shining Pearl Champion battle; Diamond and Pearl have the same team (snapshot 20261013034057).
  { id: "cynthia-bdsp", person: "cynthia", name: "Cynthia", title: "Champion of Sinnoh", game: "Pokémon Brilliant Diamond and Shining Pearl", tier: "champion",
    species: ["Spiritomb", "Roserade", "Gastrodon", "Lucario", "Milotic", "Garchomp"], owner: "Cynthia",
    signature: { title: "Mythology lesson", effect: "energy2" } },
  // Bulbapedia: Cynthia, Black/White battle in Undella Town (snapshot 20261013034057).
  { id: "cynthia-black", person: "cynthia", name: "Cynthia", title: "Champion of Sinnoh", game: "Pokémon Black and White", tier: "champion",
    species: ["Spiritomb", "Eelektross", "Milotic", "Braviary", "Lucario", "Garchomp"], owner: "Cynthia",
    signature: { title: "Seaside challenge", effect: "boost30" } },
  // Bulbapedia: Cynthia, Black 2/White 2 battle in Undella Town (snapshot 20261013034057).
  { id: "cynthia-black2", person: "cynthia", name: "Cynthia", title: "Champion of Sinnoh", game: "Pokémon Black 2 and White 2", tier: "champion",
    species: ["Spiritomb", "Milotic", "Togekiss", "Lucario", "Glaceon", "Garchomp"], owner: "Cynthia",
    signature: { title: "Undella getaway", effect: "heal50" } },
  // Bulbapedia: Alder, Black 2/White 2 battle in Floccesy Town (snapshot 20260823115100).
  { id: "alder-black2", person: "alder", name: "Alder", title: "Former Champion of Unova", game: "Pokémon Black 2 and White 2", tier: "champion",
    species: ["Accelgor", "Escavalier", "Bouffalant", "Conkeldurr", "Braviary", "Volcarona"],
    signature: { title: "Wandering mentor", effect: "boost30" } },
  // Bulbapedia: Red_(game), Gold/Silver/Crystal battle at Mt. Silver (snapshot 20260906180742).
  { id: "red-gold", person: "red", name: "Red", title: "Former Champion of Kanto", game: "Pokémon Gold, Silver, and Crystal", tier: "champion",
    species: ["Pikachu", "Espeon", "Snorlax", "Venusaur", "Charizard", "Blastoise"],
    signature: { title: "Peak of Mt. Silver", effect: "heal50" } },
  // Bulbapedia: Red_(game), Let's Go battle at Indigo Plateau (snapshot 20260906180742).
  { id: "red-letsgo", person: "red", name: "Red", title: "Former Champion of Kanto", game: "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!", tier: "champion",
    species: ["Pikachu", "Machamp", "Arcanine", "Lapras", "Snorlax", "Venusaur"],
    signature: { title: "A legend returns", effect: "energy2" } },
  // Bulbapedia: Geeta, League Club Room battle at Blueberry Academy (snapshot 20261015100332).
  { id: "geeta-indigo", person: "geeta", name: "Geeta", title: "Top Champion of Paldea", game: "Pokémon Scarlet and Violet: The Indigo Disk", tier: "champion",
    species: ["Glimmora", "Espathra", "Chesnaught", "Avalugg", "Dragapult", "Kingambit"],
    signature: { title: "Top Champion's test", effect: "energy2" } },
];

export const DUEL_TRAINERS: DuelTrainer[] = DUEL_TRAINER_PLANS.flatMap((p) => {
  const team = DUEL_TEAM_PICKS[p.id];
  if (!team || team.length !== p.species.length) return [];
  return [{ id: p.id, person: p.person ?? personKey(p.name), name: p.name, title: p.title, game: p.game, tier: p.tier, team, signature: p.signature }];
});
