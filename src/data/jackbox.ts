/**
 * Jackbox Games party games, for the Jackbox picker (a fan tool; we're not
 * affiliated with Jackbox Games). Researched 2026-09-29 from jackboxgames.com
 * game pages (player counts), Jackbox's support chart "Are your games family
 * friendly?" (updated 2025-10-14) and Jackboxpedia (audience). Descriptions are
 * our own words. Client-safe.
 *
 * Kids: "filter" = the game has a family-friendly setting; "clean" = Jackbox
 * calls it family friendly by design (no setting needed); "no" = unsuitable by
 * design (horror, adult) or not rated. The kids filter keeps "filter" + "clean".
 *
 * Not yet listed: The Jackbox Party Pack 12 (out 2026-10-15: Idol Factions, We
 * Forgot a Card, Debate and Switch, MegaPals, Hyperface) and Fakin' It XL
 * (2026-11-12). Add them once they're out.
 */

export type JackboxKids = "filter" | "clean" | "no";

export interface JackboxGame {
  name: string;
  /** Every pack you can own it in; the first is where it came from. */
  packs: string[];
  minPlayers: number;
  maxPlayers: number;
  audience: boolean;
  kids: JackboxKids;
  adultsOnly: boolean;
  types: string[];
  description: string;
}

export interface JackboxPack { name: string; year: number; adultsOnly?: boolean; note?: string }

export const JACKBOX_PACKS: JackboxPack[] = [
  { name: "Party Pack 1", year: 2014 },
  { name: "Party Pack 2", year: 2015 },
  { name: "Party Pack 3", year: 2016 },
  { name: "Party Pack 4", year: 2017 },
  { name: "Party Pack 5", year: 2018 },
  { name: "Party Pack 6", year: 2019 },
  { name: "Party Pack 7", year: 2020 },
  { name: "Party Pack 8", year: 2021 },
  { name: "Party Pack 9", year: 2022 },
  { name: "Party Pack 10", year: 2023 },
  { name: "Party Pack 11", year: 2025 },
  { name: "Survey Scramble", year: 2024 },
  { name: "Naughty Pack", year: 2024, adultsOnly: true },
  { name: "Party Starter", year: 2022, note: "Quiplash 3, Tee K.O. and Trivia Murder Party 2" },
  { name: "Party Essentials", year: 2026, note: "Drawful 2, Quiplash 3 and Fibbage 4" },
  { name: "Fibbage", year: 2014 },
  { name: "Quiplash", year: 2015 },
  { name: "Drawful 2", year: 2016 },
  { name: "Quiplash 2 InterLASHional", year: 2020 },
  { name: "Trivia Murder Party 3", year: 2026, note: "Early access on PC" },
];

type Row = [name: string, packs: string[], min: number, max: number, audience: boolean, kids: JackboxKids, types: string[], description: string];

const ROWS: Row[] = [
  ["You Don't Know Jack 2015", ["Party Pack 1"], 1, 4, false, "no", ["trivia"], "A snarky quiz show where players buzz in on pop culture trivia full of wordplay and trick questions."],
  ["Drawful", ["Party Pack 1"], 3, 8, false, "no", ["drawing", "bluffing"], "Players sketch odd prompts on their phones, then everyone writes fake titles to lure the group away from the real one."],
  ["Word Spud", ["Party Pack 1"], 2, 8, false, "no", ["word", "voting"], "Players take turns extending a running chain of words while the group votes each addition up or down."],
  ["Lie Swatter", ["Party Pack 1"], 1, 100, false, "no", ["trivia"], "A fast true or false trivia game: judge odd facts correctly before the timer runs out."],
  ["Fibbage XL", ["Party Pack 1"], 2, 8, false, "no", ["bluffing", "trivia"], "Invent believable fake answers to obscure trivia and score by fooling others or spotting the truth."],
  ["Fibbage 2", ["Party Pack 2"], 2, 8, true, "filter", ["bluffing", "trivia"], "The second lie-writing trivia game: craft fake answers to strange facts and try to find the real one."],
  ["Earwax", ["Party Pack 2"], 3, 8, true, "filter", ["party", "voting"], "Answer prompts by pairing sound effects, and a rotating judge picks the funniest combo."],
  ["Bidiots", ["Party Pack 2"], 3, 6, false, "clean", ["drawing", "party"], "An art auction: draw pieces, then bid on everyone's drawings using secret knowledge of what each is worth."],
  ["Quiplash XL", ["Party Pack 2"], 3, 8, true, "filter", ["writing", "voting"], "Two players answer the same prompt and the room votes for the funnier line."],
  ["Bomb Corp.", ["Party Pack 2"], 1, 4, false, "clean", ["party"], "A cooperative puzzle game where interns share scattered rules on their phones to defuse bombs."],
  ["Quiplash 2", ["Party Pack 3"], 3, 8, true, "filter", ["writing", "voting"], "Head-to-head joke writing: pairs answer prompts and everyone votes for the better line."],
  ["Trivia Murder Party", ["Party Pack 3"], 1, 8, true, "no", ["trivia"], "Horror-themed trivia where wrong answers send you to deadly minigames and the dead race the living to escape."],
  ["Guesspionage", ["Party Pack 3"], 2, 8, true, "filter", ["trivia"], "Guess what percentage of people answered a survey question a certain way while others bet higher or lower."],
  ["Fakin' It", ["Party Pack 3"], 3, 6, true, "filter", ["social deduction", "bluffing"], "Everyone gets a secret task except one faker, who has to blend in while the group tries to catch them."],
  ["Tee K.O.", ["Party Pack 3", "Party Starter"], 3, 8, true, "clean", ["drawing", "writing"], "Draw pictures and write slogans, combine them into T-shirts, and battle the shirts in head-to-head votes."],
  ["Fibbage 3", ["Party Pack 4"], 2, 8, true, "filter", ["bluffing", "trivia"], "The third lie-writing trivia game, with a mode where the questions are about the players themselves."],
  ["Survive the Internet", ["Party Pack 4"], 3, 8, true, "filter", ["writing", "voting"], "Answer innocent questions, then twist each other's answers into out-of-context fake posts."],
  ["Monster Seeking Monster", ["Party Pack 4"], 3, 7, true, "no", ["writing", "social deduction"], "A dating game where monsters text each other to land dates while hidden powers change the romance."],
  ["Bracketeering", ["Party Pack 4"], 3, 16, true, "filter", ["writing", "voting"], "Answers go into a tournament bracket and players bet on which ones win each matchup."],
  ["Civic Doodle", ["Party Pack 4"], 3, 8, true, "clean", ["drawing", "voting"], "Take turns adding to a shared mural while the group votes on whose additions improve it."],
  ["You Don't Know Jack: Full Stream", ["Party Pack 5"], 1, 8, true, "no", ["trivia"], "The irreverent quiz show, modernized, with wordplay questions, screw moves and an audience that plays along."],
  ["Split the Room", ["Party Pack 5"], 3, 8, true, "filter", ["writing", "voting"], "Finish hypothetical dilemmas in ways meant to divide the group as close to evenly as possible."],
  ["Mad Verse City", ["Party Pack 5"], 3, 8, true, "filter", ["writing", "voting"], "Giant robots rap battle: write rhyming lines and a robot voice performs them."],
  ["Zeeple Dome", ["Party Pack 5"], 1, 6, true, "clean", ["party"], "A physics action game: fling your character across an alien arena to hit targets and beat monsters."],
  ["Patently Stupid", ["Party Pack 5"], 3, 8, true, "clean", ["drawing", "writing"], "Invent and sketch silly solutions to problems, then pitch them to win investment money."],
  ["Trivia Murder Party 2", ["Party Pack 6", "Party Starter"], 1, 8, true, "no", ["trivia"], "The deadly trivia sequel, set in a haunted hotel with new killing-floor minigames and a final escape race."],
  ["Role Models", ["Party Pack 6"], 3, 6, true, "filter", ["voting"], "Assign each other roles within a theme and find out how the group really sees you."],
  ["Joke Boat", ["Party Pack 6"], 3, 8, true, "filter", ["writing", "voting"], "Build jokes from word lists and setups, then perform them on a cruise-ship comedy stage."],
  ["Dictionarium", ["Party Pack 6"], 3, 8, true, "clean", ["writing", "word"], "Define made-up words, write synonyms for the winning definitions, then use them in sentences."],
  ["Push the Button", ["Party Pack 6"], 4, 10, false, "filter", ["social deduction"], "Humans on a spaceship run tests to expose hidden aliens, who get slightly different prompts and must stay undetected."],
  ["Quiplash 3", ["Party Pack 7", "Party Starter", "Party Essentials"], 3, 8, true, "filter", ["writing", "voting"], "The third head-to-head joke game, with a final round where everyone answers the same prompt."],
  ["The Devils and the Details", ["Party Pack 7"], 3, 8, true, "filter", ["party"], "A cooperative chaos game: a family of devils splits the chores and has to talk constantly to finish them."],
  ["Champ'd Up", ["Party Pack 7"], 3, 8, true, "filter", ["drawing", "voting"], "Draw champions for odd titles, then draw challengers against each other's champions in voted matchups."],
  ["Talking Points", ["Party Pack 7"], 3, 8, true, "filter", ["party"], "One player improvises a speech while an assistant feeds them surprise slides they've never seen."],
  ["Blather 'Round", ["Party Pack 7"], 2, 6, true, "clean", ["word", "trivia"], "Describe a secret person, place or thing using limited sentence templates while others guess it."],
  ["Drawful Animate", ["Party Pack 8"], 3, 10, true, "filter", ["drawing", "bluffing"], "Drawful with two-frame animated doodles, and fake titles for each loop."],
  ["The Wheel of Enormous Proportions", ["Party Pack 8"], 2, 8, true, "filter", ["trivia"], "Answer trivia in different formats to earn slices you place on a giant wheel for points."],
  ["Job Job", ["Party Pack 8"], 3, 10, true, "filter", ["writing", "voting"], "Answer icebreakers, then reuse words from each other's answers to build job interview replies."],
  ["The Poll Mine", ["Party Pack 8"], 2, 10, true, "filter", ["voting"], "Teams guess how the group ranked answers to secret polls while exploring a mine full of doors."],
  ["Weapons Drawn", ["Party Pack 8"], 4, 8, true, "clean", ["drawing", "social deduction"], "A murder mystery: hide letters of your name inside drawings used as weapons while solving others' cases."],
  ["Fibbage 4", ["Party Pack 9", "Party Essentials"], 2, 8, true, "filter", ["bluffing", "trivia"], "The fourth lie-writing trivia game, with video questions and a final round about spotting the fake fact."],
  ["Roomerang", ["Party Pack 9"], 4, 9, true, "filter", ["writing", "voting"], "A reality TV parody: answer prompts as your character and vote each other out of the house."],
  ["Junktopia", ["Party Pack 9"], 3, 8, true, "filter", ["writing", "bluffing"], "Write backstories for junk and pitch it to buyers to get the most value out of your objects."],
  ["Nonsensory", ["Party Pack 9"], 3, 8, true, "filter", ["drawing", "writing"], "Draw or write answers aimed at a secret spot on a scale while others guess where you meant."],
  ["Quixort", ["Party Pack 9"], 1, 10, true, "filter", ["trivia"], "Teams sort falling blocks of trivia answers into the right order, like dates or sizes."],
  ["Tee K.O. 2", ["Party Pack 10"], 3, 8, true, "filter", ["drawing", "writing"], "The T-shirt battle sequel: combine drawings and slogans into shirts, with new ways to remix designs."],
  ["Timejinx", ["Party Pack 10"], 1, 8, true, "filter", ["trivia"], "Time travel trivia: guess the year things happened and score by getting close."],
  ["FixyText", ["Party Pack 10"], 3, 8, true, "filter", ["writing"], "Everyone types into the same text message at once to write replies to awkward situations."],
  ["Dodo Re Mi", ["Party Pack 10"], 1, 9, true, "filter", ["party"], "A rhythm game: pick an instrument and tap notes on your phone to play a song as a band."],
  ["Hypnotorious", ["Party Pack 10"], 4, 8, true, "filter", ["social deduction"], "Role-play secret identities to find your group while one outlier tries to blend in."],
  ["Doominate", ["Party Pack 11"], 3, 8, true, "filter", ["writing", "voting"], "Head-to-head writing: take pleasant situations and write the funniest way to ruin them."],
  ["Hear Say", ["Party Pack 11"], 2, 8, true, "filter", ["party", "voting"], "Record sound effects and lines on your phone to dub short movie scenes, then vote on favorites."],
  ["Cookie Haus", ["Party Pack 11"], 3, 8, true, "filter", ["drawing", "voting"], "Decorate cookies to match customer orders, then the cookies face off in head-to-head votes."],
  ["Suspectives", ["Party Pack 11"], 4, 8, true, "filter", ["social deduction"], "Survey answers become clues to a crime by one secret player; question the suspects and hold a trial."],
  ["Legends of Trivia", ["Party Pack 11"], 1, 6, true, "filter", ["trivia"], "A cooperative fantasy quest where the team answers trivia to fight monsters and survive."],
  ["The Jackbox Survey Scramble", ["Survey Scramble"], 2, 10, true, "filter", ["trivia", "word"], "A team game built on real survey data, with modes about guessing the most popular answers."],
  ["Fakin' It All Night Long", ["Naughty Pack"], 3, 8, true, "no", ["social deduction", "bluffing"], "An adults-only Fakin' It: one player doesn't know the prompt and has to fake their answers."],
  ["Dirty Drawful", ["Naughty Pack"], 3, 8, false, "no", ["drawing", "bluffing"], "An adults-only Drawful: sketch racy prompts and write fake titles to mislead the group."],
  ["Let Me Finish", ["Naughty Pack"], 3, 8, false, "no", ["drawing", "party"], "An adults-only presentation game: explain and defend what drawings mean, out loud."],
  ["Fibbage", ["Fibbage"], 2, 8, false, "no", ["bluffing", "trivia"], "The original lie-writing trivia game: invent fake answers to real but strange facts."],
  ["Quiplash", ["Quiplash"], 3, 8, true, "filter", ["writing", "voting"], "The original head-to-head joke game: two players answer a prompt and everyone votes."],
  ["Drawful 2", ["Drawful 2", "Party Essentials"], 3, 8, true, "filter", ["drawing", "bluffing"], "The drawing and fake-title game, with two colors per sketch and custom prompt episodes."],
  ["Quiplash 2 InterLASHional", ["Quiplash 2 InterLASHional"], 3, 8, true, "filter", ["writing", "voting"], "Quiplash 2 with prompts written for French, German, Italian and Spanish players."],
  ["Trivia Murder Party 3", ["Trivia Murder Party 3"], 1, 8, false, "no", ["trivia"], "Horror trivia at an abandoned summer camp, with deadly punishment minigames."],
];

const ADULT_PACKS = new Set(JACKBOX_PACKS.filter((p) => p.adultsOnly).map((p) => p.name));

export const JACKBOX_GAMES: JackboxGame[] = ROWS.map(([name, packs, minPlayers, maxPlayers, audience, kids, types, description]) => ({
  name, packs, minPlayers, maxPlayers, audience, kids, types, description, adultsOnly: packs.some((p) => ADULT_PACKS.has(p)),
}));
