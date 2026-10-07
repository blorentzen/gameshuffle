/**
 * Chat Brain question bank: the reviewed starter set (165 across 8 categories).
 *
 * Staff add these to the queue from Platform ▸ Chat Brain ("Add the question
 * bank"). New questions land as drafts. A question that was reworded carries
 * the wording it replaced in `was`: a draft still using that wording, with no
 * answers yet, is updated in place instead of a second question being added.
 * Anything already in Chat Brain with the same wording is skipped, so the button
 * is safe to press on dev and prod alike.
 *
 * Launch needs 30 published boards and not every question collects enough
 * agreement to make one, so the bank holds about five questions per board.
 *
 * What makes a good Chat Brain question: the board should be fun to reveal.
 * "I can't believe that's up there" and "you said WHAT" beat a list everyone
 * could have guessed.
 *   1. The answer still fits on a board tile: a name, a thing, a short phrase.
 *   2. Leave room for opinion, a confession or a hypothetical: "overrated",
 *      "most likely to", "secretly", "would", "pretend to like". People answer
 *      from their own life, so the board says something about the crowd.
 *   3. Aim for a spread, with gravity. Three to five answers should pull in
 *      several people each (a board needs groups of 2 or more), but no single
 *      answer should take most of the room, and there should be space for a
 *      surprise to make the board.
 *   4. Skip closed lists and one-answer prompts ("Name a Mario Kart cup",
 *      "Name an item that ruins a lead": everyone says blue shell).
 *   5. Be culturally current: what happens on Twitch, YouTube and TikTok, the
 *      phrases people actually use. Real public figures only in a playful
 *      frame. No private people, nothing cruel, and every question family-safe.
 */

export interface BankQuestion { category: string; text: string; was?: string }

type Entry = string | [text: string, was: string];

const BANK: Record<string, Entry[]> = {
  "game-night": [
    ["Name a game that instantly kills the vibe at game night", "Name a board game almost every family owns"],
    ["Name a snack that gets you judged if you bring it to game night", "Name a snack people bring to game night"],
    "Name something a sore loser does right after losing",
    ["Name something people secretly do when they're losing a board game", "Name something that often goes missing from a board game box"],
    ["Name a card game people pretend to know the rules to", "Name a game you can play with just a deck of cards"],
    ["Name a house rule people make up for Monopoly", "Name a board game known for starting arguments"],
    ["Name a type of person you never want on your team at game night", "Name a way people cheat at Monopoly"],
    ["Name an excuse people give for showing up late to game night", "Name something you find inside a new board game box"],
    ["Name a game that's secretly a test of your friendship", "Name a party game where you have to guess a word"],
    "Name a reason game night gets cancelled at the last minute",
    ["Name a drink that says you're taking game night way too seriously", "Name a soda people bring to game night"],
    ["Name a board game that takes longer to set up than to play", "Name a board game that uses dice"],
    ["Name a board game that would make a terrible movie", "Name a board game that can take over two hours"],
    ["Name a classic board game that badly needs a modern update", "Name something you need to play Dungeons & Dragons"],
    ["Name a game that's only fun when you're winning", "Name a card game people play on a family vacation"],
    ["Name a snack that should be banned from game night for being too messy", "Name something the host sets out before game night starts"],
    ["Name a kids' board game adults secretly still love", "Name a board game you played as a kid"],
    ["Name a board game that would be terrifying in real life", "Name a word you shout in a card game"],
    ["Name something people bet at game night instead of money", "Name something people use to keep score at game night"],
    ["Name a Monopoly piece that says the most about a person", "Name a Monopoly piece people fight over"],
  ],
  gaming: [
    ["Name a video game character you'd trust to babysit", "Name a famous video game character"],
    ["Name a video game most likely to make someone rage quit", "Name something people throw when they rage quit"],
    ["Name a video game console people regret buying", "Name a video game console"],
    ["Name something gamers put off for \"one more game\"", "Name a drink gamers keep next to them"],
    ["Name a video game parents secretly get hooked on", "Name a chore kids have to finish before they can play video games"],
    ["Name an overrated video game that everyone seems to love", "Name a video game almost everyone has played"],
    ["Name a video game villain who honestly had a point", "Name a famous video game villain"],
    ["Name a video game that ruined your sleep schedule", "Name a game people stay up all night playing"],
    ["Name an excuse gamers give when they lose", "Name a part of a game controller that wears out first"],
    ["Name a video game you'd never let your grandma watch you play", "Name a battle royale game"],
    ["Name a type of player everyone hates running into online", "Name a reason you'd mute someone in an online game"],
    ["Name a video game power-up you'd want in real life", "Name a video game power-up"],
    "Name a type of video game level everyone dreads",
    ["Name a video game song that lives rent-free in your head", "Name a video game with a famous theme song"],
    ["Name a video game character who'd be the worst roommate", "Name a handheld game system"],
    ["Name a video game series that should finally end", "Name a video game series with more than five games"],
    ["Name a video game world you'd actually want to live in", "Name a snack that leaves gamers with messy fingers"],
    ["Name a video game that would make a terrible date night", "Name a video game set in space"],
    ["Name a video game sound that gives you instant anxiety", "Name a video game sound everyone recognizes"],
    ["Name a game that's more fun to watch than to play", "Name a game people bought a console just to play"],
  ],
  "mario-kart": [
    ["Name a new item that would make Mario Kart more chaotic", "Name a Mario Kart item you're always happy to get"],
    ["Name a Mario Kart track that should be banned from game night", "Name a Mario Kart track everyone remembers"],
    ["Name a Mario Kart character who'd be a terrible driver in real life", "Name a Mario Kart item that ruins a lead"],
    ["Name a Mario Kart character people judge you for picking", "Name a character people always pick in Mario Kart"],
    ["Name a Nintendo character most likely to rage quit at game night", "Name a Mario Kart item you can drag behind you"],
    ["Name the most disrespectful thing you can do in Mario Kart", "Name the worst item to get when you're in first place"],
    ["Name a Mario Kart item that ruins friendships", "Name a Mario Kart item people save for the last lap"],
    ["Name a real place that would make an amazing Mario Kart track", "Name a Mario Kart cup"],
    ["Name a Mario Kart track you'd want to drive in real life", "Name a Mario Kart track with a lot of water"],
    ["Name a Mario Kart track with music that's stuck in your head", "Name a Mario Kart track people groan at when it gets picked"],
    ["Name a Mario Kart character whose voice gets annoying fast", "Name a Mario Kart character people pick last"],
    ["Name a non-Nintendo character who belongs in Mario Kart", "Name a Mario Kart track with a famous shortcut"],
    ["Name a Mario Kart item you'd want for your daily commute", "Name a Mario Kart character who isn't from the Mario games"],
    ["Name a Mario Kart character who would cheat if they could", "Name a Mario Kart battle mode"],
    ["Name the Mario Kart character most likely to win a real race", "Name a Mario Kart track set in the snow"],
    ["Name a Mario Kart item that's secretly useless", "Name a Mario Kart item that hits everyone"],
    ["Name a celebrity who'd be scary good at Mario Kart", "Name a heavy Mario Kart character"],
    ["Name something people blame when they lose at Mario Kart", "Name something Lakitu does in Mario Kart"],
    ["Name a Mario Kart game people swear is the best one", "Name a Mario Kart game"],
    ["Name a house rule people make up for Mario Kart", "Name a Mario Kart item that makes you faster"],
  ],
  food: [
    ["Name a pizza topping people pretend to like", "Name a popular pizza topping"],
    ["Name a food that's way better at 2 a.m.", "Name a topping people put on a hot dog"],
    ["Name a movie snack that gets you dirty looks in the theater", "Name a food you eat at the movies"],
    ["Name a food everyone loves that's actually overrated", "Name a vegetable kids refuse to eat"],
    ["Name a gas station snack that's weirdly elite", "Name a dinner you can make in under 15 minutes"],
    ["Name a food that ruins your breath right before a date", "Name a food that tastes better as leftovers"],
    ["Name the weirdest thing people dip french fries in", "Name something people dip french fries in"],
    ["Name a breakfast food that's secretly dessert", "Name a breakfast food you eat with syrup"],
    ["Name a food that's impossible to eat gracefully", "Name a food people eat with chopsticks"],
    ["Name a snack that instantly makes you feel like a kid again", "Name something served at a kid's birthday party"],
    ["Name a fast food item that's better than it has any right to be", "Name a fast food place people go to late at night"],
    ["Name a food that's a red flag if someone orders it on a date", "Name a food that's messy to eat on a first date"],
    ["Name an ice cream flavor that shouldn't exist", "Name an ice cream flavor"],
    ["Name a food that's better cold than hot", "Name a sandwich kids take to school"],
    ["Name a condiment people put way too much of on everything", "Name a vegetable people dip in ranch"],
    ["Name a food people only eat to look brave", "Name a spicy pepper"],
    ["Name a Thanksgiving dish that should be cut from the menu", "Name a topping for a baked potato"],
    ["Name a coffee order that tells you everything about a person", "Name a drink people order at a coffee shop"],
    ["Name a dish that always gets left over at a potluck", "Name a dish people bring to a potluck"],
    ["Name a cereal that's basically candy", "Name a cereal with a cartoon mascot"],
  ],
  family: [
    ["Name something dads say on every road trip", "Name a snack people pack for a road trip"],
    ["Name something kids do in the back seat that drives parents crazy", "What do kids ask over and over on a long car ride?"],
    ["Name a topic you should never bring up at Thanksgiving dinner", "Name a food people only eat at Thanksgiving"],
    ["Name something only a mom would send in the family group chat", "Name a kind of photo people send in the family group chat"],
    ["Name a chore kids pretend they don't know how to do", "Name a chore kids get stuck with after a holiday dinner"],
    ["Name a family holiday tradition that's secretly chaos", "Name a holiday when the whole family gets together"],
    "Name something you always find at grandma's house",
    ["Name something siblings still fight over in their thirties", "Name something siblings fight over in the car"],
    ["Name a gift that tells you someone remembered you at the last minute", "Name a holiday decoration people put on their front door"],
    ["Name something parents told you that turned out to be a lie", "Name something kids aren't allowed to do at the dinner table"],
    ["Name the family member who always takes game night too far", "Name a room in the house kids aren't allowed to play in"],
    "Name something you'd find in a junk drawer",
    ["Name a vacation that sounds fun but is secretly stressful with kids", "Name a theme park families visit"],
    ["Name something embarrassing parents show your date", "Name a reason a family photo gets retaken"],
    ["Name a toy from your childhood you'd pay anything to have back", "Name a toy kids ask for on their birthday"],
    ["Name something the family dog always gets blamed for", "Name a chore that comes with having a dog"],
    "Name something a family argues about on a road trip",
    "Name a treat parents eat after the kids go to bed",
    ["Name a gift dads pretend to love", "Name a gift people give their dad on Father's Day"],
    ["Name a gift that guarantees you're mom's favorite", "Name a gift people give their mom on Mother's Day"],
  ],
  streaming: [
    "Name something a streamer says at the start of every stream",
    ["Name something chat spams when a streamer gets jump scared", "Name an emote chat spams when a streamer messes up"],
    ["Name a game streamers play when they've run out of ideas", "Name a game that's popular to watch on Twitch"],
    ["Name something you'd be shocked to see on a streamer's desk", "Name something you'd see on a streamer's desk"],
    ["Name a reason a streamer suddenly ends the stream", "Name a reason a stream ends early"],
    ["Name a TikTok sound everyone has heard a million times", "Name a streaming platform"],
    ["Name something a streamer does when they think their mic is off", "Name something a streamer does after winning a big match"],
    ["Name a reason you'd unfollow a streamer", "Name a reason viewers leave a stream"],
    ["Name a piece of streaming gear people buy and never use", "Name a piece of gear every streamer needs"],
    ["Name a word that only makes sense on Twitch", "Name something a streamer does at the end of a stream"],
    ["Name the worst thing that can happen on a live stream", "Name something that goes wrong on a live stream"],
    ["Name something chat does the second a streamer leaves the room", "Name a word people type in chat when they first show up"],
    ["Name a kind of stream that's weirdly relaxing to watch", "Name a kind of stream that isn't gaming"],
    ["Name something a YouTuber says in every single video", "Name something a streamer does while waiting in a queue"],
    ["Name a kind of YouTube video everyone has watched at 3 a.m.", "Name a holiday streamers do a special stream for"],
    ["Name something chat types when a streamer makes a bad play", "Name a word chat types when a streamer makes a bad play"],
    ["Name a channel point reward that would cause total chaos", "Name something you'd see on a stream overlay"],
    ["Name a drink every streamer seems to be sponsored by", "Name a drink streamers keep on their desk"],
    ["Name something viewers would pay money to make a streamer do", "Name a way viewers support a streamer"],
    ["Name a pet that would get more viewers than its streamer", "Name an animal that shows up on stream"],
    "Name a phrase that started on the internet and made it into real life",
    "Name something streamers say when they know they're about to lose",
    "Name an excuse a streamer gives for starting late",
    "Name something people only did because they saw it on TikTok",
    "Name a reaction streamers fake for the camera",
  ],
  "school-work": [
    ["Name something a student would bring to school if there were no rules", "Name something every student keeps in their backpack"],
    ["Name an excuse for being late that nobody believes", "Name an excuse people give for being late to work"],
    ["Name a school subject that's useless in real life", "Name a school subject kids find the hardest"],
    ["Name something that disappears from the office fridge", "Name something you'd find in an office break room"],
    ["Name a phrase that should be banned from work emails", "Name the first thing people do when they get to work on Monday"],
    ["Name something every teacher has said at least once", "Name something you'd find in a teacher's desk"],
    ["Name something students do when there's a substitute teacher", "Name something students throw across the classroom"],
    ["Name a school supply that used to be a status symbol", "Name a school supply on every back-to-school list"],
    ["Name something people secretly do during video calls", "Name something people do in a boring meeting"],
    ["Name the worst person to be stuck in an elevator with at work", "Name an illness people use as an excuse to call in sick"],
    ["Name something coworkers argue about", "Name a topic coworkers talk about by the coffee machine"],
    ["Name a lunch that makes the whole office hate you", "Name a lunch people pack for work"],
    ["Name a job that looks easy but definitely isn't", "Name something that's always broken at the office"],
    ["Name a field trip that would be way cooler than a museum", "Name a school field trip destination"],
    ["Name a reason to get sent to the principal's office", "Name an excuse students give for missing homework"],
    ["Name a dream job from when you were a kid", "Name a job kids want when they grow up"],
    ["Name a high school stereotype that still shows up at work", "Name a sound you hear in a school hallway"],
    ["Name something people pretend to be busy with at work", "Name something people do on a Friday afternoon at work"],
    ["Name a school sport that deserves more respect", "Name a sport most high schools have a team for"],
    ["Name something on a coworker's desk that's a red flag", "Name something people keep on their desk at work"],
  ],
  everyday: [
    ["Name a sound that instantly ruins your day", "Name the first thing people do after waking up"],
    "Name something people always lose around the house",
    ["Name a chore people would happily pay someone else to do", "Name a chore nobody likes doing"],
    ["Name something people do in line that drives everyone crazy", "Name something people do while waiting in a long line"],
    ["Name something you buy at the store that you didn't go in for", "Name something people forget to buy at the grocery store"],
    ["Name something people do at 2 a.m. that they'd never admit", "Name something people do right before bed"],
    ["Name a smell that instantly brings back memories", "Name something you check for before leaving the house"],
    "Name something people watch on a lazy Sunday",
    ["Name an app people say they'll delete but never do", "Name an app people open first thing in the morning"],
    ["Name a song everyone knows all the words to", "Name a place people sing out loud"],
    ["Name a small talk topic people secretly hate", "Name a topic people bring up with strangers"],
    ["Name a reason people cancel plans at the last minute", "Name a reason to stay home on a Friday night"],
    ["Name something people always have way too many of at home", "Name something that's always in your pocket"],
    ["Name a household item that's always missing its other half", "Name a household item that always runs out"],
    "Name something people do when they can't sleep",
    ["Name something people talk to even though it can't answer", "Name a sound that wakes people up"],
    "Name something people lose in the couch cushions",
    ["Name something you'd be embarrassed for someone to find in your car", "Name something people keep in their car"],
    "Name a kind of weather people complain about",
    ["Name something adults get way too excited about", "Name the first thing people do when they get home"],
  ],
};

export const CHAT_BRAIN_BANK: BankQuestion[] = Object.entries(BANK).flatMap(([category, list]) =>
  list.map((e) => (typeof e === "string" ? { category, text: e } : { category, text: e[0], was: e[1] })),
);
