/**
 * Most Likely To prompt packs (a GameShuffle Original). Our own prompts, kept
 * friendly: the point is laughing at the room, not roasting someone out of it.
 * Client-safe. Every prompt finishes the sentence "Who's most likely to…".
 */

export interface PromptPack {
  id: string;
  label: string;
  prompts: string[];
}

export const PROMPT_PACKS: PromptPack[] = [
  {
    id: "game-night", label: "Game night",
    prompts: [
      "flip the board after losing",
      "read the rules out loud for twenty minutes",
      "win a game they've never played before",
      "invent a house rule mid-game",
      "demand a rematch immediately",
      "forget whose turn it is",
      "hoard every snack on the table",
      "form an alliance and betray it one turn later",
      "take the longest turn of the night",
      "quietly win while everyone argues",
      "celebrate a small win way too hard",
      "blame the dice",
      "suggest one more game at 2am",
      "lose the rulebook",
      "win on the very last turn",
      "pick the most complicated game on the shelf",
      "trash talk and then lose",
      "keep score better than the app",
      "be accused of cheating (and deny it)",
      "bring a game nobody has heard of",
      "fall asleep before the last round",
      "narrate their own turns like a sports broadcast",
      "remember a rule from three games ago",
      "come last and still have the most fun",
    ],
  },
  {
    id: "gamers", label: "Gamers",
    prompts: [
      "rage quit a Mario Kart race",
      "blame the controller",
      "speedrun a game nobody asked them to",
      "stay up all night for one more level",
      "know every shortcut on every track",
      "buy a game and never play it",
      "carry the whole team",
      "take the blue shell personally",
      "main the same character forever",
      "skip every cutscene",
      "read every single item description",
      "become a streamer",
      "say 'that didn't count' after losing",
      "have the highest screen time",
      "win a tournament they entered as a joke",
      "hide in a corner and still survive",
      "pause the game at the worst moment",
      "own every console ever made",
      "get distracted collecting coins instead of winning",
      "invent a new strategy that actually works",
      "start a game and immediately change all the settings",
      "shout 'lag!' when they miss",
      "find the secret in the level first",
      "go pro at a party game",
    ],
  },
  {
    id: "friends", label: "The group",
    prompts: [
      "be late to their own party",
      "plan the next game night",
      "text the group chat at 3am",
      "win an argument they're wrong about",
      "start a new hobby every month",
      "get lost using GPS",
      "adopt every stray animal they meet",
      "cry at a kids' movie",
      "know a random fact about everything",
      "survive a zombie apocalypse",
      "become famous for something weird",
      "order for the whole table",
      "laugh at their own joke before finishing it",
      "have a spreadsheet for their weekend",
      "talk their way out of a parking ticket",
      "remember everyone's birthday",
      "win a hot sauce challenge",
      "go on a spontaneous trip tomorrow",
      "sing loudest at karaoke",
      "keep a plant alive the longest",
      "accidentally start a trend",
      "bake something for no reason",
      "give the best advice",
      "still be talking about tonight next year",
    ],
  },
];

export function promptPack(id: string | null | undefined): PromptPack | null {
  return PROMPT_PACKS.find((p) => p.id === id) ?? null;
}
