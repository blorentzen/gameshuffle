/**
 * Trivia team names for /trivia/team-names (trivia team names: 6,600 US searches
 * a month; funny trivia team names: 1,300). Handwritten. `adult` marks the ones
 * that joke about drinking, hidden by the "Clean for kids" switch. Every name
 * passes the word filter (scripts/test-trivia-team-names.ts).
 */

export type TeamNameTheme = "gaming" | "funny" | "office" | "puns" | "kids";

export interface TeamName { name: string; adult?: boolean }

export const TEAM_NAME_THEMES: { id: TeamNameTheme; label: string }[] = [
  { id: "gaming", label: "Gaming" },
  { id: "funny", label: "Funny" },
  { id: "office", label: "Office" },
  { id: "puns", label: "Puns" },
  { id: "kids", label: "For kids" },
];

export const TEAM_NAMES: Record<TeamNameTheme, TeamName[]> = {
  gaming: [
    { name: "Blue Shell Strategists" }, { name: "Respawn and Regret" }, { name: "Princess Peach Pits" }, { name: "Item Box Intellects" },
    { name: "Rainbow Road Scholars" }, { name: "Final Smash Thinkers" }, { name: "Critical Hit Points" }, { name: "The Button Mashers" },
    { name: "Speedrun to Second Place" }, { name: "Mushroom Kingdom Minds" }, { name: "The Thwomp Squad" }, { name: "Save Point Scholars" },
    { name: "The Combo Breakers" }, { name: "Power-Up Professors" }, { name: "No Continues" }, { name: "Extra Life Insurance" },
    { name: "Banana Peel Brigade" }, { name: "Loading Screen Legends" }, { name: "Koopa Troopa Think Tank" }, { name: "Shy Guys Who Know Stuff" },
    { name: "Lag Before Logic" }, { name: "Side Quest Solvers" }, { name: "The Final Bosses" }, { name: "Pause Menu Philosophers" },
    { name: "Achievement Unlocked" }, { name: "One More Turn" }, { name: "Dice Roll Diplomats" }, { name: "The Patch Notes" },
  ],
  funny: [
    { name: "Quizteama Aguilera" }, { name: "Les Quizerables" }, { name: "Trivia Newton John" }, { name: "Know It Owls" },
    { name: "Agatha Quiztie" }, { name: "The Smarty Pints", adult: true }, { name: "Tequila Mockingbird", adult: true }, { name: "Universally Challenged" },
    { name: "We Thought This Was Speed Dating" }, { name: "Last Place Champions" }, { name: "Google Is Banned Here" }, { name: "Better Late Than Smarty" },
    { name: "The Unquizzables" }, { name: "Here for the Snacks" }, { name: "Our Answers Are Final" }, { name: "Educated Guessers" },
    { name: "Confidently Incorrect" }, { name: "Wrong Again, Gary" }, { name: "The Wild Guessers" }, { name: "Partial Credit" },
    { name: "Mostly Harmless" }, { name: "Ask Us Anything (Not That)" }, { name: "Beer Pressure", adult: true }, { name: "Thanks for the Free Wi-Fi" },
    { name: "The Half Pints", adult: true }, { name: "Sorry, We're Late" },
  ],
  office: [
    { name: "Ctrl Alt Defeat" }, { name: "The Reply Alls" }, { name: "Out of Office" }, { name: "Per My Last Answer" },
    { name: "The Spreadsheet Squad" }, { name: "Circle Back Champions" }, { name: "Coffee Before Questions" }, { name: "The Quarterly Reviews" },
    { name: "Mute Button Masters" }, { name: "Let's Take This Offline" }, { name: "Deadline Dodgers" }, { name: "The Pivot Tables" },
    { name: "Low-Hanging Fruit" }, { name: "Breakroom Brainiacs" }, { name: "Jargon Junkies" }, { name: "Paid Time Off" },
    { name: "Bandwidth Bandits" }, { name: "Org Chart Toppers" }, { name: "Sticky Note Society" }, { name: "You're on Mute" },
    { name: "The Synergy Squad" }, { name: "Action Item Achievers" }, { name: "Can Everyone See My Screen" }, { name: "Five More Minutes" },
  ],
  puns: [
    { name: "Let's Get Quizzical" }, { name: "The Quizzard of Oz" }, { name: "Brain Freeze" }, { name: "Pun Intended" },
    { name: "The Quizzly Bears" }, { name: "Trivial Pursuers" }, { name: "Smartinis", adult: true }, { name: "The Wise Quackers" },
    { name: "Mind the Gap" }, { name: "Thinkin' Lincolns" }, { name: "Fact Hunt" }, { name: "Riddle Me This" },
    { name: "Quiz Pro Quo" }, { name: "Eye of the Quizzer" }, { name: "Smart Pants" }, { name: "Quizteroids" },
    { name: "Quiz in Boots" }, { name: "The Brain Cells" }, { name: "Fact or Friction" }, { name: "Answer Tsunami" },
    { name: "Quiz Kid Rock" }, { name: "The Brainstormers" }, { name: "Question Marks" }, { name: "Knowledge Is Flower" },
  ],
  kids: [
    { name: "The Brainy Bunch" }, { name: "Smart Cookies" }, { name: "Fact Finders" }, { name: "Super Spellers" },
    { name: "Bright Sparks" }, { name: "Clever Clogs" }, { name: "The Quiz Kids" }, { name: "Puzzle Pals" },
    { name: "Brain Waves" }, { name: "Mighty Minds" }, { name: "The Wise Owls" }, { name: "Galaxy Brains" },
    { name: "Rocket Scientists" }, { name: "The Dino-Mights" }, { name: "Curious Cats" }, { name: "Star Students" },
    { name: "Thinking Caps" }, { name: "The Bookworms" }, { name: "Answer Ninjas" }, { name: "The Fun Facts" },
    { name: "Happy Guessers" }, { name: "Pencil Pushers" }, { name: "The Lightbulbs" }, { name: "Question Crew" },
  ],
};
