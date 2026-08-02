/**
 * Truth-or-Dare prompt sets. Each template is one SEO page (mirrors the bingo /
 * tier-list template treatment). All content is kept light and tasteful — the
 * "Couples" set is romantic/PG, nothing explicit.
 */

export interface TruthOrDareSet {
  slug: string;
  title: string;
  description: string;
  truths: string[];
  dares: string[];
}

const RAW: TruthOrDareSet[] = [
  {
    slug: "clean",
    title: "Clean",
    description: "Family-friendly truth-or-dare — good for all ages, classrooms, and game nights.",
    truths: [
      "What's the most embarrassing thing you've done in public?",
      "What's a talent you wish you had?",
      "What's your all-time favorite movie?",
      "Who was your first-ever best friend?",
      "What's the best gift you've ever gotten?",
      "What's your go-to karaoke song?",
      "What's the silliest thing you're afraid of?",
      "If you could have any pet, what would it be?",
      "What's the weirdest food combo you secretly love?",
      "What's your dream vacation destination?",
      "What's the last thing that made you laugh out loud?",
      "What's a nickname you've had?",
      "What's your biggest pet peeve?",
      "What's the best prank you've ever pulled?",
      "If you could swap lives with anyone for a day, who?",
      "What's a hobby you'd love to pick up?",
    ],
    dares: [
      "Do your best impression of a cartoon character.",
      "Talk in an accent for the next 3 rounds.",
      "Do 10 jumping jacks right now.",
      "Sing the chorus of the last song you listened to.",
      "Balance a spoon on your nose for 10 seconds.",
      "Do your best runway walk across the room.",
      "Speak only in questions until your next turn.",
      "Let the group give you a new hairstyle.",
      "Do your best robot dance for 15 seconds.",
      "Try to lick your elbow.",
      "Make up a short jingle about the person to your left.",
      "Hop on one foot around the room once.",
      "Do an impression of another player.",
      "Say the alphabet backwards.",
      "Draw a self-portrait with your eyes closed.",
      "Give a dramatic reading of the last text you sent.",
    ],
  },
  {
    slug: "party",
    title: "Party",
    description: "Party truth-or-dare for teens and adults — bolder laughs, still keeps it clean.",
    truths: [
      "What's the most embarrassing thing in your search history?",
      "Who in this room would you want on your team in an apocalypse?",
      "What's a small lie you tell all the time?",
      "What's the most childish thing you still do?",
      "What's your most-used emoji and why?",
      "What's the worst fashion choice you've ever made?",
      "What's a secret talent nobody here knows about?",
      "What's the most trouble you got into as a kid?",
      "Who's your celebrity crush?",
      "What's the pettiest reason you've ever ghosted someone?",
      "What's the weirdest dream you actually remember?",
      "What's your most irrational fear?",
      "What's the last thing you lied about?",
      "What's your guiltiest guilty-pleasure show?",
      "What's the cringiest thing you've posted online?",
      "If your life had a theme song, what would it be?",
    ],
    dares: [
      "Let the group post a status on your behalf (nothing mean).",
      "Do your best impression of someone in the room.",
      "Text a friend a single random emoji and show the reply.",
      "Do 15 seconds of your most dramatic slow-motion action scene.",
      "Let the person on your right redo your hair.",
      "Speak in rhymes until your next turn.",
      "Show the last five photos in your camera roll.",
      "Do an interpretive dance to no music.",
      "Call a contact and sing 'Happy Birthday' (any date).",
      "Wear socks on your hands for the next two rounds.",
      "Do your best catwalk while narrating it.",
      "Let the group pick a new phone wallpaper for the night.",
      "Talk in a movie-trailer voice until your next turn.",
      "Do your best celebrity red-carpet interview answer.",
      "Balance a book on your head while walking a lap.",
      "Swap one item of clothing with the person next to you (socks count).",
    ],
  },
  {
    slug: "couples",
    title: "Couples",
    description: "Sweet, romantic truth-or-dare for date night — heartfelt and playful, kept PG.",
    truths: [
      "What was your first impression of me?",
      "What's your favorite memory of us so far?",
      "What's a little thing I do that you love?",
      "When did you know you liked me?",
      "What song reminds you of us?",
      "What's something you'd love for us to try together?",
      "What's your favorite photo of the two of us?",
      "Where do you picture us in five years?",
      "What's the nicest thing someone said about us?",
      "What's a tiny habit of mine you find adorable?",
      "What's your ideal lazy day with me?",
      "What's one thing you appreciate but forget to say?",
      "What's the best trip we've taken (or want to take)?",
      "What made you smile most about me today?",
      "What's a dream you'd want us to chase together?",
      "What's your favorite way I show I care?",
    ],
    dares: [
      "Give me a genuine compliment while looking me in the eyes.",
      "Recreate our first date pose for a photo.",
      "Do your best impression of me.",
      "Send me the most heartfelt text right now.",
      "Slow dance with me for one song.",
      "Give me a two-minute shoulder rub.",
      "Plan our next date out loud, start to finish.",
      "List five things you love about me, no repeats.",
      "Make me a playlist name for our relationship.",
      "Do a dramatic reading of our first messages.",
      "Draw a quick portrait of me in 60 seconds.",
      "Whisper the cheesiest pickup line you can think of.",
      "Give me a piggyback ride across the room.",
      "Reenact how we met.",
      "Feed me a snack with your eyes closed.",
      "Write me a two-line poem right now.",
    ],
  },
];

export const TRUTH_OR_DARE_SETS: TruthOrDareSet[] = RAW.filter(
  (s) => s.truths.length && s.dares.length,
);

export function getTruthOrDareSet(slug: string): TruthOrDareSet | undefined {
  return TRUTH_OR_DARE_SETS.find((s) => s.slug === slug);
}
