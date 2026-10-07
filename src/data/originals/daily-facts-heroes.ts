/**
 * Facts for the hero-shooter Daily Shuffle puzzles (Overwatch, Marvel
 * Rivals), keyed by the roster names in src/data/heroes/*.ts. Researched Oct
 * 7, 2026: Overwatch from Blizzard's hero pages and the Overwatch wiki
 * (heroes-by-country table, infobox affiliations); Marvel Rivals from
 * marvelrivals.com, the Marvel Rivals wiki release table and the Marvel
 * Database. Sources kept in the research notes, not shipped. Clues are
 * written from these facts only and never name the hero. Role comes from the
 * roster file, so a role change (Sombra, 2026-10-06) needs no edit here.
 *
 * The ORDER of each object is the Daily roster and feeds the answer shuffle:
 * never reorder, insert or remove an entry (it would change past answers). A
 * new hero joins through a new puzzle version in a new rotation era.
 *
 * Overwatch
 *   species      Human, Human (cybernetic), Omnic, Robot, Animal
 *   origin       country or place (wiki table; Echo = Singapore, Bastion and
 *                Jetpack Cat Unknown); `region` is its continent, for "close"
 *   affiliation  the main faction (Overwatch, Talon, Junkers, Vishkar, MEKA,
 *                Yōkai, Shambali, Null Sector), else Other
 *   released     the year the hero went live
 *
 * Marvel Rivals
 *   species      Marvel Database origin class: Human, Mutate, Mutant,
 *                Asgardian, Alien, Symbiote, Synthetic, Animal, Supernatural
 *   team         Avengers, X-Men, Guardians of the Galaxy, Fantastic Four,
 *                Spider-Verse, Midnight Sons, Agents of Atlas, Villains, Solo
 *   comicDebut   first comic appearance (cover year). Where the Marvel
 *                Database's earliest listing differs from the usual answer
 *                (Thor's 1950 Venus cameo, Groot's 1960 monster), the usual
 *                answer is used: Thor 1962, Loki 1962, Groot 1960, Rocket
 *                1976, Star-Lord 1976, Venom 1988, Angela 1993 (Spawn).
 *   joined       the season the hero was added (Launch, Season 1, Season 1.5…)
 */

export interface OverwatchFacts {
  species: "Human" | "Human (cybernetic)" | "Omnic" | "Robot" | "Animal";
  origin: string;
  region: string;
  affiliation: string;
  released: number;
  clue: string;
}

export interface RivalsFacts {
  species: string;
  team: string;
  comicDebut: number;
  joined: string;
  clue: string;
}

export const OVERWATCH_FACTS: Record<string, OverwatchFacts> = {
  "Tracer": { species: "Human", origin: "United Kingdom", region: "Europe", affiliation: "Overwatch", released: 2016, clue: "A London flyer who served in the Royal Air Force before Overwatch." },
  "Reaper": { species: "Human", origin: "United States", region: "North America", affiliation: "Talon", released: 2016, clue: "Once with the Los Angeles police and the US Army, now working out of Rome." },
  "Widowmaker": { species: "Human", origin: "France", region: "Europe", affiliation: "Talon", released: 2016, clue: "A sharpshooter from Annecy, France." },
  "Pharah": { species: "Human", origin: "Egypt", region: "Africa", affiliation: "Overwatch", released: 2016, clue: "Served in the Egyptian Army and with Helix Security before joining up." },
  "Reinhardt": { species: "Human", origin: "Germany", region: "Europe", affiliation: "Overwatch", released: 2016, clue: "A Stalwart tank from Stuttgart who once rode with the Crusaders." },
  "Mercy": { species: "Human", origin: "Switzerland", region: "Europe", affiliation: "Overwatch", released: 2016, clue: "A Medic from Zürich, one of the launch-day heroes." },
  "Torbjörn": { species: "Human (cybernetic)", origin: "Sweden", region: "Europe", affiliation: "Overwatch", released: 2016, clue: "A Gothenburg engineer from the Ironclad Guild." },
  "Hanzo": { species: "Human", origin: "Japan", region: "Asia", affiliation: "Yōkai", released: 2016, clue: "Left the Shimada clan and Hanamura behind." },
  "Winston": { species: "Animal", origin: "The Moon", region: "Extraterrestrial", affiliation: "Overwatch", released: 2016, clue: "Grew up at the Horizon Lunar Colony." },
  "Zenyatta": { species: "Omnic", origin: "Nepal", region: "Asia", affiliation: "Shambali", released: 2016, clue: "Left the Shambali Monastery in Nepal to travel the world." },
  "Bastion": { species: "Omnic", origin: "Unknown", region: "Unknown", affiliation: "Overwatch", released: 2016, clue: "Lives in Gothenburg with the Ironclad Guild; where it was built is a mystery." },
  "Symmetra": { species: "Human (cybernetic)", origin: "India", region: "Asia", affiliation: "Vishkar", released: 2016, clue: "An architect for the Vishkar Corporation in Utopaea." },
  "Zarya": { species: "Human", origin: "Russia", region: "Europe", affiliation: "Overwatch", released: 2016, clue: "A Russian Defense Forces soldier from the Krasnoyarsk Front." },
  "Cassidy": { species: "Human (cybernetic)", origin: "United States", region: "North America", affiliation: "Overwatch", released: 2016, clue: "A sharpshooter out of Santa Fe, New Mexico." },
  "Soldier: 76": { species: "Human", origin: "United States", region: "North America", affiliation: "Overwatch", released: 2016, clue: "A US Army veteran of the Soldier Enhancement Program." },
  "Lúcio": { species: "Human", origin: "Brazil", region: "South America", affiliation: "Overwatch", released: 2016, clue: "A Support hero from Rio de Janeiro." },
  "Roadhog": { species: "Human", origin: "Australia", region: "Oceania", affiliation: "Junkers", released: 2016, clue: "A Junkertown bruiser who fought with the Australian Liberation Front." },
  "Junkrat": { species: "Human (cybernetic)", origin: "Australia", region: "Oceania", affiliation: "Junkers", released: 2016, clue: "A Damage Specialist from Junkertown." },
  "D.Va": { species: "Human", origin: "South Korea", region: "Asia", affiliation: "MEKA", released: 2016, clue: "A tank pilot from the MEKA base in Busan." },
  "Mei": { species: "Human", origin: "China", region: "Asia", affiliation: "Overwatch", released: 2016, clue: "A scientist from Xi'an who later worked with Atlas News." },
  "Genji": { species: "Human (cybernetic)", origin: "Japan", region: "Asia", affiliation: "Overwatch", released: 2016, clue: "A former Shimada clan member who served in Blackwatch." },
  "Ana": { species: "Human (cybernetic)", origin: "Egypt", region: "Africa", affiliation: "Overwatch", released: 2016, clue: "A Cairo veteran of the Egyptian Army's El-Sa'ka forces." },
  "Sombra": { species: "Human (cybernetic)", origin: "Mexico", region: "North America", affiliation: "Talon", released: 2016, clue: "Ran with Los Muertos in Dorado, Mexico." },
  "Orisa": { species: "Omnic", origin: "Numbani", region: "Africa", affiliation: "Overwatch", released: 2017, clue: "Built in the city of Numbani; the first new hero of 2017." },
  "Doomfist": { species: "Human (cybernetic)", origin: "Nigeria", region: "Africa", affiliation: "Talon", released: 2017, clue: "Came from Oyo, Nigeria and Ogundimu Synergies." },
  "Moira": { species: "Human", origin: "Ireland", region: "Europe", affiliation: "Talon", released: 2017, clue: "An Irish scientist with the Ministries of Oasis." },
  "Brigitte": { species: "Human", origin: "Sweden", region: "Europe", affiliation: "Overwatch", released: 2018, clue: "A Survivor support who grew up in Gothenburg." },
  "Wrecking Ball": { species: "Animal", origin: "The Moon", region: "Extraterrestrial", affiliation: "Junkers", released: 2018, clue: "Left the Horizon Lunar Colony and landed in Junkertown." },
  "Ashe": { species: "Human", origin: "United States", region: "North America", affiliation: "Other", released: 2018, clue: "Leads the Deadlock Gang from Deadlock Gorge, Arizona." },
  "Baptiste": { species: "Human", origin: "Haiti", region: "North America", affiliation: "Overwatch", released: 2019, clue: "A combat medic from Haiti who once worked for Talon." },
  "Sigma": { species: "Human", origin: "Netherlands", region: "Europe", affiliation: "Talon", released: 2019, clue: "An astrophysicist from The Hague." },
  "Echo": { species: "Robot", origin: "Singapore", region: "Asia", affiliation: "Overwatch", released: 2020, clue: "An AI, not an omnic, and the only new hero of 2020." },
  "Sojourn": { species: "Human (cybernetic)", origin: "Canada", region: "North America", affiliation: "Overwatch", released: 2022, clue: "A Canadian Army veteran from Toronto." },
  "Junker Queen": { species: "Human", origin: "Australia", region: "Oceania", affiliation: "Junkers", released: 2022, clue: "Rules Junkertown as a Stalwart tank." },
  "Kiriko": { species: "Human", origin: "Japan", region: "Asia", affiliation: "Yōkai", released: 2022, clue: "A Medic from Kanezaka, Japan." },
  "Ramattra": { species: "Omnic", origin: "Nepal", region: "Asia", affiliation: "Null Sector", released: 2022, clue: "Was a Shambali monk before leading Null Sector." },
  "Lifeweaver": { species: "Human (cybernetic)", origin: "Thailand", region: "Asia", affiliation: "Other", released: 2023, clue: "Left the Vishkar Corporation for The Collective." },
  "Illari": { species: "Human", origin: "Peru", region: "South America", affiliation: "Other", released: 2023, clue: "One of the Inti Warriors of Runasapi, Peru." },
  "Mauga": { species: "Human (cybernetic)", origin: "Samoa", region: "Oceania", affiliation: "Talon", released: 2023, clue: "A tank from Apia who once ran with the Deepsea Raiders." },
  "Venture": { species: "Human", origin: "Canada", region: "North America", affiliation: "Other", released: 2024, clue: "A Wayfinder Society explorer from Nova Scotia." },
  "Juno": { species: "Human", origin: "Mars", region: "Extraterrestrial", affiliation: "Overwatch", released: 2024, clue: "Grew up in the Red Promise colony." },
  "Hazard": { species: "Human (cybernetic)", origin: "United Kingdom", region: "Europe", affiliation: "Other", released: 2024, clue: "A Glasgow tank with the Phreaks." },
  "Freja": { species: "Human", origin: "Denmark", region: "Europe", affiliation: "Talon", released: 2025, clue: "Served in the Danish Armed Forces, out of Copenhagen." },
  "Wuyang": { species: "Human", origin: "China", region: "Asia", affiliation: "Overwatch", released: 2025, clue: "A student from Wuxing University in Chengdu." },
  "Vendetta": { species: "Human", origin: "Italy", region: "Europe", affiliation: "Talon", released: 2025, clue: "A Flanker from Rome." },
  "Anran": { species: "Human", origin: "China", region: "Asia", affiliation: "Overwatch", released: 2026, clue: "Came from Wuxing University to Watchpoint: Gibraltar." },
  "Domina": { species: "Human", origin: "India", region: "Asia", affiliation: "Vishkar", released: 2026, clue: "A Stalwart tank with ties to both Vishkar and Talon." },
  "Emre": { species: "Human", origin: "Turkey", region: "Asia", affiliation: "Talon", released: 2026, clue: "Left Overwatch and Istanbul for Rome." },
  "Mizuki": { species: "Human", origin: "Japan", region: "Asia", affiliation: "Overwatch", released: 2026, clue: "From the Hashimoto clan, now in Kanezaka." },
  "Jetpack Cat": { species: "Animal", origin: "Unknown", region: "Unknown", affiliation: "Overwatch", released: 2026, clue: "Lives at Watchpoint: Gibraltar, nobody knows where from." },
  "Sierra": { species: "Human", origin: "United States", region: "North America", affiliation: "Overwatch", released: 2026, clue: "A Recon hero from Grand Mesa, Colorado." },
  "Shion": { species: "Omnic", origin: "Japan", region: "Asia", affiliation: "Talon", released: 2026, clue: "Serves the Hashimoto clan from Tokyo." },
  "D.Mon": { species: "Human", origin: "South Korea", region: "Asia", affiliation: "MEKA", released: 2026, clue: "Joined the MEKA squad at the Busan base." },
  "Doctrine": { species: "Human", origin: "Zimbabwe", region: "Africa", affiliation: "Talon", released: 2026, clue: "Once at Ogundimu Synergies, now with the Talon Loyalists." },
};

export const RIVALS_FACTS: Record<string, RivalsFacts> = {
  "Doctor Strange": { species: "Human", team: "Avengers", comicDebut: 1963, joined: "Launch", clue: "First appeared in Strange Tales." },
  "Hulk": { species: "Mutate", team: "Avengers", comicDebut: 1962, joined: "Launch", clue: "Had his own comic from issue one in 1962." },
  "Iron Man": { species: "Human", team: "Avengers", comicDebut: 1963, joined: "Launch", clue: "Debuted in Tales of Suspense." },
  "Spider-Man": { species: "Mutate", team: "Spider-Verse", comicDebut: 1962, joined: "Launch", clue: "Debuted in Amazing Fantasy #15." },
  "Luna Snow": { species: "Mutate", team: "Agents of Atlas", comicDebut: 2019, joined: "Launch", clue: "Debuted in 2019 with the New Agents of Atlas." },
  "Namor": { species: "Mutant", team: "X-Men", comicDebut: 1939, joined: "Launch", clue: "Has been around since 1939, one of Marvel's oldest." },
  "Loki": { species: "Asgardian", team: "Villains", comicDebut: 1962, joined: "Launch", clue: "A Strategist and an Asgardian villain." },
  "Black Panther": { species: "Mutate", team: "Avengers", comicDebut: 1966, joined: "Launch", clue: "First showed up in Fantastic Four #52." },
  "Magik": { species: "Mutant", team: "X-Men", comicDebut: 1975, joined: "Launch", clue: "Debuted in Giant-Size X-Men #1." },
  "Rocket Raccoon": { species: "Animal", team: "Guardians of the Galaxy", comicDebut: 1976, joined: "Launch", clue: "A Strategist and a Guardian, but not a human." },
  "Groot": { species: "Alien", team: "Guardians of the Galaxy", comicDebut: 1960, joined: "Launch", clue: "Started out as a 1960 monster comic villain." },
  "Peni Parker": { species: "Mutate", team: "Spider-Verse", comicDebut: 2014, joined: "Launch", clue: "Debuted in Edge of Spider-Verse in 2014." },
  "Storm": { species: "Mutant", team: "X-Men", comicDebut: 1975, joined: "Launch", clue: "One of the new team in Giant-Size X-Men #1." },
  "Magneto": { species: "Mutant", team: "X-Men", comicDebut: 1963, joined: "Launch", clue: "Faced the X-Men in their very first issue." },
  "Star-Lord": { species: "Human", team: "Guardians of the Galaxy", comicDebut: 1976, joined: "Launch", clue: "A Duelist who leads a team of Guardians." },
  "Mantis": { species: "Mutate", team: "Guardians of the Galaxy", comicDebut: 1973, joined: "Launch", clue: "First appeared in Avengers #112." },
  "The Punisher": { species: "Human", team: "Solo", comicDebut: 1974, joined: "Launch", clue: "Debuted in Amazing Spider-Man #129." },
  "Scarlet Witch": { species: "Mutate", team: "Avengers", comicDebut: 1964, joined: "Launch", clue: "First appeared in X-Men #4." },
  "Hela": { species: "Asgardian", team: "Villains", comicDebut: 1964, joined: "Launch", clue: "Debuted in Journey Into Mystery." },
  "Venom": { species: "Symbiote", team: "Spider-Verse", comicDebut: 1988, joined: "Launch", clue: "Not human at all, and a Vanguard." },
  "Adam Warlock": { species: "Synthetic", team: "Guardians of the Galaxy", comicDebut: 1967, joined: "Launch", clue: "Created artificially, first seen in Fantastic Four #66." },
  "Thor": { species: "Asgardian", team: "Avengers", comicDebut: 1962, joined: "Launch", clue: "A Vanguard from Asgard who fights alongside the Avengers." },
  "Jeff the Land Shark": { species: "Animal", team: "Avengers", comicDebut: 2019, joined: "Launch", clue: "Debuted in West Coast Avengers in 2019." },
  "Winter Soldier": { species: "Human", team: "Avengers", comicDebut: 1941, joined: "Launch", clue: "First appeared in Captain America Comics #1." },
  "Captain America": { species: "Mutate", team: "Avengers", comicDebut: 1941, joined: "Launch", clue: "Had his own comic from issue one in 1941." },
  "Psylocke": { species: "Mutant", team: "X-Men", comicDebut: 2021, joined: "Launch", clue: "This version debuted in King in Black in 2021." },
  "Moon Knight": { species: "Human", team: "Midnight Sons", comicDebut: 1975, joined: "Launch", clue: "Debuted in Werewolf by Night #32." },
  "Hawkeye": { species: "Human", team: "Avengers", comicDebut: 1964, joined: "Launch", clue: "First appeared in Tales of Suspense #57." },
  "Squirrel Girl": { species: "Mutate", team: "Avengers", comicDebut: 1992, joined: "Launch", clue: "Debuted in Marvel Super-Heroes in 1992." },
  "Iron Fist": { species: "Human", team: "Agents of Atlas", comicDebut: 2018, joined: "Launch", clue: "This version debuted in 2018 and runs with the Agents of Atlas." },
  "Black Widow": { species: "Mutate", team: "Avengers", comicDebut: 1964, joined: "Launch", clue: "First appeared in Tales of Suspense #52." },
  "Cloak & Dagger": { species: "Mutate", team: "Solo", comicDebut: 1982, joined: "Launch", clue: "Debuted in The Spectacular Spider-Man #64." },
  "Wolverine": { species: "Mutant", team: "X-Men", comicDebut: 1974, joined: "Launch", clue: "First appeared in Incredible Hulk #180." },
  "Mister Fantastic": { species: "Mutate", team: "Fantastic Four", comicDebut: 1961, joined: "Season 1", clue: "Arrived in Season 1 with a teammate." },
  "Invisible Woman": { species: "Mutate", team: "Fantastic Four", comicDebut: 1961, joined: "Season 1", clue: "A Strategist who arrived in Season 1." },
  "Human Torch": { species: "Mutate", team: "Fantastic Four", comicDebut: 1961, joined: "Season 1.5", clue: "Arrived in Season 1.5 with a teammate." },
  "The Thing": { species: "Mutate", team: "Fantastic Four", comicDebut: 1961, joined: "Season 1.5", clue: "A Vanguard who arrived in Season 1.5." },
  "Emma Frost": { species: "Mutant", team: "X-Men", comicDebut: 1980, joined: "Season 2", clue: "First appeared in X-Men #129." },
  "Ultron": { species: "Synthetic", team: "Villains", comicDebut: 1968, joined: "Season 2.5", clue: "An artificial villain from Avengers #54." },
  "Phoenix": { species: "Mutant", team: "X-Men", comicDebut: 1963, joined: "Season 3", clue: "Was there in X-Men #1, long before this name." },
  "Blade": { species: "Supernatural", team: "Midnight Sons", comicDebut: 1973, joined: "Season 3.5", clue: "Debuted in Tomb of Dracula #10." },
  "Angela": { species: "Asgardian", team: "Guardians of the Galaxy", comicDebut: 1993, joined: "Season 4", clue: "Debuted outside Marvel, in another publisher's comic." },
  "Daredevil": { species: "Mutate", team: "Solo", comicDebut: 1964, joined: "Season 4.5", clue: "Had his own comic from issue one in 1964." },
  "Gambit": { species: "Mutant", team: "X-Men", comicDebut: 1990, joined: "Season 5", clue: "First appeared in X-Men Annual #14." },
  "Rogue": { species: "Mutant", team: "X-Men", comicDebut: 1981, joined: "Season 5.5", clue: "Debuted in Avengers Annual #10." },
  "Deadpool": { species: "Mutate", team: "X-Men", comicDebut: 1991, joined: "Season 6", clue: "Plays every role, first seen in New Mutants #98." },
  "Elsa Bloodstone": { species: "Mutate", team: "Midnight Sons", comicDebut: 2001, joined: "Season 6.5", clue: "Had her own comic from issue one in 2001." },
  "White Fox": { species: "Supernatural", team: "Agents of Atlas", comicDebut: 2014, joined: "Season 7", clue: "A Strategist and a kumiho, first seen in 2014." },
  "Black Cat": { species: "Human", team: "Spider-Verse", comicDebut: 1979, joined: "Season 7.5", clue: "First appeared in Amazing Spider-Man #194." },
  "Devil Dinosaur": { species: "Animal", team: "Solo", comicDebut: 1978, joined: "Season 8", clue: "Had his own comic from issue one in 1978." },
  "Cyclops": { species: "Mutant", team: "X-Men", comicDebut: 1963, joined: "Season 8.5", clue: "A founding X-Man, there in issue one." },
  "Jubilee": { species: "Mutant", team: "X-Men", comicDebut: 1989, joined: "Season 9", clue: "First appeared in Uncanny X-Men #244." },
  "The Hood": { species: "Human", team: "Villains", comicDebut: 2002, joined: "Season 9.5", clue: "A Vanguard villain who had his own comic in 2002." },
  "Gorr the God Butcher": { species: "Alien", team: "Villains", comicDebut: 2013, joined: "Season 10", clue: "First seen in Thor: God of Thunder in 2013." },
};
