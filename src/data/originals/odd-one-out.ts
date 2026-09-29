/**
 * Odd One Out word packs (a GameShuffle Original). Our own lists: generic
 * words and genres, never titles or brands, so there's nothing to license.
 * Client-safe: the pass-the-phone tool deals from these in the browser, and
 * live nights deal from them on the server.
 *
 * A good word is something everyone at the table knows and can hint at in one
 * word without giving it away. Avoid words that are also a category name.
 */

export interface WordPack {
  id: string;
  label: string;
  /** Shown to the odd one out so they can bluff along. */
  category: string;
  words: string[];
}

export const WORD_PACKS: WordPack[] = [
  {
    id: "snacks", label: "Snacks", category: "Snacks",
    words: ["Popcorn", "Pretzels", "Nachos", "Cookies", "Chips", "Gummy bears", "Trail mix", "Cheese puffs", "Brownies", "Ice cream", "Donuts", "Pizza rolls", "Beef jerky", "Cupcakes", "Candy corn", "Marshmallows", "Peanut butter cups", "Grapes", "Crackers", "Salsa", "Guacamole", "Churros", "Waffles", "Cotton candy", "Granola bar", "Onion rings", "Mozzarella sticks", "Hot wings", "Apple slices", "Chocolate bar", "Smoothie", "Milkshake"],
  },
  {
    id: "video-games", label: "Video games", category: "Video games",
    words: ["Boss fight", "Save point", "Speedrun", "Power-up", "Respawn", "Loot box", "Side quest", "Final level", "Controller", "Split screen", "Cheat code", "Leaderboard", "Tutorial", "Cutscene", "High score", "Extra life", "Game over", "Skill tree", "Fast travel", "Mini-map", "Checkpoint", "Rage quit", "Headset", "Arcade cabinet", "Couch co-op", "Easter egg", "Patch notes", "Lag", "Final boss", "Coin block", "Loading screen", "Achievement"],
  },
  {
    id: "game-night", label: "Game night", category: "Game night",
    words: ["Dice", "Score pad", "Rulebook", "Timer", "Deck of cards", "Board", "Tokens", "Spinner", "Hourglass", "Trivia", "Charades", "Tiebreaker", "House rules", "Poker chips", "Scoreboard", "Winner's crown", "Snack table", "Draft", "Bracket", "Team captain", "Wild card", "Sore loser", "Rematch", "Shuffle", "Sand timer", "Meeples", "Blindfold", "Buzzer", "Referee", "Bonus round", "Final round", "Participation trophy"],
  },
  {
    id: "places", label: "Places", category: "Places",
    words: ["Beach", "Airport", "Library", "Bowling alley", "Hospital", "Movie theater", "Grocery store", "Gym", "Zoo", "Museum", "Campsite", "Water park", "Train station", "Bakery", "Ski lodge", "Aquarium", "Arcade", "Farm", "Castle", "Laundromat", "Dentist", "Stadium", "Lighthouse", "Desert", "Volcano", "Submarine", "Space station", "Haunted house", "Carnival", "Wedding", "Office", "Rooftop"],
  },
  {
    id: "animals", label: "Animals", category: "Animals",
    words: ["Penguin", "Giraffe", "Octopus", "Kangaroo", "Hedgehog", "Flamingo", "Shark", "Owl", "Sloth", "Raccoon", "Dolphin", "Camel", "Peacock", "Koala", "Turtle", "Bat", "Frog", "Panda", "Squirrel", "Parrot", "Crab", "Llama", "Moose", "Snail", "Chameleon", "Goldfish", "Hamster", "Eagle", "Jellyfish", "Zebra", "Bee", "Walrus"],
  },
  {
    id: "movie-night", label: "Movie night", category: "Movies",
    words: ["Heist", "Zombie", "Time travel", "Superhero", "Rom-com", "Car chase", "Haunted house", "Alien invasion", "Treasure map", "Pirate ship", "Detective", "Robot", "Road trip", "Sequel", "Plot twist", "Villain", "Sidekick", "Musical", "Montage", "Cliffhanger", "Dinosaur", "Space battle", "Spy gadget", "Knight", "Wizard", "Western", "Monster", "Prison break", "Sports comeback", "Holiday movie", "Disaster movie", "Mad scientist"],
  },
  {
    id: "everyday", label: "Everyday things", category: "Everyday things",
    words: ["Umbrella", "Toothbrush", "Alarm clock", "Backpack", "Headphones", "Sunglasses", "Remote control", "Pillow", "Wallet", "Keys", "Coffee mug", "Candle", "Ladder", "Mirror", "Suitcase", "Flashlight", "Blanket", "Stapler", "Doorbell", "Microwave", "Bicycle", "Tape measure", "Hairdryer", "Sticky notes", "Scissors", "Phone charger", "Water bottle", "Slippers", "Calendar", "Vacuum", "Paintbrush", "Lunchbox"],
  },
];

export function wordPack(id: string | null | undefined): WordPack | null {
  return WORD_PACKS.find((p) => p.id === id) ?? null;
}
