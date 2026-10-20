/**
 * The GameShuffle trivia pack: questions any host can drop into a night.
 *
 * Every question carries its answer line (what to accept, what to ask the
 * host about, what to reject), a source, and an "as of" date when the fact
 * can change. Written 2026-10-08 from facts with one clear answer; anything
 * contested (longest river, the number of continents) is left out on purpose.
 *
 * These go in as drafts (Platform ▸ Trivia ▸ "Add the starter pack") and reach
 * hosts only once staff approve them, so a wrong fact can be caught before a
 * room sees it. Rerunning the import only adds questions not already there
 * (same prompt and picture).
 *
 * Picture questions use art we already serve on the randomizers. Phones and
 * the TV load them through /api/trivia/pic so the file name can't give the
 * answer away.
 */

import { HALLOWEEN_PACK } from "@/data/originals/trivia-pack-halloween";

export type PackCategory =
  | "General knowledge"
  | "Geography"
  | "Science & nature"
  | "History"
  | "Video games"
  | "Movies & TV"
  | "Music"
  | "Sports"
  | "Food & drink"
  | "Words & numbers"
  | "Halloween"
  | "Picture: game characters"
  | "Picture: Overwatch heroes";

export interface PackQuestion {
  category: PackCategory;
  difficulty: "easy" | "medium" | "hard";
  kind: "text" | "number" | "choice" | "picture";
  prompt: string;
  answer: string;
  accept?: string[];
  askAbout?: string[];
  reject?: string[];
  options?: string[];
  imageUrl?: string;
  sources: { title: string; url: string }[];
  asOf?: string;
  changeable?: boolean;
}

const wiki = (page: string) => ({ title: `Wikipedia: ${page}`, url: `https://en.wikipedia.org/wiki/${encodeURI(page.replace(/ /g, "_"))}` });

type Extra = Partial<Omit<PackQuestion, "category" | "difficulty" | "prompt" | "answer" | "sources">>;
const q = (category: PackCategory, difficulty: PackQuestion["difficulty"], prompt: string, answer: string, source: string, extra: Extra = {}): PackQuestion => ({
  category, difficulty, kind: "text", prompt, answer, sources: [wiki(source)], ...extra,
});
const n = (category: PackCategory, difficulty: PackQuestion["difficulty"], prompt: string, answer: string, source: string, extra: Extra = {}): PackQuestion =>
  q(category, difficulty, prompt, answer, source, { kind: "number", ...extra });

const GK: PackCategory = "General knowledge";
const GEO: PackCategory = "Geography";
const SCI: PackCategory = "Science & nature";
const HIS: PackCategory = "History";
const VG: PackCategory = "Video games";
const TV: PackCategory = "Movies & TV";
const MUS: PackCategory = "Music";
const SP: PackCategory = "Sports";
const FD: PackCategory = "Food & drink";
const WN: PackCategory = "Words & numbers";

const TEXT: PackQuestion[] = [
  // General knowledge
  n(GK, "easy", "How many colours are in a rainbow, as traditionally listed?", "7", "Rainbow", { accept: ["seven"] }),
  n(GK, "easy", "How many legs does a spider have?", "8", "Spider", { accept: ["eight"] }),
  n(GK, "easy", "How many sides does a hexagon have?", "6", "Hexagon", { accept: ["six"] }),
  n(GK, "easy", "How many squares are on a standard chessboard?", "64", "Chessboard"),
  n(GK, "easy", "How many is a baker's dozen?", "13", "Dozen", { accept: ["thirteen"] }),
  q(GK, "easy", "Which country gave the Statue of Liberty to the United States?", "France", "Statue of Liberty"),
  n(GK, "easy", "How many rings are on the Olympic flag?", "5", "Olympic symbols", { accept: ["five"] }),
  n(GK, "easy", "How many days are in a leap year?", "366", "Leap year"),
  n(GK, "medium", "How many keys does a standard modern piano have?", "88", "Piano"),
  q(GK, "easy", "Which artist painted the Mona Lisa?", "Leonardo da Vinci", "Mona Lisa", { accept: ["da Vinci", "Leonardo"] }),
  q(GK, "easy", "What is the currency of Japan?", "Yen", "Japanese yen", { accept: ["Japanese yen"] }),
  n(GK, "easy", "How many sides does a standard stop sign have?", "8", "Stop sign", { accept: ["eight"] }),
  n(GK, "medium", "How many strings does a standard violin have?", "4", "Violin", { accept: ["four"] }),
  n(GK, "medium", "How many hours are in a week?", "168", "Week"),
  n(GK, "easy", "How many signs are in the Western zodiac?", "12", "Astrological sign", { accept: ["twelve"] }),
  q(GK, "easy", "What is the largest animal alive today?", "Blue whale", "Blue whale", { reject: ["Elephant", "African elephant", "Whale shark"], askAbout: ["Whale"] }),
  q(GK, "easy", "What colour do you get when you mix blue and yellow paint?", "Green", "Secondary color"),
  n(GK, "medium", "How many minutes are in a day?", "1440", "Day"),
  q(GK, "hard", "Which is the only letter of the alphabet that doesn't appear in the name of any US state?", "Q", "U.S. state"),
  q(GK, "easy", "What is a baby kangaroo called?", "Joey", "Kangaroo"),

  // Geography
  q(GEO, "medium", "What is the capital of Australia?", "Canberra", "Canberra", { reject: ["Sydney", "Melbourne"] }),
  q(GEO, "easy", "What is the capital of Canada?", "Ottawa", "Ottawa", { reject: ["Toronto", "Montreal", "Vancouver"] }),
  q(GEO, "easy", "What is the smallest country in the world by area?", "Vatican City", "Vatican City", { accept: ["Vatican", "The Vatican"], reject: ["Monaco"] }),
  q(GEO, "easy", "What is the largest country in the world by area?", "Russia", "Russia", { reject: ["Canada", "China"] }),
  q(GEO, "easy", "What is the highest mountain on Earth above sea level?", "Mount Everest", "Mount Everest", { accept: ["Everest"], reject: ["K2"] }),
  q(GEO, "medium", "What is the largest hot desert in the world?", "Sahara", "Sahara", { accept: ["Sahara Desert"], askAbout: ["Antarctica", "Antarctic"] }),
  q(GEO, "easy", "What is the capital of Japan?", "Tokyo", "Tokyo", { reject: ["Kyoto", "Osaka"] }),
  q(GEO, "medium", "What is the capital of Brazil?", "Brasília", "Brasília", { reject: ["Rio de Janeiro", "Rio", "São Paulo"] }),
  q(GEO, "medium", "What is the capital of Turkey?", "Ankara", "Ankara", { reject: ["Istanbul"] }),
  q(GEO, "medium", "What is the capital of New Zealand?", "Wellington", "Wellington", { reject: ["Auckland", "Christchurch"] }),
  n(GEO, "easy", "How many states are in the United States?", "50", "U.S. state", { accept: ["fifty"] }),
  q(GEO, "easy", "Which European country is shaped like a boot?", "Italy", "Italy"),
  q(GEO, "medium", "What is the largest island in the world (not counting Australia)?", "Greenland", "Greenland", { reject: ["New Guinea", "Borneo", "Madagascar"] }),
  q(GEO, "medium", "Name either of the two landlocked countries in South America.", "Bolivia", "Landlocked country", { accept: ["Paraguay"] }),
  q(GEO, "medium", "Which country has the largest population?", "India", "List of countries by population (United Nations)", { reject: ["China"], changeable: true, asOf: "2026-10-08" }),
  q(GEO, "easy", "The Panama Canal links the Atlantic Ocean to which other ocean?", "Pacific", "Panama Canal", { accept: ["Pacific Ocean"] }),
  q(GEO, "medium", "Mount Kilimanjaro is in which country?", "Tanzania", "Mount Kilimanjaro", { reject: ["Kenya"] }),
  q(GEO, "easy", "Uluru, the giant sandstone rock, is in which country?", "Australia", "Uluru"),
  q(GEO, "easy", "What is the capital of Egypt?", "Cairo", "Cairo", { reject: ["Alexandria"] }),
  q(GEO, "easy", "What is the capital of Scotland?", "Edinburgh", "Edinburgh", { reject: ["Glasgow"] }),
  q(GEO, "easy", "Which river flows through London?", "Thames", "River Thames", { accept: ["River Thames"] }),
  q(GEO, "medium", "What is the capital of Iceland?", "Reykjavík", "Reykjavík"),
  q(GEO, "easy", "Mount Fuji is in which country?", "Japan", "Mount Fuji"),
  q(GEO, "easy", "What is the capital of Spain?", "Madrid", "Madrid", { reject: ["Barcelona"] }),
  q(GEO, "medium", "Which river flows through Paris?", "Seine", "Seine", { accept: ["River Seine"] }),
  q(GEO, "easy", "Which US state is made up entirely of islands?", "Hawaii", "Hawaii"),
  q(GEO, "medium", "The city of Marrakesh is in which country?", "Morocco", "Marrakesh"),

  // Science & nature
  q(SCI, "easy", "What is the chemical symbol for gold?", "Au", "Gold"),
  q(SCI, "easy", "What is the chemical formula for water?", "H2O", "Properties of water"),
  q(SCI, "easy", "Which planet is known as the Red Planet?", "Mars", "Mars"),
  q(SCI, "easy", "Which planet is closest to the Sun?", "Mercury", "Mercury (planet)"),
  n(SCI, "easy", "At sea level, at what temperature in degrees Celsius does water boil?", "100", "Boiling point"),
  q(SCI, "easy", "Which gas do plants take in from the air to make their food?", "Carbon dioxide", "Photosynthesis", { accept: ["CO2"], reject: ["Oxygen"] }),
  q(SCI, "easy", "What is the hardest natural material?", "Diamond", "Diamond"),
  n(SCI, "easy", "How many chambers does the human heart have?", "4", "Heart", { accept: ["four"] }),
  q(SCI, "easy", "Which element has the chemical symbol O?", "Oxygen", "Oxygen"),
  q(SCI, "medium", "Which element has the chemical symbol Fe?", "Iron", "Iron"),
  q(SCI, "medium", "Which element has the chemical symbol Na?", "Sodium", "Sodium", { reject: ["Nitrogen"] }),
  q(SCI, "medium", "What is the largest organ of the human body?", "Skin", "Skin", { reject: ["Liver"] }),
  n(SCI, "medium", "How many moons does Mars have?", "2", "Moons of Mars", { accept: ["two"] }),
  n(SCI, "easy", "How many planets are in our solar system?", "8", "Solar System", { accept: ["eight"] }),
  q(SCI, "hard", "What does DNA stand for?", "Deoxyribonucleic acid", "DNA"),
  n(SCI, "medium", "How many hearts does an octopus have?", "3", "Octopus", { accept: ["three"] }),
  q(SCI, "medium", "What is the only mammal capable of true flight?", "Bat", "Bat", { reject: ["Flying squirrel", "Sugar glider"] }),
  q(SCI, "easy", "Which scientist set out the laws of motion and universal gravitation in 1687?", "Isaac Newton", "Isaac Newton", { accept: ["Newton"] }),
  q(SCI, "easy", "Which scientist developed the theory of relativity?", "Albert Einstein", "Albert Einstein", { accept: ["Einstein"] }),
  q(SCI, "easy", "Which element is number 1 on the periodic table?", "Hydrogen", "Hydrogen", { reject: ["Helium"] }),
  q(SCI, "easy", "What is the fastest land animal?", "Cheetah", "Cheetah"),
  q(SCI, "easy", "What is the tallest animal in the world?", "Giraffe", "Giraffe"),
  q(SCI, "hard", "In a plant cell, which part carries out photosynthesis?", "Chloroplast", "Chloroplast", { reject: ["Mitochondria", "Mitochondrion"] }),
  q(SCI, "medium", "What is the closest star to Earth?", "The Sun", "Sun", { accept: ["Sun"], askAbout: ["Proxima Centauri", "Alpha Centauri"] }),
  n(SCI, "medium", "How many teeth does an adult human usually have, wisdom teeth included?", "32", "Human tooth"),
  n(SCI, "medium", "How many bones are in the adult human body?", "206", "Human skeleton"),

  // History
  n(HIS, "easy", "In what year did people first walk on the Moon?", "1969", "Apollo 11"),
  q(HIS, "easy", "Who was the first person to walk on the Moon?", "Neil Armstrong", "Neil Armstrong", { accept: ["Armstrong"], reject: ["Buzz Aldrin", "Aldrin"] }),
  n(HIS, "easy", "In what year did World War II end?", "1945", "World War II"),
  n(HIS, "medium", "In what year did the Titanic sink?", "1912", "Titanic"),
  n(HIS, "medium", "In what year did the Berlin Wall fall?", "1989", "Fall of the Berlin Wall"),
  q(HIS, "easy", "Who was the first President of the United States?", "George Washington", "George Washington", { accept: ["Washington"] }),
  n(HIS, "medium", "In what year did Christopher Columbus first reach the Americas?", "1492", "Christopher Columbus"),
  n(HIS, "hard", "In what year was Magna Carta sealed?", "1215", "Magna Carta"),
  q(HIS, "easy", "The pyramids of Giza are in which country?", "Egypt", "Giza pyramid complex"),
  q(HIS, "hard", "Who was the first Roman emperor?", "Augustus", "Augustus", { accept: ["Octavian", "Caesar Augustus"], reject: ["Julius Caesar", "Caesar"] }),
  q(HIS, "easy", "The Great Wall is in which country?", "China", "Great Wall of China"),
  q(HIS, "easy", "Which brothers made the first powered aeroplane flight in 1903?", "The Wright brothers", "Wright brothers", { accept: ["Wright", "Orville and Wilbur Wright", "Wilbur and Orville Wright"] }),
  q(HIS, "medium", "Cleopatra was the last ruler of which ancient kingdom?", "Ptolemaic Egypt", "Cleopatra", { accept: ["Egypt", "Ptolemaic Kingdom", "Ancient Egypt"] }),
  n(HIS, "hard", "In what year did the French Revolution begin?", "1789", "French Revolution"),
  q(HIS, "medium", "Who received the first US patent for the telephone, in 1876?", "Alexander Graham Bell", "Alexander Graham Bell", { accept: ["Graham Bell", "Bell"], askAbout: ["Antonio Meucci", "Meucci", "Elisha Gray"] }),
  n(HIS, "hard", "In what year did the Soviet Union break up?", "1991", "Dissolution of the Soviet Union"),
  q(HIS, "medium", "Who brought the movable-type printing press to Europe around 1440?", "Johannes Gutenberg", "Johannes Gutenberg", { accept: ["Gutenberg"] }),
  q(HIS, "medium", "Who is the longest-reigning monarch in British history?", "Elizabeth II", "Elizabeth II", { accept: ["Queen Elizabeth II", "Elizabeth the Second", "Elizabeth 2", "Queen Elizabeth 2"], askAbout: ["Elizabeth", "Queen Elizabeth"], reject: ["Victoria", "Queen Victoria", "Elizabeth I"] }),
  q(HIS, "medium", "Which of the Seven Wonders of the Ancient World stood at the harbour of Alexandria?", "The Lighthouse of Alexandria", "Lighthouse of Alexandria", { accept: ["Lighthouse", "Pharos", "Pharos of Alexandria"] }),
  n(HIS, "medium", "In what year did the first iPhone go on sale?", "2007", "IPhone (1st generation)"),

  // Video games
  q(VG, "easy", "What is the name of Mario's brother?", "Luigi", "Luigi"),
  q(VG, "easy", "In The Legend of Zelda series, what is the name of the hero you usually play as?", "Link", "Link (The Legend of Zelda)", { reject: ["Zelda"] }),
  q(VG, "easy", "What type is Pikachu?", "Electric", "Pikachu"),
  q(VG, "easy", "In Pokémon Red and Blue, name one of the three Pokémon you can choose as your starter.", "Bulbasaur", "Pokémon Red, Blue, and Yellow", { accept: ["Charmander", "Squirtle"], reject: ["Pikachu"] }),
  q(VG, "easy", "In Minecraft, what is the name of the green mob that hisses and explodes?", "Creeper", "Creeper (Minecraft)"),
  q(VG, "medium", "Tetris was created in 1984 in which country?", "The Soviet Union", "Tetris", { accept: ["Soviet Union", "USSR", "Russia"], reject: ["Japan"] }),
  q(VG, "easy", "What colour is Sonic the Hedgehog?", "Blue", "Sonic the Hedgehog (character)"),
  q(VG, "medium", "Name one of the four ghosts in the original Pac-Man.", "Blinky", "Ghosts (Pac-Man)", { accept: ["Pinky", "Inky", "Clyde"] }),
  n(VG, "hard", "In what year was Nintendo founded, as a playing card company?", "1889", "Nintendo"),
  q(VG, "hard", "In Mario Kart, what is the official name of the item everyone calls the blue shell?", "Spiny Shell", "Spiny Shell", { accept: ["Spiny"] }),
  n(VG, "medium", "How many tracks does Mario Kart 8 Deluxe have with the full Booster Course Pass?", "96", "Mario Kart 8 Deluxe"),
  q(VG, "medium", "Grand Theft Auto V is set in a city based on Los Angeles. What is the city called?", "Los Santos", "Grand Theft Auto V", { reject: ["Liberty City", "Vice City", "San Andreas"] }),
  q(VG, "medium", "What is the name of the armoured hero of the Halo series?", "Master Chief", "Master Chief (Halo)", { accept: ["John-117", "Chief", "John"] }),
  q(VG, "hard", "In Portal, what is the name of the company that runs the test chambers?", "Aperture Science", "Portal (video game)", { accept: ["Aperture"], reject: ["Black Mesa"] }),
  q(VG, "easy", "In Among Us, what are the players secretly sabotaging the crew called?", "Impostors", "Among Us", { accept: ["Impostor", "Imposter", "Imposters"] }),
  q(VG, "easy", "In Fortnite Battle Royale, what do players jump out of at the start of a match?", "The Battle Bus", "Fortnite Battle Royale", { accept: ["Battle Bus", "Bus"] }),
  n(VG, "medium", "In what year did the original Nintendo Switch come out?", "2017", "Nintendo Switch"),
  q(VG, "hard", "In the 1981 arcade game Donkey Kong, the character who became Mario was called what?", "Jumpman", "Mario"),
  q(VG, "easy", "What colour is Kirby?", "Pink", "Kirby (character)"),
  q(VG, "medium", "What is the name of the kingdom in most Legend of Zelda games?", "Hyrule", "Hyrule"),
  n(VG, "medium", "How many Pokémon were in the very first Pokémon games?", "151", "List of generation I Pokémon"),
  q(VG, "hard", "In Stardew Valley, what is the town next to your farm called?", "Pelican Town", "Stardew Valley"),
  q(VG, "easy", "What is the name of Mario's green dinosaur friend?", "Yoshi", "Yoshi"),
  q(VG, "easy", "Which company made Overwatch?", "Blizzard Entertainment", "Overwatch (video game)", { accept: ["Blizzard"] }),
  q(VG, "easy", "Which princess does Mario usually set out to rescue?", "Princess Peach", "Princess Peach", { accept: ["Peach", "Princess Toadstool", "Toadstool"], reject: ["Daisy", "Princess Daisy", "Zelda", "Rosalina"] }),
  n(VG, "hard", "In what year did Pac-Man first come out in arcades?", "1980", "Pac-Man"),
  q(VG, "easy", "Which company makes the PlayStation?", "Sony", "PlayStation"),
  q(VG, "medium", "In Minecraft, which block do you need to build the frame of a Nether portal?", "Obsidian", "Minecraft"),
  q(VG, "easy", "In Animal Crossing: New Horizons, who runs Resident Services and sold you your island getaway?", "Tom Nook", "Tom Nook", { accept: ["Nook"], reject: ["Isabelle", "Timmy", "Tommy"] }),
  q(VG, "easy", "Which company makes the Xbox?", "Microsoft", "Xbox"),
  q(VG, "easy", "In Super Mario games, which item makes Mario grow bigger?", "Super Mushroom", "Super Mushroom", { accept: ["Mushroom"] }),
  n(VG, "medium", "How many racers are in a full race in Mario Kart World?", "24", "Mario Kart World"),
  q(VG, "easy", "Which Mario Kart game launched alongside the Nintendo Switch 2?", "Mario Kart World", "Mario Kart World", { reject: ["Mario Kart 8 Deluxe", "Mario Kart 9"] }),
  q(VG, "medium", "Which Pokémon is number 25 in the National Pokédex?", "Pikachu", "Pikachu"),

  // Movies & TV
  q(TV, "easy", "In Toy Story, what is the name of the cowboy doll?", "Woody", "Woody (Toy Story)", { accept: ["Sheriff Woody"], reject: ["Buzz", "Buzz Lightyear"] }),
  q(TV, "easy", "In The Lion King, what is the name of Simba's father?", "Mufasa", "Mufasa", { reject: ["Scar"] }),
  q(TV, "easy", "In Frozen, what is the name of the talking snowman?", "Olaf", "Olaf (Frozen)"),
  q(TV, "easy", "In Star Wars, who is Darth Vader's son?", "Luke Skywalker", "Luke Skywalker", { accept: ["Luke"], reject: ["Han Solo", "Kylo Ren", "Ben Solo"] }),
  q(TV, "easy", "In The Wizard of Oz, what is the name of Dorothy's dog?", "Toto", "Toto (Oz)"),
  q(TV, "easy", "In Shrek, which talking animal becomes Shrek's sidekick?", "Donkey", "Donkey (Shrek)", { reject: ["Puss in Boots", "Puss", "Dragon"] }),
  q(TV, "medium", "Who directed the 1997 film Titanic?", "James Cameron", "Titanic (1997 film)", { accept: ["Cameron"] }),
  q(TV, "medium", "In Friends, what is the name of the coffee shop the friends hang out in?", "Central Perk", "Central Perk"),
  q(TV, "easy", "In which town do The Simpsons live?", "Springfield", "Springfield (The Simpsons)"),
  q(TV, "easy", "Which Hogwarts house is Harry Potter sorted into?", "Gryffindor", "Gryffindor"),
  q(TV, "medium", "Who directed Jurassic Park (1993)?", "Steven Spielberg", "Jurassic Park (film)", { accept: ["Spielberg"] }),
  q(TV, "easy", "In Finding Nemo, what kind of fish is Nemo?", "Clownfish", "Finding Nemo", { accept: ["Clown fish", "Clown", "Anemonefish"] }),
  q(TV, "medium", "In The Office (US), what is the name of the paper company?", "Dunder Mifflin", "Dunder Mifflin"),
  q(TV, "medium", "In Stranger Things, what is the name of the town in Indiana where the story is set?", "Hawkins", "Stranger Things"),
  q(TV, "easy", "In Pixar's Up, what lifts Carl's house into the sky?", "Balloons", "Up (2009 film)"),
  n(TV, "medium", "In Back to the Future, how fast in miles per hour must the DeLorean go to travel in time?", "88", "Back to the Future"),
  n(TV, "medium", "In what year did The Super Mario Bros. Movie come out in cinemas?", "2023", "The Super Mario Bros. Movie"),
  q(TV, "easy", "What is the name of the underwater town where SpongeBob SquarePants lives?", "Bikini Bottom", "SpongeBob SquarePants"),
  q(TV, "medium", "Who voiced Mario in The Super Mario Bros. Movie (2023)?", "Chris Pratt", "The Super Mario Bros. Movie", { accept: ["Pratt"], reject: ["Charles Martinet"] }),
  q(TV, "easy", "In the 1939 film The Wizard of Oz, what colour are Dorothy's slippers?", "Ruby red", "Ruby slippers", { accept: ["Red", "Ruby"], reject: ["Silver"] }),

  // Music
  n(MUS, "easy", "How many members were in The Beatles?", "4", "The Beatles", { accept: ["four"] }),
  q(MUS, "easy", "The Beatles formed in which English city?", "Liverpool", "The Beatles", { reject: ["London", "Manchester"] }),
  q(MUS, "easy", "Which singer was known as the King of Pop?", "Michael Jackson", "Michael Jackson", { accept: ["Jackson", "MJ"] }),
  q(MUS, "easy", "Which singer was known as the King of Rock and Roll?", "Elvis Presley", "Elvis Presley", { accept: ["Elvis"] }),
  q(MUS, "easy", "Who was the lead singer of the band Queen?", "Freddie Mercury", "Freddie Mercury", { accept: ["Freddie", "Mercury"] }),
  n(MUS, "easy", "How many strings does a standard guitar have?", "6", "Guitar", { accept: ["six"] }),
  q(MUS, "medium", "Mozart was born in Salzburg. In which present-day country is Salzburg?", "Austria", "Wolfgang Amadeus Mozart", { reject: ["Germany"] }),
  q(MUS, "medium", "What is the largest and lowest brass instrument in an orchestra?", "Tuba", "Tuba", { reject: ["Trombone", "Sousaphone"] }),
  q(MUS, "easy", "The pop group ABBA came from which country?", "Sweden", "ABBA", { reject: ["Norway", "Denmark"] }),
  n(MUS, "medium", "How many lines are on a standard musical staff?", "5", "Staff (music)", { accept: ["five"] }),
  n(MUS, "hard", "In what year was Michael Jackson's album Thriller released?", "1982", "Thriller (album)"),
  q(MUS, "medium", "Which composer kept writing music after going almost completely deaf?", "Ludwig van Beethoven", "Ludwig van Beethoven", { accept: ["Beethoven"] }),
  q(MUS, "medium", "Who is the lead singer of the Rolling Stones?", "Mick Jagger", "Mick Jagger", { accept: ["Jagger"], reject: ["Keith Richards"] }),
  q(MUS, "easy", "Bob Marley is the most famous name in which style of music?", "Reggae", "Bob Marley"),
  q(MUS, "medium", "Which orchestra instrument has 47 strings and seven pedals?", "Harp", "Pedal harp", { accept: ["Concert harp", "Pedal harp"] }),

  // Sports
  n(SP, "easy", "How many players does each team have on the pitch in a game of soccer?", "11", "Association football", { accept: ["eleven"] }),
  n(SP, "easy", "How many players does each basketball team have on the court?", "5", "Basketball", { accept: ["five"] }),
  n(SP, "easy", "How many holes are played in a standard round of golf?", "18", "Golf", { accept: ["eighteen"] }),
  n(SP, "medium", "How long is a marathon, in miles?", "26.2", "Marathon", { askAbout: ["26"] }),
  n(SP, "medium", "How many Grand Slam tournaments are in a tennis season?", "4", "Grand Slam (tennis)", { accept: ["four"] }),
  n(SP, "easy", "How many years apart are the Summer Olympics usually held?", "4", "Summer Olympic Games", { accept: ["four"] }),
  n(SP, "easy", "How many pins are used in ten-pin bowling?", "10", "Ten-pin bowling", { accept: ["ten"] }),
  n(SP, "medium", "What is the highest score possible in a game of ten-pin bowling?", "300", "Perfect game (bowling)"),
  q(SP, "easy", "In ice hockey, what is the rubber disc called?", "Puck", "Hockey puck"),
  n(SP, "medium", "How many players are on a cricket team on the field?", "11", "Cricket", { accept: ["eleven"] }),
  n(SP, "easy", "In baseball, how many strikes make an out?", "3", "Strikeout", { accept: ["three"] }),
  q(SP, "easy", "The Tour de France is a race in which sport?", "Cycling", "Tour de France", { accept: ["Bike racing", "Biking", "Road cycling"] }),
  n(SP, "medium", "How high is a regulation basketball hoop, in feet?", "10", "Basketball", { accept: ["ten"] }),
  q(SP, "medium", "Which city hosted the first modern Olympic Games in 1896?", "Athens", "1896 Summer Olympics", { reject: ["Paris", "Olympia"] }),
  q(SP, "easy", "Sumo wrestling comes from which country?", "Japan", "Sumo"),
  q(SP, "easy", "In which sport would you see a slam dunk?", "Basketball", "Slam dunk"),
  n(SP, "easy", "How many points is a touchdown worth in American football, before the extra point?", "6", "Touchdown", { accept: ["six"] }),

  // Food & drink
  q(FD, "easy", "Which fruit is the main ingredient in guacamole?", "Avocado", "Guacamole"),
  q(FD, "easy", "Sushi comes from which country?", "Japan", "Sushi"),
  q(FD, "medium", "Pizza Margherita is traditionally linked with which Italian city?", "Naples", "Pizza Margherita", { accept: ["Napoli"], reject: ["Rome", "Milan"] }),
  q(FD, "easy", "Paella comes from which country?", "Spain", "Paella"),
  q(FD, "easy", "Hummus is made mainly from which legume?", "Chickpeas", "Hummus", { accept: ["Chickpea", "Garbanzo beans", "Garbanzo"] }),
  q(FD, "hard", "The spice saffron comes from which flower?", "Crocus", "Saffron", { accept: ["Saffron crocus"] }),
  q(FD, "easy", "Tofu is made from which bean?", "Soybeans", "Tofu", { accept: ["Soy", "Soya", "Soybean", "Soya beans"] }),
  q(FD, "easy", "Champagne comes from a region of which country?", "France", "Champagne (wine)"),
  q(FD, "easy", "Kimchi is a traditional dish from which country?", "Korea", "Kimchi", { accept: ["South Korea"] }),
  { category: FD, difficulty: "medium", kind: "choice", prompt: "Botanically speaking, is a banana a berry?", answer: "Yes", options: ["Yes", "No"], sources: [wiki("Banana")] },
  { category: FD, difficulty: "medium", kind: "choice", prompt: "Botanically speaking, is a tomato a fruit or a vegetable?", answer: "Fruit", options: ["Fruit", "Vegetable"], sources: [wiki("Tomato")] },
  q(FD, "easy", "Poutine, chips with cheese curds and gravy, comes from which country?", "Canada", "Poutine"),
  q(FD, "medium", "Cheddar cheese is named after a village in which country?", "England", "Cheddar cheese", { accept: ["United Kingdom", "UK", "Britain", "Great Britain"] }),
  q(FD, "medium", "Which nut is marzipan made from?", "Almond", "Marzipan", { accept: ["Almonds"] }),
  q(FD, "easy", "Which fruit is used to make most wine?", "Grapes", "Wine", { accept: ["Grape"] }),
  q(FD, "medium", "Miso, used in miso soup, is made mainly from which fermented bean?", "Soybeans", "Miso", { accept: ["Soy", "Soya", "Soybean"] }),

  // Words & numbers
  n(WN, "easy", "What number does the Roman numeral L stand for?", "50", "Roman numerals"),
  q(WN, "easy", "Which Roman numeral stands for 100?", "C", "Roman numerals"),
  n(WN, "medium", "Which year is written MMXX in Roman numerals?", "2020", "Roman numerals"),
  n(WN, "easy", "How many letters are in the English alphabet?", "26", "English alphabet"),
  q(WN, "easy", "What are the first three digits of pi?", "3.14", "Pi", { accept: ["314", "3 14"] }),
  n(WN, "easy", "How many years are in a century?", "100", "Century", { accept: ["hundred", "one hundred"] }),
  n(WN, "medium", "How many items are in a gross?", "144", "Gross (unit)"),
  n(WN, "medium", "How many days are in a fortnight?", "14", "Fortnight", { accept: ["fourteen"] }),
  n(WN, "easy", "What is the square root of 144?", "12", "Square root", { accept: ["twelve"] }),
  n(WN, "medium", "What is the smallest prime number?", "2", "Prime number", { accept: ["two"], reject: ["1", "one"] }),
  n(WN, "easy", "The angles inside a triangle add up to how many degrees?", "180", "Triangle"),
  n(WN, "medium", "In binary, which ordinary number is written as 10?", "2", "Binary number", { accept: ["two"] }),
  q(WN, "medium", "What is the name for a group of crows?", "A murder", "Murder of crows", { accept: ["Murder"] }),
  q(WN, "easy", "What is the name for a group of lions?", "A pride", "Lion", { accept: ["Pride"] }),
  q(WN, "easy", "What is the plural of mouse, the animal?", "Mice", "Mouse"),
  n(WN, "easy", "What is 15% of 200?", "30", "Percentage", { accept: ["thirty"] }),
  q(WN, "medium", "What is a word that reads the same forwards and backwards, like 'level', called?", "Palindrome", "Palindrome"),
];

// ─── picture questions (our randomizer art) ────────────────────────────────

type Pic = [file: string, answer: string, difficulty: PackQuestion["difficulty"], extra?: Pick<PackQuestion, "accept" | "askAbout" | "reject">];

const SMASH: Pic[] = [
  ["mario", "Mario", "easy", { reject: ["Luigi", "Dr. Mario"] }],
  ["luigi", "Luigi", "easy", { reject: ["Mario"] }],
  ["peach", "Princess Peach", "easy", { accept: ["Peach"], reject: ["Daisy", "Princess Daisy", "Rosalina"] }],
  ["bowser", "Bowser", "easy", { accept: ["King Koopa"], reject: ["Bowser Jr", "Bowser Junior"] }],
  ["yoshi", "Yoshi", "easy"],
  ["donkey-kong", "Donkey Kong", "easy", { accept: ["DK"], reject: ["Diddy Kong", "Diddy"] }],
  ["link", "Link", "easy", { reject: ["Zelda", "Toon Link", "Young Link"] }],
  ["kirby", "Kirby", "easy"],
  ["pikachu", "Pikachu", "easy", { reject: ["Pichu", "Raichu"] }],
  ["pac-man", "Pac-Man", "easy"],
  ["sonic", "Sonic", "easy", { accept: ["Sonic the Hedgehog"] }],
  ["samus", "Samus Aran", "easy", { accept: ["Samus"], reject: ["Metroid"] }],
  ["mega-man", "Mega Man", "easy", { accept: ["Rockman"] }],
  ["steve", "Steve", "easy", { accept: ["Minecraft Steve"], reject: ["Alex"] }],
  ["inkling", "Inkling", "easy", { accept: ["Inkling Girl", "Inkling Boy", "Inkling Squid"], askAbout: ["Splatoon"] }],
  ["villager", "Villager", "easy", { accept: ["Animal Crossing Villager"] }],
  ["isabelle", "Isabelle", "easy"],
  ["jigglypuff", "Jigglypuff", "easy"],
  ["wario", "Wario", "easy", { reject: ["Waluigi"] }],
  ["diddy-kong", "Diddy Kong", "easy", { accept: ["Diddy"], reject: ["Donkey Kong", "DK"] }],
  ["captain-falcon", "Captain Falcon", "medium", { accept: ["Falcon"] }],
  ["fox", "Fox McCloud", "medium", { accept: ["Fox"], reject: ["Falco", "Wolf"] }],
  ["ness", "Ness", "medium", { reject: ["Lucas"] }],
  ["snake", "Solid Snake", "medium", { accept: ["Snake"] }],
  ["cloud", "Cloud Strife", "medium", { accept: ["Cloud"] }],
  ["king-k-rool", "King K. Rool", "medium", { accept: ["K. Rool", "K Rool", "King K Rool"] }],
  ["olimar", "Captain Olimar", "medium", { accept: ["Olimar"] }],
  ["bayonetta", "Bayonetta", "medium"],
  ["pit", "Pit", "medium", { reject: ["Dark Pit"] }],
  ["ryu", "Ryu", "medium", { reject: ["Ken"] }],
  ["banjo-and-kazooie", "Banjo and Kazooie", "medium", { accept: ["Banjo-Kazooie", "Banjo"] }],
  ["king-dedede", "King Dedede", "medium", { accept: ["Dedede"] }],
  ["meta-knight", "Meta Knight", "medium"],
  ["ganondorf", "Ganondorf", "medium", { accept: ["Ganon"] }],
  ["sephiroth", "Sephiroth", "medium"],
  ["mewtwo", "Mewtwo", "medium", { reject: ["Mew"] }],
  ["lucario", "Lucario", "medium"],
  ["greninja", "Greninja", "medium"],
  ["rosalina-and-luma", "Rosalina", "medium", { accept: ["Rosalina and Luma"], reject: ["Peach", "Daisy"] }],
  ["piranha-plant", "Piranha Plant", "medium"],
  ["r-o-b", "R.O.B.", "medium", { accept: ["ROB", "R O B", "Robotic Operating Buddy"] }],
  ["mr-game-and-watch", "Mr. Game & Watch", "medium", { accept: ["Mr Game and Watch", "Game and Watch", "Game & Watch"] }],
  ["duck-hunt", "Duck Hunt", "medium", { accept: ["Duck Hunt Duo", "Duck Hunt Dog"] }],
  ["ice-climbers", "Ice Climbers", "medium", { accept: ["Popo and Nana"] }],
  ["little-mac", "Little Mac", "medium"],
  ["min-min", "Min Min", "hard"],
  ["byleth", "Byleth", "hard"],
  ["shulk", "Shulk", "hard"],
  ["marth", "Marth", "hard", { reject: ["Lucina", "Roy", "Chrom", "Ike"] }],
  ["joker", "Joker", "hard"],
  ["terry", "Terry Bogard", "hard", { accept: ["Terry"] }],
  ["incineroar", "Incineroar", "hard"],
  ["wii-fit-trainer", "Wii Fit Trainer", "hard"],
  ["palutena", "Palutena", "hard"],
];

const OVERWATCH: Pic[] = [
  ["tracer", "Tracer", "medium"],
  ["mercy", "Mercy", "medium"],
  ["reinhardt", "Reinhardt", "medium"],
  ["d-va", "D.Va", "medium", { accept: ["DVa", "Dva", "D Va"] }],
  ["genji", "Genji", "medium", { reject: ["Hanzo"] }],
  ["widowmaker", "Widowmaker", "medium"],
  ["winston", "Winston", "medium"],
  ["reaper", "Reaper", "medium"],
  ["soldier-76", "Soldier: 76", "medium", { accept: ["Soldier 76", "Soldier76"], askAbout: ["Soldier"] }],
  ["mei", "Mei", "medium"],
  ["lucio", "Lúcio", "hard"],
  ["junkrat", "Junkrat", "hard", { reject: ["Roadhog"] }],
  ["bastion", "Bastion", "hard"],
  ["ana", "Ana", "hard"],
  ["pharah", "Pharah", "hard"],
  ["zenyatta", "Zenyatta", "hard"],
];

const pictures = (set: Pic[], category: PackCategory, folder: string, prompt: string, source: { title: string; url: string }): PackQuestion[] =>
  set.map(([file, answer, difficulty, extra]) => ({
    category, difficulty, kind: "picture", prompt, answer, imageUrl: `/images/${folder}/${file}.webp`, sources: [source], ...extra,
  }));

export const TRIVIA_PACK: PackQuestion[] = [
  ...TEXT,
  ...HALLOWEEN_PACK,
  ...pictures(SMASH, "Picture: game characters", "super-smash-bros-ultimate/fighters", "Name this video game character.",
    { title: "SmashWiki: Super Smash Bros. Ultimate roster", url: "https://www.ssbwiki.com/Super_Smash_Bros._Ultimate#Characters" }),
  ...pictures(OVERWATCH, "Picture: Overwatch heroes", "overwatch/heroes", "Name this Overwatch hero.",
    { title: "Overwatch heroes (Blizzard)", url: "https://overwatch.blizzard.com/en-us/heroes/" }),
];
