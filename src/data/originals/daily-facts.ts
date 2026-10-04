/**
 * Facts for the Daily Shuffle, one entry per character across the three
 * rotations (MK8DX, MK World, Mario Party). Every value was checked against a
 * wiki page (Super Mario Wiki for most; the franchise wiki for guests) before
 * it went in; sources are kept in the research notes, not shipped. Clues are
 * written from these facts and never name the character. Researched Oct 4, 2026
 * (Super Mario Wiki); Doki Doki Panic debuts (1987) count as Super Mario, and
 * Mario Kart debuts are the year the character first became playable (Tour and
 * DLC additions included).
 *
 *   species       a short, guessable category (Human, Koopa, Toad, ...)
 *   series        the franchise of the character's first game
 *   debutYear     first appearance in any game (original release year)
 *   kartDebutYear first Mario Kart game where they're playable (null = never)
 *   partyDebutYear first Mario Party where they're playable (null = never)
 */

export interface CharacterFacts {
  species: string;
  series: string;
  debutYear: number;
  debutGame: string;
  kartDebutYear: number | null;
  partyDebutYear: number | null;
  clue: string | null;
}

export const DAILY_FACTS: Record<string, CharacterFacts> = {
  "Mario": { species: "Human", series: "Donkey Kong", debutYear: 1981, debutGame: "Donkey Kong", kartDebutYear: 1992, partyDebutYear: 1998, clue: "Debuted in Donkey Kong and has been racing since the very first kart game." },
  "Luigi": { species: "Human", series: "Super Mario", debutYear: 1983, debutGame: "Mario Bros. (Game & Watch)", kartDebutYear: 1992, partyDebutYear: 1998, clue: "First showed up in the Game & Watch version of Mario Bros." },
  "Peach": { species: "Human", series: "Super Mario", debutYear: 1985, debutGame: "Super Mario Bros.", kartDebutYear: 1992, partyDebutYear: 1998, clue: "Debuted in Super Mario Bros. and raced from day one in Super Mario Kart." },
  "Daisy": { species: "Human", series: "Super Mario", debutYear: 1989, debutGame: "Super Mario Land", kartDebutYear: 2003, partyDebutYear: 2000, clue: "Debuted in Super Mario Land, then joined the fun in Mario Party 3." },
  "Rosalina": { species: "Human", series: "Super Mario", debutYear: 2007, debutGame: "Super Mario Galaxy", kartDebutYear: 2008, partyDebutYear: 2015, clue: "Debuted in Super Mario Galaxy and first raced in Mario Kart Wii." },
  "Tanooki Mario": { species: "Human", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2014, partyDebutYear: null, clue: "Debuted in the third Bros. platformer, then hit the kart track in the eighth." },
  "Cat Peach": { species: "Human", series: "Super Mario", debutYear: 2013, debutGame: "Super Mario 3D World", kartDebutYear: 2014, partyDebutYear: null, clue: "Debuted in Super Mario 3D World and first raced in Mario Kart 8." },
  "Yoshi": { species: "Yoshi", series: "Super Mario", debutYear: 1990, debutGame: "Super Mario World", kartDebutYear: 1992, partyDebutYear: 1998, clue: "Debuted in Super Mario World and has been racing since Super Mario Kart." },
  "Toad": { species: "Toad", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 2", kartDebutYear: 1992, partyDebutYear: 2003, clue: "Debuted in Super Mario Bros. 2 but waited until Mario Party 5 to party." },
  "Koopa Troopa": { species: "Koopa", series: "Super Mario", debutYear: 1985, debutGame: "Super Mario Bros.", kartDebutYear: 1992, partyDebutYear: 2012, clue: "Debuted in Super Mario Bros. and finally got to party in Mario Party 9." },
  "Shy Guy": { species: "Shy Guy", series: "Super Mario", debutYear: 1987, debutGame: "Yume Kojo: Doki Doki Panic", kartDebutYear: 2005, partyDebutYear: 2012, clue: "Debuted in Yume Kojo: Doki Doki Panic and first raced in Mario Kart DS." },
  "Lakitu": { species: "Koopa", series: "Super Mario", debutYear: 1985, debutGame: "Super Mario Bros.", kartDebutYear: 2011, partyDebutYear: null, clue: "Debuted in Super Mario Bros., but only took the wheel in Mario Kart 7." },
  "Toadette": { species: "Toad", series: "Mario Kart", debutYear: 2003, debutGame: "Mario Kart: Double Dash!!", kartDebutYear: 2003, partyDebutYear: 2004, clue: "Debuted as a racer in Mario Kart: Double Dash, then partied in Mario Party 6." },
  "King Boo": { species: "Boo", series: "Luigi's Mansion", debutYear: 2001, debutGame: "Luigi's Mansion", kartDebutYear: 2003, partyDebutYear: null, clue: "Debuted in Luigi's Mansion, then went racing in Mario Kart: Double Dash." },
  "Baby Mario": { species: "Human", series: "Yoshi", debutYear: 1995, debutGame: "Super Mario World 2: Yoshi's Island", kartDebutYear: 2003, partyDebutYear: null, clue: "Debuted in the World 2 island adventure and first raced in Double Dash." },
  "Baby Luigi": { species: "Human", series: "Yoshi", debutYear: 1995, debutGame: "Super Mario World 2: Yoshi's Island", kartDebutYear: 2003, partyDebutYear: null, clue: "Debuted in Super Mario World 2: Yoshi's Island, racing from Double Dash on." },
  "Baby Peach": { species: "Human", series: "Mario RPG", debutYear: 2005, debutGame: "Mario & Luigi: Partners in Time", kartDebutYear: 2008, partyDebutYear: null, clue: "Debuted in Mario & Luigi: Partners in Time and first raced in Mario Kart Wii." },
  "Baby Daisy": { species: "Human", series: "Mario Kart", debutYear: 2008, debutGame: "Mario Kart Wii", kartDebutYear: 2008, partyDebutYear: null, clue: "Made a debut and a racing debut at once in Mario Kart Wii." },
  "Baby Rosalina": { species: "Human", series: "Mario Kart", debutYear: 2014, debutGame: "Mario Kart 8", kartDebutYear: 2014, partyDebutYear: null, clue: "Debuted straight onto the track in Mario Kart 8." },
  "Metal Mario": { species: "Human", series: "Super Mario", debutYear: 1996, debutGame: "Super Mario 64", kartDebutYear: 2011, partyDebutYear: null, clue: "Debuted in the 64 platformer and first took the wheel in the seventh kart game." },
  "Pink Gold Peach": { species: "Human", series: "Mario Kart", debutYear: 2014, debutGame: "Mario Kart 8", kartDebutYear: 2014, partyDebutYear: null, clue: "Born on the starting line, debuting as a racer in Mario Kart 8." },
  "Bowser": { species: "Koopa", series: "Super Mario", debutYear: 1985, debutGame: "Super Mario Bros.", kartDebutYear: 1992, partyDebutYear: 2015, clue: "Debuted in Super Mario Bros. but only became a party pick in Mario Party 10." },
  "Donkey Kong": { species: "Kong", series: "Donkey Kong", debutYear: 1981, debutGame: "Donkey Kong", kartDebutYear: 1996, partyDebutYear: 1998, clue: "Raced first in Mario Kart 64 and partied from the very first Mario Party." },
  "Wario": { species: "Human", series: "Super Mario", debutYear: 1992, debutGame: "Super Mario Land 2: 6 Golden Coins", kartDebutYear: 1996, partyDebutYear: 1998, clue: "Debuted in Super Mario Land 2: 6 Golden Coins and first raced in Mario Kart 64." },
  "Waluigi": { species: "Human", series: "Mario Sports", debutYear: 2000, debutGame: "Mario Tennis", kartDebutYear: 2003, partyDebutYear: 2000, clue: "Debuted in Mario Tennis, then partied in Mario Party 3." },
  "Dry Bones": { species: "Dry Bones", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2005, partyDebutYear: 2005, clue: "Debuted in Super Mario Bros. 3 and first raced in Mario Kart DS." },
  "Bowser Jr.": { species: "Koopa", series: "Super Mario", debutYear: 2002, debutGame: "Super Mario Sunshine", kartDebutYear: 2003, partyDebutYear: 2013, clue: "Debuted in Super Mario Sunshine and first partied in Mario Party: Island Tour." },
  "Dry Bowser": { species: "Dry Bones", series: "Super Mario", debutYear: 2006, debutGame: "New Super Mario Bros.", kartDebutYear: 2008, partyDebutYear: null, clue: "Debuted in New Super Mario Bros. and first raced in Mario Kart Wii." },
  "Lemmy": { species: "Koopa", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2014, partyDebutYear: null, clue: "Debuted in Super Mario Bros. 3 and first grabbed a kart in Mario Kart 8." },
  "Larry": { species: "Koopa", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2014, partyDebutYear: null, clue: "A Super Mario Bros. 3 original who first raced in Mario Kart 8." },
  "Wendy": { species: "Koopa", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2014, partyDebutYear: null, clue: "Came from Super Mario Bros. 3 and joined the Mario Kart 8 roster." },
  "Ludwig": { species: "Koopa", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2014, partyDebutYear: null, clue: "Debuted in Super Mario Bros. 3; Mario Kart 8 gave them their first ride." },
  "Iggy": { species: "Koopa", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2014, partyDebutYear: null, clue: "First seen in Super Mario Bros. 3, first racing in Mario Kart 8." },
  "Roy": { species: "Koopa", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2014, partyDebutYear: null, clue: "Super Mario Bros. 3 debut, Mario Kart 8 racing debut, no Mario Party yet." },
  "Morton": { species: "Koopa", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2014, partyDebutYear: null, clue: "Started out in Super Mario Bros. 3 and hit the track in Mario Kart 8." },
  "Inkling": { species: "Inkling", series: "Splatoon", debutYear: 2015, debutGame: "Splatoon", kartDebutYear: 2017, partyDebutYear: null, clue: "Debuted in Splatoon and inked a deal to race in Mario Kart 8 Deluxe." },
  "Link": { species: "Hylian", series: "The Legend of Zelda", debutYear: 1986, debutGame: "The Legend of Zelda", kartDebutYear: 2014, partyDebutYear: null, clue: "Debuted in The Legend of Zelda and visited the track in Mario Kart 8." },
  "Villager": { species: "Human", series: "Animal Crossing", debutYear: 2001, debutGame: "Dōbutsu no Mori", kartDebutYear: 2015, partyDebutYear: null, clue: "Debuted in Dōbutsu no Mori and later raced in Mario Kart 8." },
  "Isabelle": { species: "Animal", series: "Animal Crossing", debutYear: 2012, debutGame: "Animal Crossing: New Leaf", kartDebutYear: 2015, partyDebutYear: null, clue: "Debuted in Animal Crossing: New Leaf before racing in Mario Kart 8." },
  "Birdo": { species: "Other", series: "Super Mario", debutYear: 1987, debutGame: "Yume Kojo: Doki Doki Panic", kartDebutYear: 2003, partyDebutYear: 2005, clue: "Debuted in Yume Kojo: Doki Doki Panic and first partied in Mario Party 7." },
  "Petey Piranha": { species: "Piranha Plant", series: "Super Mario", debutYear: 2002, debutGame: "Super Mario Sunshine", kartDebutYear: 2003, partyDebutYear: null, clue: "Debuted in Super Mario Sunshine and raced in Mario Kart: Double Dash." },
  "Wiggler": { species: "Bug", series: "Super Mario", debutYear: 1990, debutGame: "Super Mario World", kartDebutYear: 2011, partyDebutYear: null, clue: "Debuted in Super Mario World and first raced in Mario Kart 7." },
  "Kamek": { species: "Koopa", series: "Yoshi", debutYear: 1995, debutGame: "Super Mario World 2: Yoshi's Island", kartDebutYear: 2021, partyDebutYear: 2012, clue: "Debuted in Super Mario World 2: Yoshi's Island and raced in Mario Kart Tour." },
  "Diddy Kong": { species: "Kong", series: "Donkey Kong", debutYear: 1994, debutGame: "Donkey Kong Country", kartDebutYear: 2003, partyDebutYear: 2016, clue: "First raced in Mario Kart: Double Dash and partied in Mario Party: Star Rush." },
  "Funky Kong": { species: "Kong", series: "Donkey Kong", debutYear: 1994, debutGame: "Donkey Kong Country", kartDebutYear: 2008, partyDebutYear: null, clue: "Rolled into the kart scene in Mario Kart Wii, with no Mario Party stint." },
  "Pauline": { species: "Human", series: "Donkey Kong", debutYear: 1981, debutGame: "Donkey Kong", kartDebutYear: 2019, partyDebutYear: 2024, clue: "Debuted in Donkey Kong and finally partied in Super Mario Party Jamboree." },
  "Peachette": { species: "Toad", series: "Super Mario", debutYear: 2019, debutGame: "New Super Mario Bros. U Deluxe", kartDebutYear: 2019, partyDebutYear: null, clue: "Debuted in New Super Mario Bros. U Deluxe and raced in Mario Kart Tour." },
  "Mii": { species: "Mii", series: "Mii", debutYear: 2006, debutGame: "Mii Channel", kartDebutYear: 2008, partyDebutYear: 2007, clue: "First raced in Mario Kart Wii and first partied in Mario Party 8." },
  "Boo": { species: "Boo", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: null, partyDebutYear: 2003, clue: "Debuted in Super Mario Bros. 3 and partied in Mario Party 5, but never raced." },
  "Ninji": { species: "Other", series: "Super Mario", debutYear: 1987, debutGame: "Yume Kojo: Doki Doki Panic", kartDebutYear: null, partyDebutYear: 2024, clue: "From Yume Kojo: Doki Doki Panic to a party in Super Mario Party Jamboree." },
  "BB": { species: "Bug", series: "Super Mario", debutYear: 2011, debutGame: "Super Mario 3D Land", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario 3D Land and first raced in Mario Kart World." },
  "Cataquack": { species: "Bird", series: "Super Mario", debutYear: 2002, debutGame: "Super Mario Sunshine", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario Sunshine and got a kart in Mario Kart World." },
  "Chargin' Chuck": { species: "Koopa", series: "Super Mario", debutYear: 1990, debutGame: "Super Mario World", kartDebutYear: 2022, partyDebutYear: null, clue: "Debuted in Super Mario World and first raced in Mario Kart Tour." },
  "Cheep Cheep": { species: "Fish", series: "Super Mario", debutYear: 1985, debutGame: "Super Mario Bros.", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario Bros. and finally raced in Mario Kart World." },
  "Coin Coffer": { species: "Animal", series: "Super Mario", debutYear: 2011, debutGame: "Super Mario 3D Land", kartDebutYear: 2025, partyDebutYear: null, clue: "A Super Mario 3D Land original who took the wheel in Mario Kart World." },
  "Conkdor": { species: "Bird", series: "Super Mario", debutYear: 2013, debutGame: "Super Mario 3D World", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario 3D World and raced in Mario Kart World." },
  "Cow": { species: "Animal", series: "Mario Kart", debutYear: 1996, debutGame: "Mario Kart 64", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Mario Kart 64 but only became a racer in Mario Kart World." },
  "Dolphin": { species: "Animal", series: "Super Mario", debutYear: 1990, debutGame: "Super Mario World", kartDebutYear: 2025, partyDebutYear: null, clue: "A Super Mario World original who first drove in Mario Kart World." },
  "Fishbone": { species: "Fish", series: "Super Mario", debutYear: 1990, debutGame: "Super Mario World", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario World and swam into Mario Kart World." },
  "Goomba": { species: "Goomba", series: "Super Mario", debutYear: 1985, debutGame: "Super Mario Bros.", kartDebutYear: 2025, partyDebutYear: 2018, clue: "Debuted in Super Mario Bros., partied in Super Mario Party, raced in Mario Kart World." },
  "Hammer Bro": { species: "Koopa", series: "Super Mario", debutYear: 1985, debutGame: "Super Mario Bros.", kartDebutYear: 2020, partyDebutYear: 2007, clue: "Partied in Mario Party 8 long before first racing in Mario Kart Tour." },
  "Koopa": { species: "Koopa", series: "Super Mario", debutYear: 1985, debutGame: "Super Mario Bros.", kartDebutYear: 1992, partyDebutYear: 2012, clue: "Debuted in Super Mario Bros., raced in Super Mario Kart, partied in Mario Party 9." },
  "Monty Mole": { species: "Mole", series: "Super Mario", debutYear: 1990, debutGame: "Super Mario World", kartDebutYear: 2020, partyDebutYear: 2018, clue: "Debuted in Super Mario World, raced in Mario Kart Tour, partied in Super Mario Party." },
  "Nabbit": { species: "Animal", series: "Super Mario", debutYear: 2012, debutGame: "New Super Mario Bros. U", kartDebutYear: 2020, partyDebutYear: null, clue: "Debuted in New Super Mario Bros. U and first raced in Mario Kart Tour." },
  "Peepa": { species: "Boo", series: "Super Mario", debutYear: 2011, debutGame: "Super Mario 3D Land", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario 3D Land and drifted into Mario Kart World." },
  "Penguin": { species: "Animal", series: "Super Mario", debutYear: 1996, debutGame: "Super Mario 64", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario 64 and finally raced in Mario Kart World." },
  "Pianta": { species: "Other", series: "Super Mario", debutYear: 2002, debutGame: "Super Mario Sunshine", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario Sunshine and joined the racers in Mario Kart World." },
  "Piranha Plant": { species: "Piranha Plant", series: "Super Mario", debutYear: 1985, debutGame: "Super Mario Bros.", kartDebutYear: 2025, partyDebutYear: null, clue: "An original from Super Mario Bros. that finally raced in Mario Kart World." },
  "Pokey": { species: "Other", series: "Super Mario", debutYear: 1987, debutGame: "Yume Kojo: Doki Doki Panic", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Yume Kojo: Doki Doki Panic and rolled into Mario Kart World." },
  "Rocky Wrench": { species: "Koopa", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario Bros. 3 and got behind the wheel in Mario Kart World." },
  "Sidestepper": { species: "Animal", series: "Super Mario", debutYear: 1983, debutGame: "Mario Bros.", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Mario Bros. and waited ages to race in Mario Kart World." },
  "Snowman": { species: "Other", series: "Mario Kart", debutYear: 1996, debutGame: "Mario Kart 64", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Mario Kart 64, then upgraded to racer in Mario Kart World." },
  "Spike": { species: "Koopa", series: "Super Mario", debutYear: 1988, debutGame: "Super Mario Bros. 3", kartDebutYear: 2025, partyDebutYear: 2015, clue: "Debuted in Super Mario Bros. 3, partied in Mario Party 10, raced in Mario Kart World." },
  "Stingby": { species: "Bug", series: "Super Mario", debutYear: 2011, debutGame: "Super Mario 3D Land", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario 3D Land and zipped into Mario Kart World." },
  "Swoop": { species: "Animal", series: "Super Mario", debutYear: 1990, debutGame: "Super Mario World", kartDebutYear: 2025, partyDebutYear: null, clue: "Debuted in Super Mario World and first raced in Mario Kart World." },
};
