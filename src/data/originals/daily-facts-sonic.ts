/**
 * Facts for the Daily Shuffle's Sonic puzzle (Sonic days, from Saturday Nov 21,
 * 2026), keyed by the names players type. Researched Nov 9, 2026 from each
 * character's infobox on the Sonic Wiki (sonic.fandom.com: species, first
 * appearance, affiliation), the Sonic Wiki's Sonic Racing: CrossWorlds roster
 * (Template:SRCWchars) checked against Wikipedia's Sonic Racing: CrossWorlds
 * article, and Wikipedia for release years. Clues are written from these facts
 * only and never name the character. Names only on GameShuffle, never art
 * (Sega's characters): the puzzle shows a letter tile where other puzzles show
 * a picture.
 *
 * The ORDER of this object is the roster and feeds the answer shuffle: never
 * reorder, insert or remove an entry (it would change past answers). A new
 * character joins through a new puzzle version in a new rotation era.
 *
 *   species      the wiki's species, shortened where it's long ("AI" for
 *                Artificial intelligence). Chaos is a mutant Chao, Fang a
 *                jerboa, Bean a woodpecker, Chip's is Unknown, all as the wiki
 *                has them.
 *   team         the group the wiki names as their affiliation, if it's one of
 *                Team Sonic, Team Rose, Team Dark, Team Chaotix, Babylon Rogues,
 *                Deadly Six or the Eggman Empire (shown as "Eggman's side");
 *                else No team. Former members count as No team (E-102 Gamma,
 *                Emerl), with one edge call: Infinite stays on Eggman's side,
 *                where he served until his end in Sonic Forces. Mighty and Ray
 *                have no team; Fang, Bean and Bark's "Fang's Gang" is a comics
 *                group, so No team too.
 *   debutYear    the year of their first appearance (the wiki's "first"),
 *                using the usual answer where the first one is a cameo or a
 *                side piece: Sonic 1990 (the Rad Mobile cameo, as the Smash
 *                facts have it), Dr. Eggman 1991 (Sonic the Hedgehog; the wiki
 *                lists the Puzzle Construction test cart), Infinite 2017, Sage
 *                2022 and Trip 2023 (each game, not the prologue short or comic
 *                released weeks before it).
 *   firstGame    that first appearance by name (Rad Mobile for Sonic). Shown
 *                as the late hint and used by break mode, not a Daily column.
 *   crossWorlds  playable in Sonic Racing: CrossWorlds (Nov 9, 2026). Cream
 *                races with Cheese, who isn't on this roster. Forms (Super
 *                Sonic, Werehog, Super Shadow, Classic Sonic) and racers who
 *                debuted in comics or TV (Tangle, Whisper, Nine, Rusty Rose)
 *                aren't on this roster. A racer added later can change a value
 *                here: only the roster order is fixed, not the facts.
 */

export interface SonicFacts {
  species: string;
  team: "Team Sonic" | "Team Rose" | "Team Dark" | "Team Chaotix" | "Babylon Rogues" | "Deadly Six" | "Eggman's side" | "No team";
  debutYear: number;
  firstGame: string;
  crossWorlds: boolean;
  clue: string;
}

export const SONIC_FACTS: Record<string, SonicFacts> = {
  "Sonic": { species: "Hedgehog", team: "Team Sonic", debutYear: 1990, firstGame: "Rad Mobile", crossWorlds: true, clue: "Runs at the speed of sound, but can't swim." },
  "Tails": { species: "Fox", team: "Team Sonic", debutYear: 1992, firstGame: "Sonic the Hedgehog 2", crossWorlds: true, clue: "A young mechanical genius who builds and flies his own planes." },
  "Knuckles": { species: "Echidna", team: "Team Sonic", debutYear: 1994, firstGame: "Sonic the Hedgehog 3", crossWorlds: true, clue: "Guards the Master Emerald on Angel Island, and was once tricked into fighting the hero." },
  "Amy": { species: "Hedgehog", team: "Team Rose", debutYear: 1993, firstGame: "Sonic CD", crossWorlds: true, clue: "Swings a Piko Piko Hammer and calls herself the hero's girlfriend." },
  "Dr. Eggman": { species: "Human", team: "Eggman's side", debutYear: 1991, firstGame: "Sonic the Hedgehog (1991)", crossWorlds: true, clue: "A scientist with an IQ of 300 who wants to rule the world." },
  "Metal Sonic": { species: "Robot", team: "Eggman's side", debutYear: 1993, firstGame: "Sonic CD", crossWorlds: true, clue: "A robot copy built to beat the hero, first seen racing him across Stardust Speedway." },
  "Shadow": { species: "Hedgehog", team: "Team Dark", debutYear: 2001, firstGame: "Sonic Adventure 2", crossWorlds: true, clue: "Created aboard the space colony ARK as the Ultimate Life Form." },
  "Rouge": { species: "Bat", team: "Team Dark", debutYear: 2001, firstGame: "Sonic Adventure 2", crossWorlds: true, clue: "A jewel thief who also works as a government spy." },
  "Cream": { species: "Rabbit", team: "Team Rose", debutYear: 2002, firstGame: "Sonic Advance 2", crossWorlds: true, clue: "Flies by flapping her big ears, with her Chao friend Cheese at her side." },
  "Big": { species: "Cat", team: "Team Rose", debutYear: 1998, firstGame: "Sonic Adventure", crossWorlds: true, clue: "A laid-back fisherman whose best friend is a frog named Froggy." },
  "E-102 Gamma": { species: "Robot", team: "No team", debutYear: 1998, firstGame: "Sonic Adventure", crossWorlds: false, clue: "One of the E-100 Series, who turned against the doctor who built him." },
  "E-123 Omega": { species: "Robot", team: "Team Dark", debutYear: 2003, firstGame: "Sonic Heroes", crossWorlds: true, clue: "The last of the E-Series, woken up inside a sealed base and out for revenge on his maker." },
  "Chaos": { species: "Chao", team: "No team", debutYear: 1998, firstGame: "Sonic Adventure", crossWorlds: false, clue: "A god of destruction made of water, set free from the Master Emerald." },
  "Tikal": { species: "Echidna", team: "No team", debutYear: 1998, firstGame: "Sonic Adventure", crossWorlds: false, clue: "The daughter of an ancient tribal chief, who sealed herself away inside the Master Emerald." },
  "Vector": { species: "Crocodile", team: "Team Chaotix", debutYear: 1995, firstGame: "Knuckles' Chaotix", crossWorlds: true, clue: "Runs a detective agency and always has his headphones on." },
  "Espio": { species: "Chameleon", team: "Team Chaotix", debutYear: 1995, firstGame: "Knuckles' Chaotix", crossWorlds: true, clue: "A ninja who can turn invisible." },
  "Charmy": { species: "Bee", team: "Team Chaotix", debutYear: 1995, firstGame: "Knuckles' Chaotix", crossWorlds: true, clue: "A six-year-old with a stinger, a flight helmet and a lot of energy." },
  "Mighty": { species: "Armadillo", team: "No team", debutYear: 1993, firstGame: "SegaSonic the Hedgehog", crossWorlds: false, clue: "Has a hard red shell and is strong enough to break through rock." },
  "Ray": { species: "Flying squirrel", team: "No team", debutYear: 1993, firstGame: "SegaSonic the Hedgehog", crossWorlds: false, clue: "Glides through the air, and first appeared beside an armadillo friend in an arcade game." },
  "Silver": { species: "Hedgehog", team: "No team", debutYear: 2006, firstGame: "Sonic the Hedgehog (2006)", crossWorlds: true, clue: "Came back from 200 years in the future, and moves things with his mind." },
  "Blaze": { species: "Cat", team: "No team", debutYear: 2005, firstGame: "Sonic Rush", crossWorlds: true, clue: "A princess from another dimension who guards the Sol Emeralds and controls fire." },
  "Jet": { species: "Hawk", team: "Babylon Rogues", debutYear: 2006, firstGame: "Sonic Riders", crossWorlds: true, clue: "Leads a gang of sky thieves and races on Extreme Gear." },
  "Wave": { species: "Swallow", team: "Babylon Rogues", debutYear: 2006, firstGame: "Sonic Riders", crossWorlds: true, clue: "The mechanic who builds and tunes her gang's Extreme Gear." },
  "Storm": { species: "Albatross", team: "Babylon Rogues", debutYear: 2006, firstGame: "Sonic Riders", crossWorlds: true, clue: "The big, strong muscle of a gang of sky thieves." },
  "Marine": { species: "Raccoon", team: "No team", debutYear: 2007, firstGame: "Sonic Rush Adventure", crossWorlds: false, clue: "A young sailor from Southern Island who dreams of captaining her own ship." },
  "Orbot": { species: "Robot", team: "Eggman's side", debutYear: 2010, firstGame: "Sonic Colors", crossWorlds: false, clue: "A sarcastic red robot assistant, the smarter half of a pair." },
  "Cubot": { species: "Robot", team: "Eggman's side", debutYear: 2010, firstGame: "Sonic Colors", crossWorlds: false, clue: "A yellow, cube-shaped robot assistant whose voice chip keeps going wrong." },
  "Zavok": { species: "Zeti", team: "Deadly Six", debutYear: 2013, firstGame: "Sonic Lost World", crossWorlds: true, clue: "The strongest of six villains from the Lost Hex, and their leader." },
  "Zazz": { species: "Zeti", team: "Deadly Six", debutYear: 2013, firstGame: "Sonic Lost World", crossWorlds: true, clue: "The loudest and most hot-headed of six villains from the Lost Hex." },
  "Infinite": { species: "Jackal", team: "Eggman's side", debutYear: 2017, firstGame: "Sonic Forces", crossWorlds: false, clue: "A masked mercenary who uses the Phantom Ruby to create illusions." },
  "Sage": { species: "AI", team: "Eggman's side", debutYear: 2022, firstGame: "Sonic Frontiers", crossWorlds: true, clue: "An artificial intelligence who comes to see the doctor who made her as her father." },
  "Fang": { species: "Jerboa", team: "No team", debutYear: 1994, firstGame: "Sonic Triple Trouble", crossWorlds: false, clue: "A treasure-hunting sniper who rides a hover bike and carries a popgun." },
  "Bean": { species: "Woodpecker", team: "No team", debutYear: 1996, firstGame: "Sonic the Fighters", crossWorlds: false, clue: "Can't stop throwing bombs, and first fought in an arcade fighting game." },
  "Bark": { species: "Polar bear", team: "No team", debutYear: 1996, firstGame: "Sonic the Fighters", crossWorlds: false, clue: "A strong, silent brawler who first fought in an arcade fighting game." },
  "Chip": { species: "Unknown", team: "No team", debutYear: 2008, firstGame: "Sonic Unleashed", crossWorlds: false, clue: "Lost his memory, loves chocolate, and helps the hero piece the planet back together." },
  "Elise": { species: "Human", team: "No team", debutYear: 2006, firstGame: "Sonic the Hedgehog (2006)", crossWorlds: false, clue: "The princess of Soleanna, who must never cry." },
  "Shade": { species: "Echidna", team: "No team", debutYear: 2008, firstGame: "Sonic Chronicles: The Dark Brotherhood", crossWorlds: false, clue: "A warrior from a clan trapped in another dimension for thousands of years." },
  "Emerl": { species: "Robot", team: "No team", debutYear: 2003, firstGame: "Sonic Battle", crossWorlds: false, clue: "An ancient robot that copies every move it sees." },
  "Maria": { species: "Human", team: "No team", debutYear: 2001, firstGame: "Sonic Adventure 2", crossWorlds: false, clue: "A girl from the space colony ARK whose last wish still drives her closest friend." },
  "Gerald": { species: "Human", team: "No team", debutYear: 2001, firstGame: "Sonic Adventure 2", crossWorlds: false, clue: "The doctor's genius grandfather, who created the Ultimate Life Form." },
  "Black Doom": { species: "Black Arms", team: "No team", debutYear: 2005, firstGame: "Shadow the Hedgehog", crossWorlds: false, clue: "Leads an alien race whose comet comes back to Earth every 50 years." },
  "Mephiles": { species: "Deity", team: "No team", debutYear: 2006, firstGame: "Sonic the Hedgehog (2006)", crossWorlds: false, clue: "A dark half of a sun god, who borrows another hedgehog's shape." },
  "Eggman Nega": { species: "Human", team: "No team", debutYear: 2005, firstGame: "Sonic Rush", crossWorlds: false, clue: "A villain who looks a lot like the doctor and claims to be his descendant." },
  "Tails Doll": { species: "Robot", team: "Eggman's side", debutYear: 1997, firstGame: "Sonic R", crossWorlds: false, clue: "A floating, puppet-like copy of a famous fox, with a red gem on its antenna." },
  "Trip": { species: "Sungazer", team: "No team", debutYear: 2023, firstGame: "Sonic Superstars", crossWorlds: false, clue: "A girl from the Northstar Islands who hides inside a suit of armor." },
  "Vanilla": { species: "Rabbit", team: "No team", debutYear: 2002, firstGame: "Sonic Advance 2", crossWorlds: false, clue: "The gentle mother of a girl who flies with her ears." },
  "Shahra": { species: "Djinn", team: "No team", debutYear: 2007, firstGame: "Sonic and the Secret Rings", crossWorlds: false, clue: "The genie of a ring, from the world of the Arabian Nights." },
};

/** Species that count as close: birds, reptiles, canines, rodents, and robots with the AI. */
export const SONIC_SPECIES_GROUPS: string[][] = [
  ["Hawk", "Swallow", "Albatross", "Woodpecker"],
  ["Crocodile", "Chameleon", "Sungazer"],
  ["Fox", "Jackal"],
  ["Flying squirrel", "Jerboa"],
  ["Robot", "AI"],
];

/** How the late hint names a first game when the title alone would read oddly. */
export const SONIC_FIRST_SAY: Record<string, string> = {
  "Rad Mobile": "Rad Mobile, a Sega arcade racing game, hanging from the rearview mirror",
};
