/**
 * Facts for the Smash Ultimate Daily Shuffle, one entry per fighter, keyed by
 * the roster name in src/data/smash/ultimate.ts. Researched Oct 5, 2026 from
 * SmashWiki (fighter pages, the Ultimate weight table incl. Mewtwo's 3.0.0
 * change) with franchise wikis and Wikipedia; sources kept in the research
 * notes, not shipped. Clues are written from these facts and never name the fighter.
 *
 *   series      the Smash universe (as the roster groups it)
 *   debutGame   the character's earliest in-game appearance (Luigi: Mario Bros.
 *               Game & Watch; Mr. Game & Watch: Ball; Sonic: Rad Mobile 1990;
 *               Lucario: Mystery Dungeon 2005; Banjo & Kazooie: Diddy Kong Racing)
 *   firstSmash  first Smash game where they're playable (64, Melee, Brawl,
 *               Smash 4 incl. DLC, Ultimate incl. DLC)
 *   weight      Ultimate weight (Pokémon Trainer: Charizard; Pyra/Mythra: Pyra;
 *               Miis by class). Classes: Light up to 90, Heavy from 102.
 *   thirdParty  franchise not owned by Nintendo (Bayonetta counts: Sega holds the copyright)
 */

export interface SmashFacts {
  series: string;
  debutGame: string;
  debutYear: number;
  firstSmash: "64" | "Melee" | "Brawl" | "Smash 4" | "Ultimate";
  weight: number;
  thirdParty: boolean;
  clue: string | null;
}

export const SMASH_FACTS: Record<string, SmashFacts> = {
  "Mario": { series: "Super Mario", debutGame: "Donkey Kong", debutYear: 1981, firstSmash: "64", weight: 98, thirdParty: false, clue: "Debuted in Donkey Kong, an arcade classic from way back in 1981." },
  "Luigi": { series: "Super Mario", debutGame: "Mario Bros. (Game & Watch)", debutYear: 1983, firstSmash: "64", weight: 97, thirdParty: false, clue: "Debuted in Mario Bros. (Game & Watch), a pocket-sized start in 1983." },
  "Peach": { series: "Super Mario", debutGame: "Super Mario Bros.", debutYear: 1985, firstSmash: "Melee", weight: 89, thirdParty: false, clue: "Debuted in Super Mario Bros., the big 1985 hit." },
  "Bowser": { series: "Super Mario", debutGame: "Super Mario Bros.", debutYear: 1985, firstSmash: "Melee", weight: 135, thirdParty: false, clue: "Debuted in Super Mario Bros., arriving on the scene in 1985." },
  "Dr. Mario": { series: "Super Mario", debutGame: "Dr. Mario", debutYear: 1990, firstSmash: "Melee", weight: 98, thirdParty: false, clue: "Debuted in a self-titled game in 1990, then joined the fight in Melee." },
  "Rosalina & Luma": { series: "Super Mario", debutGame: "Super Mario Galaxy", debutYear: 2007, firstSmash: "Smash 4", weight: 82, thirdParty: false, clue: "Debuted in Super Mario Galaxy, reaching for the stars in 2007." },
  "Bowser Jr.": { series: "Super Mario", debutGame: "Super Mario Sunshine", debutYear: 2002, firstSmash: "Smash 4", weight: 108, thirdParty: false, clue: "Debuted in Super Mario Sunshine, a sunny 2002 adventure." },
  "Yoshi": { series: "Yoshi", debutGame: "Super Mario World", debutYear: 1990, firstSmash: "64", weight: 104, thirdParty: false, clue: "Debuted in Super Mario World back in 1990." },
  "Donkey Kong": { series: "Donkey Kong", debutGame: "Donkey Kong", debutYear: 1981, firstSmash: "64", weight: 127, thirdParty: false, clue: "Debuted in a self-titled game back in 1981." },
  "Diddy Kong": { series: "Donkey Kong", debutGame: "Donkey Kong Country", debutYear: 1994, firstSmash: "Brawl", weight: 90, thirdParty: false, clue: "Debuted in Donkey Kong Country, a 1994 jungle romp." },
  "Link": { series: "The Legend of Zelda", debutGame: "The Legend of Zelda", debutYear: 1986, firstSmash: "64", weight: 104, thirdParty: false, clue: "Debuted in The Legend of Zelda, starting a legendary journey in 1986." },
  "Zelda": { series: "The Legend of Zelda", debutGame: "The Legend of Zelda", debutYear: 1986, firstSmash: "Melee", weight: 85, thirdParty: false, clue: "Debuted in a self-titled game in 1986, with the title saying it all." },
  "Sheik": { series: "The Legend of Zelda", debutGame: "The Legend of Zelda: Ocarina of Time", debutYear: 1998, firstSmash: "Melee", weight: 78, thirdParty: false, clue: "Debuted in The Legend of Zelda: Ocarina of Time, a 1998 classic." },
  "Ganondorf": { series: "The Legend of Zelda", debutGame: "The Legend of Zelda: Ocarina of Time", debutYear: 1998, firstSmash: "Melee", weight: 118, thirdParty: false, clue: "Debuted in The Legend of Zelda: Ocarina of Time in 1998." },
  "Young Link": { series: "The Legend of Zelda", debutGame: "The Legend of Zelda: Ocarina of Time", debutYear: 1998, firstSmash: "Melee", weight: 88, thirdParty: false, clue: "Debuted in The Legend of Zelda: Ocarina of Time, then joined Melee." },
  "Toon Link": { series: "The Legend of Zelda", debutGame: "The Legend of Zelda: The Wind Waker", debutYear: 2002, firstSmash: "Brawl", weight: 91, thirdParty: false, clue: "Debuted in The Legend of Zelda: The Wind Waker, sailing in during 2002." },
  "Samus": { series: "Metroid", debutGame: "Metroid", debutYear: 1986, firstSmash: "64", weight: 108, thirdParty: false, clue: "Debuted in Metroid back in 1986." },
  "Zero Suit Samus": { series: "Metroid", debutGame: "Metroid", debutYear: 1986, firstSmash: "Brawl", weight: 80, thirdParty: false, clue: "Debuted in Metroid back in 1986, but only became playable in Brawl." },
  "Kirby": { series: "Kirby", debutGame: "Kirby's Dream Land", debutYear: 1992, firstSmash: "64", weight: 79, thirdParty: false, clue: "Debuted in a self-titled game in 1992, a dreamy little start." },
  "Meta Knight": { series: "Kirby", debutGame: "Kirby's Adventure", debutYear: 1993, firstSmash: "Brawl", weight: 80, thirdParty: false, clue: "Debuted in Kirby's Adventure, swooping in during 1993." },
  "King Dedede": { series: "Kirby", debutGame: "Kirby's Dream Land", debutYear: 1992, firstSmash: "Brawl", weight: 127, thirdParty: false, clue: "Debuted in Kirby's Dream Land and waited until Brawl to throw down." },
  "Fox": { series: "Star Fox", debutGame: "Star Fox", debutYear: 1993, firstSmash: "64", weight: 77, thirdParty: false, clue: "Debuted in a self-titled game in 1993, flying high from the start." },
  "Falco": { series: "Star Fox", debutGame: "Star Fox", debutYear: 1993, firstSmash: "Melee", weight: 82, thirdParty: false, clue: "Debuted in Star Fox, joining the flight back in 1993." },
  "Wolf": { series: "Star Fox", debutGame: "Star Fox 64", debutYear: 1997, firstSmash: "Brawl", weight: 92, thirdParty: false, clue: "Debuted in Star Fox 64 back in 1997." },
  "Pikachu": { series: "Pokémon", debutGame: "Pokémon Red and Green", debutYear: 1996, firstSmash: "64", weight: 79, thirdParty: false, clue: "Debuted in Pokémon Red and Green and was playable in the very first Smash." },
  "Jigglypuff": { series: "Pokémon", debutGame: "Pokémon Red and Green", debutYear: 1996, firstSmash: "64", weight: 68, thirdParty: false, clue: "Debuted in Pokémon Red and Green, then floated into the original Smash." },
  "Mewtwo": { series: "Pokémon", debutGame: "Pokémon Red and Green", debutYear: 1996, firstSmash: "Melee", weight: 79, thirdParty: false, clue: "Debuted in Pokémon Red and Green, then waited for Melee to join the fight." },
  "Pichu": { series: "Pokémon", debutGame: "Pokémon Gold and Silver", debutYear: 1999, firstSmash: "Melee", weight: 62, thirdParty: false, clue: "Debuted in Pokémon Gold and Silver, a tiny 1999 newcomer." },
  "Pokémon Trainer": { series: "Pokémon", debutGame: "Pokémon Red and Green", debutYear: 1996, firstSmash: "Brawl", weight: 116, thirdParty: false, clue: "Debuted in Red and Green back in 1996." },
  "Lucario": { series: "Pokémon", debutGame: "Pokémon Mystery Dungeon: Blue Rescue Team and Red Rescue Team", debutYear: 2005, firstSmash: "Brawl", weight: 92, thirdParty: false, clue: "Debuted in Pokémon Mystery Dungeon: Blue Rescue Team and Red Rescue Team." },
  "Greninja": { series: "Pokémon", debutGame: "Pokémon X and Y", debutYear: 2013, firstSmash: "Smash 4", weight: 88, thirdParty: false, clue: "Debuted in Pokémon X and Y, leaping in during 2013." },
  "Captain Falcon": { series: "F-Zero", debutGame: "F-Zero", debutYear: 1990, firstSmash: "64", weight: 104, thirdParty: false, clue: "Debuted in F-Zero, racing onto the scene in 1990." },
  "Ness": { series: "EarthBound", debutGame: "EarthBound (Mother 2)", debutYear: 1994, firstSmash: "64", weight: 94, thirdParty: false, clue: "Debuted in EarthBound (Mother 2) in 1994." },
  "Lucas": { series: "EarthBound", debutGame: "Mother 3", debutYear: 2006, firstSmash: "Brawl", weight: 94, thirdParty: false, clue: "Debuted in Mother 3, a 2006 adventure." },
  "Ice Climbers": { series: "Ice Climber", debutGame: "Ice Climber", debutYear: 1985, firstSmash: "Melee", weight: 92, thirdParty: false, clue: "Debuted in a self-titled game in 1985, scaling new heights." },
  "Marth": { series: "Fire Emblem", debutGame: "Fire Emblem: Shadow Dragon and the Blade of Light", debutYear: 1990, firstSmash: "Melee", weight: 90, thirdParty: false, clue: "Debuted in Fire Emblem: Shadow Dragon and the Blade of Light in 1990." },
  "Roy": { series: "Fire Emblem", debutGame: "Super Smash Bros. Melee", debutYear: 2001, firstSmash: "Melee", weight: 95, thirdParty: false, clue: "Debuted in Super Smash Bros. Melee, the same game that made this fighter playable." },
  "Ike": { series: "Fire Emblem", debutGame: "Fire Emblem: Path of Radiance", debutYear: 2005, firstSmash: "Brawl", weight: 107, thirdParty: false, clue: "Debuted in Fire Emblem: Path of Radiance, marching in during 2005." },
  "Robin": { series: "Fire Emblem", debutGame: "Fire Emblem Awakening", debutYear: 2012, firstSmash: "Smash 4", weight: 95, thirdParty: false, clue: "Debuted in Fire Emblem Awakening, a 2012 tactical tale." },
  "Lucina": { series: "Fire Emblem", debutGame: "Fire Emblem Awakening", debutYear: 2012, firstSmash: "Smash 4", weight: 90, thirdParty: false, clue: "Debuted in Fire Emblem Awakening, stepping up in 2012." },
  "Corrin": { series: "Fire Emblem", debutGame: "Fire Emblem Fates", debutYear: 2015, firstSmash: "Smash 4", weight: 98, thirdParty: false, clue: "Debuted in Fire Emblem Fates in 2015." },
  "Mr. Game & Watch": { series: "Game & Watch", debutGame: "Ball (Game & Watch)", debutYear: 1980, firstSmash: "Melee", weight: 75, thirdParty: false, clue: "Debuted in a game simply called Ball, all the way back in 1980." },
  "Pit": { series: "Kid Icarus", debutGame: "Kid Icarus", debutYear: 1986, firstSmash: "Brawl", weight: 96, thirdParty: false, clue: "Debuted in Kid Icarus, taking flight in 1986." },
  "Palutena": { series: "Kid Icarus", debutGame: "Kid Icarus", debutYear: 1986, firstSmash: "Smash 4", weight: 91, thirdParty: false, clue: "Debuted in Kid Icarus in 1986, but joined the fight much later." },
  "Dark Pit": { series: "Kid Icarus", debutGame: "Kid Icarus: Uprising", debutYear: 2012, firstSmash: "Smash 4", weight: 96, thirdParty: false, clue: "Debuted in Kid Icarus: Uprising, rising up in 2012." },
  "Wario": { series: "Wario", debutGame: "Super Mario Land 2: 6 Golden Coins", debutYear: 1992, firstSmash: "Brawl", weight: 107, thirdParty: false, clue: "Debuted in Super Mario Land 2: 6 Golden Coins in 1992." },
  "Olimar": { series: "Pikmin", debutGame: "Pikmin", debutYear: 2001, firstSmash: "Brawl", weight: 79, thirdParty: false, clue: "Debuted in Pikmin, landing in 2001." },
  "R.O.B.": { series: "R.O.B.", debutGame: "Stack-Up (as the NES / Famicom Robot peripheral)", debutYear: 1985, firstSmash: "Brawl", weight: 106, thirdParty: false, clue: "Debuted in Stack-Up back in 1985." },
  "Villager": { series: "Animal Crossing", debutGame: "Animal Crossing (Dōbutsu no Mori, N64)", debutYear: 2001, firstSmash: "Smash 4", weight: 92, thirdParty: false, clue: "Debuted in Animal Crossing (Dōbutsu no Mori, N64), moving in during 2001." },
  "Wii Fit Trainer": { series: "Wii Fit", debutGame: "Wii Fit", debutYear: 2007, firstSmash: "Smash 4", weight: 96, thirdParty: false, clue: "Debuted in a self-titled game in 2007, keeping everyone in shape." },
  "Little Mac": { series: "Punch-Out!!", debutGame: "Punch-Out!! (arcade)", debutYear: 1984, firstSmash: "Smash 4", weight: 87, thirdParty: false, clue: "Debuted in the 1984 arcade version of Punch-Out, stepping into the ring." },
  "Shulk": { series: "Xenoblade Chronicles", debutGame: "Xenoblade Chronicles", debutYear: 2010, firstSmash: "Smash 4", weight: 97, thirdParty: false, clue: "Debuted in Xenoblade Chronicles, a 2010 epic." },
  "Duck Hunt": { series: "Duck Hunt", debutGame: "Duck Hunt", debutYear: 1984, firstSmash: "Smash 4", weight: 86, thirdParty: false, clue: "Debuted in a self-titled game in 1984, and the title says it all." },
  "Snake": { series: "Metal Gear", debutGame: "Metal Gear", debutYear: 1987, firstSmash: "Brawl", weight: 106, thirdParty: true, clue: "Debuted in Metal Gear, sneaking in back in 1987." },
  "Sonic": { series: "Sonic", debutGame: "Rad Mobile", debutYear: 1990, firstSmash: "Brawl", weight: 86, thirdParty: true, clue: "Debuted in Rad Mobile in 1990, a surprising first appearance." },
  "Mega Man": { series: "Mega Man", debutGame: "Mega Man", debutYear: 1987, firstSmash: "Smash 4", weight: 102, thirdParty: true, clue: "Debuted in a self-titled game back in 1987." },
  "Pac-Man": { series: "Pac-Man", debutGame: "Pac-Man", debutYear: 1980, firstSmash: "Smash 4", weight: 95, thirdParty: true, clue: "Debuted in a self-titled game back in 1980." },
  "Ryu": { series: "Street Fighter", debutGame: "Street Fighter", debutYear: 1987, firstSmash: "Smash 4", weight: 103, thirdParty: true, clue: "Debuted in Street Fighter, throwing hands since 1987." },
  "Cloud": { series: "Final Fantasy", debutGame: "Final Fantasy VII", debutYear: 1997, firstSmash: "Smash 4", weight: 100, thirdParty: true, clue: "Debuted in Final Fantasy VII, a 1997 classic." },
  "Bayonetta": { series: "Bayonetta", debutGame: "Bayonetta", debutYear: 2009, firstSmash: "Smash 4", weight: 81, thirdParty: true, clue: "Debuted in a self-titled game in 2009, starring from the very start." },
  "Mii Brawler": { series: "Super Smash Bros.", debutGame: "Mii Channel (Wii)", debutYear: 2006, firstSmash: "Smash 4", weight: 94, thirdParty: false, clue: "Debuted on a 2006 Wii channel that shares part of this fighter's name." },
  "Mii Swordfighter": { series: "Super Smash Bros.", debutGame: "Mii Channel (Wii)", debutYear: 2006, firstSmash: "Smash 4", weight: 100, thirdParty: false, clue: "Debuted in 2006 on a Wii channel named after this fighter's kind." },
  "Mii Gunner": { series: "Super Smash Bros.", debutGame: "Mii Channel (Wii)", debutYear: 2006, firstSmash: "Smash 4", weight: 104, thirdParty: false, clue: "Debuted on a Wii channel in 2006, one whose name this fighter partly shares." },
  "Daisy": { series: "Super Mario", debutGame: "Super Mario Land", debutYear: 1989, firstSmash: "Ultimate", weight: 89, thirdParty: false, clue: "Debuted in Super Mario Land, blooming in 1989." },
  "Piranha Plant": { series: "Super Mario", debutGame: "Super Mario Bros.", debutYear: 1985, firstSmash: "Ultimate", weight: 112, thirdParty: false, clue: "Debuted in Super Mario Bros. but waited until Ultimate to join the fight." },
  "King K. Rool": { series: "Donkey Kong", debutGame: "Donkey Kong Country", debutYear: 1994, firstSmash: "Ultimate", weight: 133, thirdParty: false, clue: "Debuted in Donkey Kong Country and waited until Ultimate to step in." },
  "Ridley": { series: "Metroid", debutGame: "Metroid", debutYear: 1986, firstSmash: "Ultimate", weight: 107, thirdParty: false, clue: "Debuted in Metroid in 1986, then waited ages to become playable in Ultimate." },
  "Dark Samus": { series: "Metroid", debutGame: "Metroid Prime", debutYear: 2002, firstSmash: "Ultimate", weight: 108, thirdParty: false, clue: "Debuted in Metroid Prime, emerging in 2002." },
  "Incineroar": { series: "Pokémon", debutGame: "Pokémon Sun and Moon", debutYear: 2016, firstSmash: "Ultimate", weight: 116, thirdParty: false, clue: "Debuted in Pokémon Sun and Moon, heating things up in 2016." },
  "Chrom": { series: "Fire Emblem", debutGame: "Fire Emblem Awakening", debutYear: 2012, firstSmash: "Ultimate", weight: 95, thirdParty: false, clue: "Debuted in Fire Emblem Awakening, but only became playable in Ultimate." },
  "Byleth": { series: "Fire Emblem", debutGame: "Fire Emblem: Three Houses", debutYear: 2019, firstSmash: "Ultimate", weight: 97, thirdParty: false, clue: "Debuted in Fire Emblem: Three Houses in 2019." },
  "Isabelle": { series: "Animal Crossing", debutGame: "Animal Crossing: New Leaf", debutYear: 2012, firstSmash: "Ultimate", weight: 88, thirdParty: false, clue: "Debuted in Animal Crossing: New Leaf, turning over a new leaf in 2012." },
  "Pyra / Mythra": { series: "Xenoblade Chronicles", debutGame: "Xenoblade Chronicles 2", debutYear: 2017, firstSmash: "Ultimate", weight: 98, thirdParty: false, clue: "Debuted in Xenoblade Chronicles 2, a 2017 sequel." },
  "Inkling": { series: "Splatoon", debutGame: "Splatoon", debutYear: 2015, firstSmash: "Ultimate", weight: 94, thirdParty: false, clue: "Debuted in Splatoon, making a splash in 2015." },
  "Min Min": { series: "ARMS", debutGame: "ARMS", debutYear: 2017, firstSmash: "Ultimate", weight: 104, thirdParty: false, clue: "Debuted in ARMS, reaching out in 2017." },
  "Ken": { series: "Street Fighter", debutGame: "Street Fighter", debutYear: 1987, firstSmash: "Ultimate", weight: 103, thirdParty: true, clue: "Debuted in Street Fighter in 1987, but only joined the brawl in Ultimate." },
  "Sephiroth": { series: "Final Fantasy", debutGame: "Final Fantasy VII", debutYear: 1997, firstSmash: "Ultimate", weight: 79, thirdParty: true, clue: "Debuted in Final Fantasy VII, then crashed the party in Ultimate." },
  "Simon": { series: "Castlevania", debutGame: "Castlevania", debutYear: 1986, firstSmash: "Ultimate", weight: 107, thirdParty: true, clue: "Debuted in Castlevania, venturing forth in 1986." },
  "Richter": { series: "Castlevania", debutGame: "Castlevania: Rondo of Blood", debutYear: 1993, firstSmash: "Ultimate", weight: 107, thirdParty: true, clue: "Debuted in Castlevania: Rondo of Blood, a 1993 adventure." },
  "Joker": { series: "Persona", debutGame: "Persona 5", debutYear: 2016, firstSmash: "Ultimate", weight: 93, thirdParty: true, clue: "Debuted in Persona 5, stealing the show in 2016." },
  "Hero": { series: "Dragon Quest", debutGame: "Dragon Quest", debutYear: 1986, firstSmash: "Ultimate", weight: 101, thirdParty: true, clue: "Debuted in Dragon Quest, setting out on a quest in 1986." },
  "Banjo & Kazooie": { series: "Banjo-Kazooie", debutGame: "Diddy Kong Racing", debutYear: 1997, firstSmash: "Ultimate", weight: 106, thirdParty: true, clue: "Debuted in Diddy Kong Racing back in 1997." },
  "Terry": { series: "Fatal Fury", debutGame: "Fatal Fury: King of Fighters", debutYear: 1991, firstSmash: "Ultimate", weight: 108, thirdParty: true, clue: "Debuted in Fatal Fury: King of Fighters, a 1991 brawler." },
  "Steve": { series: "Minecraft", debutGame: "Minecraft", debutYear: 2009, firstSmash: "Ultimate", weight: 92, thirdParty: true, clue: "Debuted in Minecraft, building a legacy since 2009." },
  "Kazuya": { series: "Tekken", debutGame: "Tekken", debutYear: 1994, firstSmash: "Ultimate", weight: 113, thirdParty: true, clue: "Debuted in Tekken, a 1994 fighting game." },
  "Sora": { series: "Kingdom Hearts", debutGame: "Kingdom Hearts", debutYear: 2002, firstSmash: "Ultimate", weight: 85, thirdParty: true, clue: "Debuted in Kingdom Hearts, unlocking adventure in 2002." },
};

export function smashWeightClass(weight: number): "Light" | "Medium" | "Heavy" {
  return weight <= 90 ? "Light" : weight >= 102 ? "Heavy" : "Medium";
}
