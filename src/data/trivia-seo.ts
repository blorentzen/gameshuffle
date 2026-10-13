/**
 * Trivia pages for search (approved 2026-10-13, picks
 * https://claude.ai/artifact/9S5kJoWxcTHjLG4373J7iJ): the occasion pages, the
 * /trivia FAQ for visitors, the game question topics and the team name lists.
 * Search figures that picked these pages (SE Ranking, US, October 2026): trivia
 * night 9,900 a month, trivia team names 6,600, funny trivia team names 1,300,
 * office trivia 990, trivia answer sheet 590, how to host a trivia night 320.
 *
 * Copy rules: plain words, no dashes, and nothing a trivia night can't do today.
 */

export const TRIVIA_PATH = "/trivia";
export const TRIVIA_CHECKED = "2026-10-13";

export interface Faq { q: string; a: string }

/** /trivia for visitors: what people ask before they host. */
export const LANDING_FAQ: Faq[] = [
  { q: "Is it free to host a trivia night?", a: "Yes. Hosting is free with a GameShuffle account: build the rounds, run the room, and let teams play on their phones. GS Pro adds AI question drafting and running trivia on your Twitch stream." },
  { q: "Do players need to download an app?", a: "No. Teams join in the phone's browser with a short code or by scanning the QR code on the TV. They don't need an account either." },
  { q: "Can I use my own questions?", a: "Yes. Write your own, fill rounds from GameShuffle's checked question pack, or (with GS Pro) have AI draft questions that you approve one by one. Your questions stay in your library for next time." },
  { q: "How many teams can play?", a: "Up to 40 teams in the room, each answering on one phone (teammates can follow along on their own). On stream, up to 3,000 viewers play as their own teams." },
  { q: "Can I run trivia on Twitch or Discord?", a: "Yes, with GS Pro. Viewers answer in Twitch chat, on your live page or in Discord, all into one scoreboard, and answers stay hidden until you reveal them, so stream delay doesn't matter." },
  { q: "How is it different from Kahoot?", a: "Kahoot rewards the fastest tap. A GameShuffle trivia night works like a real pub quiz: everyone gets the same time to answer, teams can play a joker round for double points, bet on a final question, and the host judges close answers in one tap." },
];

export interface OccasionPage {
  slug: string;
  /** The TEMPLATES id it starts from. */
  templateId: string;
  label: string;
  h1: string;
  title: string;
  description: string;
  lede: string;
  facts: string[];
  howTo: { title: string; text: string }[];
  tips: string[];
  faq: Faq[];
  /** Sample questions come from these pack categories. */
  sampleCategories: string[];
}

export const OCCASIONS: OccasionPage[] = [
  {
    slug: "office-trivia-night",
    templateId: "office",
    label: "Office trivia",
    h1: "Office trivia night",
    title: "Office Trivia Night: Free Template and Questions",
    description: "Run an office trivia night in a lunch hour: four family-safe rounds of 6, a picture round, teams on their phones and scoring done for you. Free to host, works on a video call too.",
    lede: "Four family-safe rounds of 6 that fit a lunch hour, with a picture round and a quick lightning round to finish. Teams answer on their phones, the scores add up on their own, and it works just as well on a video call as in a meeting room.",
    facts: ["4 rounds of 6", "About 45 minutes", "Family-safe questions", "No wagers or bets", "In the room or on a call"],
    howTo: [
      { title: "Pick a time and teams", text: "Book a lunch hour or the last part of a team meeting. Teams of 3 to 5 work well; mix departments so it's not one floor against another." },
      { title: "Start from the template", text: "The Office template sets up the rounds. Fill them from the checked question pack in one tap, or swap in questions about your own company." },
      { title: "Share the code", text: "Put the TV view on the meeting room screen, or share it on the call. Each team joins on one phone with the code or the QR code." },
      { title: "Run it from your phone", text: "Open each question, lock answers when time's up, and judge close answers in one tap. The TV shows the reveal and the standings between rounds." },
    ],
    tips: [
      "Add a round about your workplace: who's been here longest, the year the office opened, the most-used meeting room. People love it.",
      "Keep teams to five or fewer so everyone has a say.",
      "On a call, ask each team to pick one person to answer and keep their camera on.",
      "Have a small prize ready: first pick of the snacks works.",
    ],
    faq: [
      { q: "How long does an office trivia night take?", a: "About 45 minutes for the four rounds of 6, which leaves room for a lunch break. The lightning round runs on 20 seconds a question to keep the end quick." },
      { q: "Can we play office trivia remotely?", a: "Yes. Share the TV view on your video call and teams join on their phones with the code. Everyone sees the same question at the same time." },
      { q: "Are the questions work-appropriate?", a: "The GameShuffle question pack is clean, general trivia, and you can read and swap every question before the night." },
    ],
    sampleCategories: ["General knowledge", "Geography", "Science & nature"],
  },
  {
    slug: "party-trivia",
    templateId: "party",
    label: "Party trivia",
    h1: "Party trivia night",
    title: "Party Trivia Night: Free Template for Friends",
    description: "Host a trivia night at home: five rounds with a picture round, a confidence round and a final wager. Friends play on their phones, the TV shows the questions. Free to host.",
    lede: "Five rounds for a night in with friends: general knowledge, a picture round, a confidence round where teams bet 1 to 5 on their answers, pop culture, and a final question to wager on. About 75 minutes, and the scores take care of themselves.",
    facts: ["5 rounds", "About 75 minutes", "Picture round", "Confidence round", "Final wager"],
    howTo: [
      { title: "Get the TV ready", text: "Open the TV view on the television or a laptop everyone can see. It shows the questions, the timer, the reveal and the standings." },
      { title: "Split into teams", text: "Two to five people a team. Each team joins on one phone with the code on the TV." },
      { title: "Play the joker", text: "Each team picks one round to play its joker on before it starts: every point in that round counts double." },
      { title: "Bet on the final", text: "The last question is a wager: teams bet part of their points, then answer. A comeback is always possible." },
    ],
    tips: [
      "Run the picture round second, while everyone's still warming up: it's the easiest round to talk through as a team.",
      "Keep snacks for the breaks between rounds, when the standings are on the TV.",
      "Let the team in last place pick the next category.",
    ],
    faq: [
      { q: "What's a confidence round?", a: "Five questions, and each team gives every answer a different number from 1 to 5. Right answers score the number they put on them, so teams bet big on the answers they're sure of." },
      { q: "How does the final wager work?", a: "Before the last question, each team bets some of its points. Get it right and you win the bet, get it wrong and you lose it." },
      { q: "Can kids play?", a: "Yes. The GameShuffle question pack is clean, general trivia, and you can read and swap every question before the night." },
    ],
    sampleCategories: ["Movies & TV", "Music", "Food & drink"],
  },
  {
    slug: "fundraiser-trivia-night",
    templateId: "fundraiser",
    label: "Fundraiser trivia",
    h1: "Fundraiser trivia night",
    title: "Fundraiser Trivia Night: How to Run One",
    description: "Plan a trivia night fundraiser for a school, team or charity: five family-safe rounds with jokers on every regular round and a big final wager. Free to host on GameShuffle.",
    lede: "A trivia night is one of the easiest fundraisers to run: tables of friends, a host with a microphone and a few rounds of questions. This template has five family-safe rounds, a joker on every regular round and a big final wager that keeps every table in it until the end.",
    facts: ["5 rounds", "Jokers on every round", "Family-safe questions", "Big final wager", "Up to 40 teams"],
    howTo: [
      { title: "Sell tables, not seats", text: "Teams of 6 to 8 at a table fill a room fast. Price a table so the night covers the room and the prizes, with everything else going to your cause." },
      { title: "Set up the room", text: "Put the TV view on a projector. Each table joins on one phone with the code or the QR code; nobody needs an account." },
      { title: "Run the rounds", text: "Open each question from your phone and lock answers when time's up. Close answers are one tap to judge, and the standings show between rounds." },
      { title: "Finish on the wager", text: "The final question is where tables bet their points. Hand out prizes while the room is still cheering." },
    ],
    tips: [
      "Ask local businesses for prizes and thank them by name between rounds.",
      "Keep a spare phone or tablet at the host table for any team that can't get one working.",
      "Announce the totals raised before the final question, while everyone's still there.",
    ],
    faq: [
      { q: "How many people come to a fundraiser trivia night?", a: "Most run 10 to 30 tables of 6 to 8 people. GameShuffle handles up to 40 teams in one room." },
      { q: "Can tables without a smartphone play?", a: "Each table only needs one phone between them, and nobody needs an account or an app. Keep a spare phone or tablet at the host table just in case." },
      { q: "How long should a fundraiser trivia night be?", a: "Plan two to two and a half hours with breaks. Five rounds of 8 and a final take about 90 minutes of play." },
    ],
    sampleCategories: ["History", "Geography", "Sports"],
  },
  {
    slug: "bar-trivia",
    templateId: "bar",
    label: "Bar trivia",
    h1: "Bar trivia night",
    title: "Bar Trivia Night: The Classic Weekly Format",
    description: "Run a weekly bar trivia night: seven rounds of 8, a picture round, a confidence round and a final wager. Teams play on their phones, scores update live. Free to host.",
    lede: "The classic weekly pub quiz: seven rounds of 8 with a picture round and a confidence round, then a final question to bet on. About two hours, with the scoring done for you so you can work the room.",
    facts: ["7 rounds of 8", "About two hours", "Picture and confidence rounds", "Final wager", "Up to 40 teams"],
    howTo: [
      { title: "Pick your night", text: "A quiet weeknight works best: regulars come back to the same night every week." },
      { title: "Build the rounds", text: "Start from the Bar night template, then fill rounds from the checked pack, your own library, or AI drafts you approve. Questions never repeat inside a night." },
      { title: "Put it on the screens", text: "The TV view runs on the bar's screens: question, timer, reveal and standings. Teams join with the code on the screen." },
      { title: "Keep them coming back", text: "Read out the standings at the end and the date of the next one. Give the winners a tab, and the last-place team a laugh." },
    ],
    tips: [
      "Cap teams at six so one big group doesn't win every week.",
      "Read each question twice and leave the full time; quiet rooms answer better.",
      "Keep a charger behind the bar: one dead phone shouldn't knock a team out.",
    ],
    faq: [
      { q: "How many rounds does bar trivia have?", a: "Most bar quizzes run six to eight rounds of 8 to 10 questions. This template uses seven rounds of 8 plus a final question." },
      { q: "How do you stop cheating at bar trivia?", a: "Answers are timed and lock when the clock runs out, and the host judges close answers. Ask teams to keep phones on the answer screen during a question." },
      { q: "Do you need a microphone?", a: "It helps in a busy bar, but the TV view shows every question and the timer, so teams in the back can follow along without hearing every word." },
    ],
    sampleCategories: ["General knowledge", "Movies & TV", "History"],
  },
  {
    slug: "trivia-on-stream",
    templateId: "stream",
    label: "Trivia on stream",
    h1: "Trivia on your Twitch stream",
    title: "Twitch Trivia: Run a Trivia Night on Stream",
    description: "Run trivia on your Twitch stream: chat answers with !a, viewers play on your live page or in Discord, answers stay hidden until the reveal and stream delay doesn't matter. GS Pro.",
    lede: "Three rounds of 6 built for chat: viewers answer in Twitch chat, on your live page or in Discord, all into one scoreboard. Answers stay hidden until you reveal them and every question runs 45 seconds, so stream delay never costs anyone a point.",
    facts: ["3 rounds of 6", "About 25 minutes", "45 seconds a question", "Up to 3,000 viewers", "GS Pro"],
    howTo: [
      { title: "Turn on Play it on my stream", text: "Start from the On stream template and switch on Play it on my stream. It needs GS Pro and your Twitch connected." },
      { title: "Add the overlay", text: "The trivia piece goes on your OBS overlay: the question, the countdown, the reveal and the top of the standings." },
      { title: "Chat answers", text: "Viewers type !a and their answer, or just the letter on a multiple-choice question. Nothing shows in chat, so nobody copies." },
      { title: "Reveal and repeat", text: "Lock, reveal and move on from your phone or the console. Servers that route trivia to Discord get each question as a post with buttons." },
    ],
    tips: [
      "Keep it to 25 minutes: one trivia break is better than a long one.",
      "Put a picture round in the middle; chat loves guessing a character from their picture.",
      "Shout out the leader between rounds by name.",
    ],
    faq: [
      { q: "How do viewers answer trivia on Twitch?", a: "They type !a and their answer in chat, or just the letter on a multiple-choice question. Answers are silent, so chat isn't flooded with spoilers." },
      { q: "Does stream delay matter?", a: "No. Every viewer gets the full 45 seconds and answers keep counting for a few seconds after the clock, so viewers on a delay score the same as everyone else." },
      { q: "Can my Discord play along?", a: "Yes. Servers that route the trivia category get each question as a post with answer buttons, and the GameShuffle Activity plays along in a voice call." },
    ],
    sampleCategories: ["Video games"],
  },
];

export const occasionBySlug = (slug: string) => OCCASIONS.find((o) => o.slug === slug) ?? null;
export const occasionUrl = (slug: string) => `${TRIVIA_PATH}/${slug}`;

/**
 * Game trivia question pages. Each lists approved pack questions about the game
 * (by game slug, by picture category, or by naming the game in a video games
 * question). A page only goes live once it has at least MIN_TOPIC_QUESTIONS.
 */
export interface QuestionTopic {
  slug: string;
  label: string;
  h1: string;
  title: string;
  description: string;
  gameSlugs: string[];
  /** Video games questions that name one of these count too. */
  keywords: string[];
  pictureCategories?: string[];
  /** Every approved Video games question counts (the broad page). */
  allVideoGames?: boolean;
}

export const MIN_TOPIC_QUESTIONS = 12;
export const MAX_TOPIC_QUESTIONS = 30;

export const QUESTION_TOPICS: QuestionTopic[] = [
  { slug: "mario-kart", label: "Mario Kart", h1: "Mario Kart trivia questions (with answers)", title: "Mario Kart Trivia Questions and Answers", description: "Mario Kart trivia questions with answers, checked by GameShuffle: tracks, racers, items and history across Mario Kart 8 Deluxe, Mario Kart World and the classics.", gameSlugs: ["mario-kart-8-deluxe", "mario-kart-world", "mario-kart-64"], keywords: ["mario kart"] },
  { slug: "mario", label: "Mario", h1: "Mario trivia questions (with answers)", title: "Mario Trivia Questions and Answers", description: "Super Mario trivia questions with answers: characters, games and history from Nintendo's plumber, checked by GameShuffle.", gameSlugs: ["mario-kart-8-deluxe", "mario-kart-world", "mario-kart-64", "super-mario-party-jamboree", "mario-party-superstars"], keywords: ["mario", "bowser", "luigi", "peach", "yoshi"] },
  { slug: "nintendo", label: "Nintendo", h1: "Nintendo trivia questions (with answers)", title: "Nintendo Trivia Questions and Answers", description: "Nintendo trivia questions with answers: Mario, Zelda, Pokémon, Kirby, Smash and more, checked by GameShuffle.", gameSlugs: ["mario-kart-8-deluxe", "mario-kart-world", "super-smash-bros-ultimate", "splatoon-3", "kirby-air-riders", "super-mario-party-jamboree"], keywords: ["nintendo", "mario", "zelda", "pokémon", "pokemon", "kirby", "smash", "splatoon", "metroid", "donkey kong"] },
  { slug: "pokemon", label: "Pokémon", h1: "Pokémon trivia questions (with answers)", title: "Pokémon Trivia Questions and Answers", description: "Pokémon trivia questions with answers: the games, the cards and the characters, checked by GameShuffle.", gameSlugs: ["pokemon-stadium", "pokemon-stadium-2"], keywords: ["pokémon", "pokemon", "pikachu"] },
  { slug: "mario-party", label: "Mario Party", h1: "Mario Party trivia questions (with answers)", title: "Mario Party Trivia Questions and Answers", description: "Mario Party trivia questions with answers: boards, minigames and characters from Jamboree, Superstars and the classics.", gameSlugs: ["super-mario-party-jamboree", "mario-party-superstars", "mario-party", "mario-party-2", "mario-party-3"], keywords: ["mario party"] },
  { slug: "smash", label: "Super Smash Bros.", h1: "Super Smash Bros. trivia questions (with answers)", title: "Super Smash Bros. Trivia Questions and Answers", description: "Super Smash Bros. Ultimate trivia: name the fighter from their portrait, plus questions about the series, checked by GameShuffle.", gameSlugs: ["super-smash-bros-ultimate"], keywords: ["smash"], pictureCategories: ["Picture: game characters"] },
  { slug: "overwatch", label: "Overwatch", h1: "Overwatch trivia questions (with answers)", title: "Overwatch Trivia Questions and Answers", description: "Overwatch trivia questions with answers: name the hero from their portrait, plus roles, lore and history, checked by GameShuffle.", gameSlugs: ["overwatch"], keywords: ["overwatch"], pictureCategories: ["Picture: Overwatch heroes"] },
  { slug: "marvel-rivals", label: "Marvel Rivals", h1: "Marvel Rivals trivia questions (with answers)", title: "Marvel Rivals Trivia Questions and Answers", description: "Marvel Rivals trivia questions with answers: heroes, roles, teams and seasons, checked by GameShuffle.", gameSlugs: ["marvel-rivals"], keywords: ["marvel rivals"] },
  { slug: "video-games", label: "Video games", h1: "Video game trivia questions (with answers)", title: "Video Game Trivia Questions and Answers", description: "Video game trivia questions with answers, from Nintendo classics to today's hits, checked by GameShuffle. Play them as a trivia night with friends.", gameSlugs: [], keywords: [], allVideoGames: true },
];

export const topicBySlug = (slug: string) => QUESTION_TOPICS.find((t) => t.slug === slug) ?? null;
export const topicUrl = (slug: string) => `${TRIVIA_PATH}/questions/${slug}`;
