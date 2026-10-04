/**
 * Chat Brain question bank: the reviewed starter set, 20 per category (160).
 *
 * Staff add these to the queue from Platform ▸ Chat Brain ("Add the question
 * bank"). New questions land as drafts. A question that was reworded carries
 * its earlier wording in `was`: a draft still using that wording, with no
 * answers yet, is updated in place instead of a second question being added.
 * Anything already in Chat Brain with the same wording is skipped, so the button
 * is safe to press on dev and prod alike.
 *
 * Launch needs 30 published boards and not every question collects enough
 * agreement to make one, so the bank holds about five questions per board.
 *
 * How to write one (the same shape as the TV survey games):
 *   1. The answer is a thing: one to three words that fit on a board tile.
 *      If a typical answer is a sentence, rewrite the question.
 *   2. Narrow the field with a concrete detail: a place, a time, a holiday, a
 *      body part, a color. "Name a vegetable kids refuse to eat", not "Name a
 *      food kids refuse to eat".
 *   3. Prefer "Name a ___" and "Name something ___". "What do people say ___"
 *      only when the answers are short stock phrases ("Are we there yet?").
 *   4. No judgments that invite an explanation ("the most annoying thing").
 *      Ask for something you can see, hear, eat, own or name.
 *   5. Expect four to eight strong answers with clear clusters and a tail.
 *   No real private people. All family-safe.
 */

export interface BankQuestion { category: string; text: string; was?: string }

type Entry = string | [text: string, was: string];

const BANK: Record<string, Entry[]> = {
  "game-night": [
    "Name a board game almost every family owns",
    "Name a snack people bring to game night",
    ["Name something a sore loser does right after losing", "What's something a sore loser does after losing a game?"],
    "Name something that often goes missing from a board game box",
    "Name a game you can play with just a deck of cards",
    ["Name a board game known for starting arguments", "Name a game that causes the most arguments"],
    ["Name a way people cheat at Monopoly", "Name something people do to cheat at board games"],
    ["Name something you find inside a new board game box", "What's the first thing you do when you open a new board game?"],
    ["Name a party game where you have to guess a word", "Name a party game for a big group"],
    ["Name a reason game night gets cancelled at the last minute", "Name a reason game night gets cancelled"],
    ["Name a soda people bring to game night", "Name a drink people bring to game night"],
    ["Name a board game that uses dice", "What do people say when they roll a bad number?"],
    ["Name a board game that can take over two hours", "Name a game that takes way too long to finish"],
    ["Name something you need to play Dungeons & Dragons", "Name something you need to play a tabletop role-playing game"],
    ["Name a card game people play on a family vacation", "Name a card game people play on vacation"],
    ["Name something the host sets out before game night starts", "What's something the game night host always has to do?"],
    ["Name a board game you played as a kid", "Name a game you learned as a kid"],
    ["Name a word you shout in a card game", "Name a word people shout during a game"],
    ["Name something people use to keep score at game night", "Name something people use to keep score"],
    ["Name a Monopoly piece people fight over", "What do you do while waiting for your turn?"],
  ],
  gaming: [
    "Name a famous video game character",
    ["Name something people throw when they rage quit", "What's something people do when they rage quit a video game?"],
    "Name a video game console",
    ["Name a drink gamers keep next to them", "Name something you need for a long gaming session"],
    ["Name a chore kids have to finish before they can play video games", "What do parents say to get kids to stop playing video games?"],
    ["Name a video game almost everyone has played", "Name a video game everyone has played at least once"],
    ["Name a famous video game villain", "Name a video game with a famous villain"],
    ["Name a game people stay up all night playing", "Name a reason you'd stay up all night gaming"],
    ["Name a part of a game controller that wears out first", "Name something that breaks a game controller"],
    ["Name a battle royale game", "Name a game you play with friends online"],
    ["Name a reason you'd mute someone in an online game", "What's the most annoying thing a teammate can do?"],
    "Name a video game power-up",
    ["Name a type of video game level everyone dreads", "Name a type of video game level everyone hates"],
    ["Name a video game with a famous theme song", "Name something you yell at a video game"],
    "Name a handheld game system",
    ["Name a video game series with more than five games", "Name a game series with a lot of sequels"],
    ["Name a snack that leaves gamers with messy fingers", "What do gamers snack on?"],
    "Name a video game set in space",
    "Name a video game sound everyone recognizes",
    ["Name a game people bought a console just to play", "Name a reason people buy a new console"],
  ],
  "mario-kart": [
    "Name a Mario Kart item you're always happy to get",
    "Name a Mario Kart track everyone remembers",
    ["Name a Mario Kart item that ruins a lead", "Who do you blame when a blue shell hits you?"],
    "Name a character people always pick in Mario Kart",
    ["Name a Mario Kart item you can drag behind you", "What do people yell when they fall off Rainbow Road?"],
    "Name the worst item to get when you're in first place",
    ["Name a Mario Kart item people save for the last lap", "What do you do when someone passes you on the last lap?"],
    "Name a Mario Kart cup",
    "Name a Mario Kart track with a lot of water",
    ["Name a Mario Kart track people groan at when it gets picked", "Name a Mario Kart track that's hard to win on"],
    ["Name a Mario Kart character people pick last", "Name a Mario Kart character people never pick"],
    "Name a Mario Kart track with a famous shortcut",
    ["Name a Mario Kart character who isn't from the Mario games", "What do people say after winning a race?"],
    "Name a Mario Kart battle mode",
    ["Name a Mario Kart track set in the snow", "Name something that makes Mario Kart feel unfair"],
    "Name a Mario Kart item that hits everyone",
    "Name a heavy Mario Kart character",
    ["Name something Lakitu does in Mario Kart", "What's the first thing people do when a race starts?"],
    "Name a Mario Kart game",
    ["Name a Mario Kart item that makes you faster", "Name something people do to a friend right before the finish line"],
  ],
  food: [
    "Name a popular pizza topping",
    ["Name a topping people put on a hot dog", "What's something people put on a hot dog?"],
    "Name a food you eat at the movies",
    ["Name a vegetable kids refuse to eat", "Name a food kids refuse to eat"],
    ["Name a dinner you can make in under 15 minutes", "What's a common thing to eat for dinner on a busy weeknight?"],
    ["Name a food that tastes better as leftovers", "Name a food that's better the next day"],
    ["Name something people dip french fries in", "Name something people put on french fries"],
    ["Name a breakfast food you eat with syrup", "Name a breakfast food"],
    ["Name a food people eat with chopsticks", "Name a food people eat with their hands"],
    ["Name something served at a kid's birthday party", "Name a dessert at a birthday party"],
    ["Name a fast food place people go to late at night", "Name a fast food order people get late at night"],
    ["Name a food that's messy to eat on a first date", "Name a food that's hard to eat neatly"],
    "Name an ice cream flavor",
    ["Name a sandwich kids take to school", "Name something you'd find in a lunchbox"],
    ["Name a vegetable people dip in ranch", "Name a food people dip in ranch"],
    ["Name a spicy pepper", "Name a spicy food"],
    "Name a topping for a baked potato",
    ["Name a drink people order at a coffee shop", "What do people order at a coffee shop?"],
    "Name a dish people bring to a potluck",
    ["Name a cereal with a cartoon mascot", "Name a cereal people loved as kids"],
  ],
  family: [
    ["Name a snack people pack for a road trip", "Name something you always pack for a family road trip"],
    "What do kids ask over and over on a long car ride?",
    ["Name a food people only eat at Thanksgiving", "Name a food people only eat during the holidays"],
    ["Name a kind of photo people send in the family group chat", "What's something that gets posted in a family group chat?"],
    ["Name a chore kids get stuck with after a holiday dinner", "Name a chore kids try to get out of at a family gathering"],
    "Name a holiday when the whole family gets together",
    ["Name something you always find at grandma's house", "What does a grandparent always say?"],
    ["Name something siblings fight over in the car", "Name something siblings fight over"],
    ["Name a holiday decoration people put on their front door", "Name a game families play at holiday gatherings"],
    ["Name something kids aren't allowed to do at the dinner table", "Name a house rule kids always break"],
    ["Name a room in the house kids aren't allowed to play in", "What does a parent say when the kids are too loud?"],
    "Name something you'd find in a junk drawer",
    ["Name a theme park families visit", "Name a family vacation spot"],
    "Name a reason a family photo gets retaken",
    ["Name a toy kids ask for on their birthday", "What do kids want for their birthday?"],
    ["Name a chore that comes with having a dog", "Name a chore that comes with having a pet"],
    "Name something a family argues about on a road trip",
    ["Name a treat parents eat after the kids go to bed", "What do parents do after the kids go to bed?"],
    ["Name a gift people give their dad on Father's Day", "Name a gift people give their dad"],
    ["Name a gift people give their mom on Mother's Day", "Name a gift people give their mom"],
  ],
  streaming: [
    "Name something a streamer says at the start of every stream",
    ["Name an emote chat spams when a streamer messes up", "What's something chat spams when a streamer makes a big mistake?"],
    ["Name a game that's popular to watch on Twitch", "Name a game that's popular to watch on stream"],
    "Name something you'd see on a streamer's desk",
    ["Name a reason a stream ends early", "What's a reason a stream might suddenly end early?"],
    ["Name a streaming platform", "Name an emote people spam in chat"],
    ["Name something a streamer does after winning a big match", "Name something a streamer does when they win"],
    "Name a reason viewers leave a stream",
    ["Name a piece of gear every streamer needs", "Name a piece of streaming gear"],
    ["Name something a streamer does at the end of a stream", "What do streamers say right before they end the stream?"],
    "Name something that goes wrong on a live stream",
    ["Name a word people type in chat when they first show up", "What do people type in chat when they first show up?"],
    "Name a kind of stream that isn't gaming",
    "Name something a streamer does while waiting in a queue",
    ["Name a holiday streamers do a special stream for", "Name something viewers ask a streamer over and over"],
    ["Name a word chat types when a streamer makes a bad play", "Name a word streamers use for a bad play"],
    "Name something you'd see on a stream overlay",
    ["Name a drink streamers keep on their desk", "What do streamers drink on stream?"],
    "Name a way viewers support a streamer",
    ["Name an animal that shows up on stream", "Name something a streamer's pet does on stream"],
  ],
  "school-work": [
    "Name something every student keeps in their backpack",
    ["Name an excuse people give for being late to work", "What's an excuse people give for being late to work or school?"],
    "Name a school subject kids find the hardest",
    "Name something you'd find in an office break room",
    ["Name the first thing people do when they get to work on Monday", "What's the first thing people do when they get to work on Monday?"],
    "Name something you'd find in a teacher's desk",
    ["Name something students throw across the classroom", "What do students do when the teacher leaves the room?"],
    ["Name a school supply on every back-to-school list", "Name a school supply you need every year"],
    "Name something people do in a boring meeting",
    ["Name an illness people use as an excuse to call in sick", "Name a reason to call in sick"],
    ["Name a topic coworkers talk about by the coffee machine", "What do coworkers talk about by the coffee machine?"],
    "Name a lunch people pack for work",
    "Name something that's always broken at the office",
    "Name a school field trip destination",
    ["Name an excuse students give for missing homework", "What do students say when they forget their homework?"],
    "Name a job kids want when they grow up",
    "Name a sound you hear in a school hallway",
    "Name something people do on a Friday afternoon at work",
    ["Name a sport most high schools have a team for", "Name a club or team at school"],
    "Name something people keep on their desk at work",
  ],
  everyday: [
    ["Name the first thing people do after waking up", "Name something people do right after waking up in the morning"],
    ["Name something people always lose around the house", "What's something people always lose around the house?"],
    "Name a chore nobody likes doing",
    ["Name something people do while waiting in a long line", "What's something people do while waiting in a long line?"],
    "Name something people forget to buy at the grocery store",
    ["Name something people do right before bed", "Name something people do before bed"],
    ["Name something you check for before leaving the house", "Name something you check before leaving the house"],
    ["Name something people watch on a lazy Sunday", "Name something people do on a lazy Sunday"],
    ["Name an app people open first thing in the morning", "Name an app people open every day"],
    "Name a place people sing out loud",
    ["Name a topic people bring up with strangers", "Name something people talk about with strangers"],
    "Name a reason to stay home on a Friday night",
    "Name something that's always in your pocket",
    "Name a household item that always runs out",
    "Name something people do when they can't sleep",
    "Name a sound that wakes people up",
    ["Name something people lose in the couch cushions", "Name something people do while on hold on the phone"],
    "Name something people keep in their car",
    ["Name a kind of weather people complain about", "Name a weather complaint people make"],
    ["Name the first thing people do when they get home", "Name something people do the moment they get home"],
  ],
};

export const CHAT_BRAIN_BANK: BankQuestion[] = Object.entries(BANK).flatMap(([category, list]) =>
  list.map((e) => (typeof e === "string" ? { category, text: e } : { category, text: e[0], was: e[1] })),
);
