import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/daily-duel";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>The Daily Duel and Trainer Road</h1>
      <p>
        <Link href="/daily-duel">The Daily Duel</Link>{" "}is a card duel against a trainer from the Pokémon games, with a new trainer every
        day. On <Link href="/pokemon-trainers">Trainer Road</Link>{" "}you can duel any of those trainers whenever you like. Both play by the
        same rules, so this page covers both.
      </p>

      <h2>The trainer of the day</h2>
      <p>
        A new trainer arrives at midnight Pacific time, with the team they use in one of the games. The day of the week sets how hard it
        is:
      </p>
      <ul>
        <li>Monday and Tuesday: a Gym Leader</li>
        <li>Wednesday and Thursday: a member of an Elite Four</li>
        <li>Friday: a rival</li>
        <li>Saturday: a villain team&apos;s boss</li>
        <li>Sunday: a Champion</li>
      </ul>
      <p>
        Everyone gets the same six cards to duel with. The start card shows the trainer&apos;s team in the order it comes out, each
        card&apos;s HP and Weakness, and the event that belongs to that trainer.
      </p>

      <h2>Easy, Normal and Hard</h2>
      <p>
        Pick a mode on the start card, then tap <strong>Battle now</strong>. The mode locks and the clock starts when you tap it. All three
        modes play the same duel. They change the comeback Energy a card brings when it comes in after one of yours is knocked out, and
        whether the professor can help.
      </p>
      <ul>
        <li><strong>Easy:</strong> the card that comes in brings one Energy for each card you&apos;ve lost (1, then 2, then 3). The professor can help. A win scores 200 less.</li>
        <li><strong>Normal:</strong> the card that comes in brings one Energy. The professor can help.</li>
        <li><strong>Hard:</strong> no comeback Energy and no professor. A win scores 200 more. Hard has its own par, and it&apos;s closed on a day with no winning line without comeback Energy.</li>
      </ul>
      <p>The trainer&apos;s next card brings one Energy for each card it has lost, up to two, in every mode.</p>

      <h2>Bringing your cards</h2>
      <p>
        After you tap Battle now, pick which of your six to bring: as many as the trainer brings, and at least three. Then pick the card
        that leads. A trainer with fewer than five cards starts each of them with Energy: one for each card it&apos;s short of five, up to
        three.
      </p>

      <h2>A turn</h2>
      <p>Each turn opens a window with two steps.</p>
      <ol>
        <li><strong>Play an Energy.</strong>{" "}You hold three Energy. Pick one and the card it goes on. It stays on that card for the rest of the duel, and you draw a new one.</li>
        <li><strong>Who fights this turn.</strong>{" "}Keep your card on the field, or swap a waiting card in. A swap means no attack this turn.</li>
      </ol>
      <p>
        Then attack, or tap <strong>End turn</strong>. A move works once the Energy dots beside it are covered, and hitting the
        trainer&apos;s Weakness does double damage. A move with a + or × counts what its card says, like 20 more for each of the
        trainer&apos;s waiting cards. Tap a card to see how the Duel plays it, and <strong>View TCG version</strong>{" "}for the Pokémon TCG
        card it borrows from.
      </p>
      <p>
        You win by knocking out every card the trainer brings. You lose if all your cards are knocked out, or if you haven&apos;t won by
        turn 40.
      </p>

      <h3>Conditions</h3>
      <p>
        Some moves can leave the card they hit with a condition. The icon on the move shows which one, and the number beside it is the
        chance: 50% when the card always causes it, 25% when the card flips a coin.
      </p>
      <ul>
        <li><strong>Burned:</strong> loses 20 HP at the end of every turn.</li>
        <li><strong>Poisoned:</strong> loses 10, then 20, then 30, and so on.</li>
        <li><strong>Paralyzed:</strong> a 25% chance each turn that it can&apos;t move.</li>
        <li><strong>Asleep:</strong> can&apos;t move for one to three of its turns.</li>
        <li><strong>Confused:</strong> for three turns, each move has a 33% chance to hit itself for 20.</li>
      </ul>
      <p>
        A card holds one condition at a time, plus Confused, and swapping it out cures it. The same moves get the same luck for everyone.
      </p>

      <h3>Events</h3>
      <p>
        About every third turn, an event crashes the duel: rain or harsh sunlight changes Water and Fire damage, a sandstorm hits cards
        that aren&apos;t Fighting or Metal, Team Rocket grabs one of your waiting cards for two turns, a Potion or Nurse Joy heals your
        card, and more. Each trainer also has an event of their own. The bar at the top of the duel shows this turn&apos;s event and next
        turn&apos;s. Tap one to read what it does.
      </p>

      <h2>Par and your score</h2>
      <p>
        Par is the fewest turns that win the duel, worked out before the day goes out with none of your conditions landing. You see it once
        your duel is over. A win scores out of 1,000:
      </p>
      <ul>
        <li><strong>Turns,</strong> up to 600: 50 less for each turn over par, and never below 200.</li>
        <li><strong>Time,</strong> up to 250: you get 15 seconds for each turn of par, then lose 10 for every 15 seconds over.</li>
        <li><strong>Solo,</strong> 150: for playing without the professor or a tool.</li>
      </ul>
      <p>
        A Hard win adds 200 and always gets the solo bonus. An Easy win takes 200 off, and never scores below 150. A loss scores 20 for each
        of the trainer&apos;s cards you knocked out, up to 100.
      </p>

      <h2>The professor</h2>
      <p>
        The professor knows the ways to win each day, each built around a different card. On the start card,{" "}
        <strong>Ask the professor</strong>{" "}shows them as plans. During the duel, Ask the professor in the turn window suggests a play for
        that turn and marks it with a Tip badge.
      </p>
      <p>
        Asking either way ends your solo bonus for today&apos;s duel, so you&apos;re asked to confirm first. Asking on the start card also
        closes Hard for the day. When the Professor&apos;s advice event comes up, that tip is free, and asking during practice costs
        nothing.
      </p>

      <h2>Tools in the Daily Duel</h2>
      <p>
        With a free account, you can use one tool a duel in Easy or Normal, never in Hard. Pick it from your bag in the turn window, before
        you play your Energy. On today&apos;s duel a tool ends your solo bonus, and a bag shows beside your name on the leaderboard. Your
        tools come from Trainer Road: see Tools and the Mart below.
      </p>

      <h2>Practice, streak and cards</h2>
      <p>
        Your first duel each day is the one that counts for the leaderboard and your streak. Once it&apos;s over,{" "}
        <strong>Practice</strong>{" "}plays the same duel again in any mode open that day, as often as you like. Your streak counts the days
        in a row you win today&apos;s duel.
      </p>
      <p>
        You don&apos;t need an account to play. Signed in, <strong>Add these cards to My Cards</strong>{" "}adds the day&apos;s cards to your
        collection. How the leaderboard scores your duel is on{" "}
        <Link href="/help/apps/daily-leaderboards">Daily leaderboards and sharing</Link>.
      </p>

      <h2>Trainer Road</h2>
      <p>
        <Link href="/pokemon-trainers">Trainer Road</Link>{" "}has a page for every trainer in the Daily Duel, by region, with each team they
        use in the games. Pick a team and duel it any time, as often as you like, with the Daily Duel&apos;s rules and modes. Anyone can
        play. Stars, leaderboards and the road need a free account.
      </p>

      <h3>Stars and your best</h3>
      <p>
        Each team has its own duel for the month, the same for everyone. It changes on the first of each month (Pacific time), and your
        stars and the leaderboards start fresh with it. A win earns stars:
      </p>
      <ul>
        <li>One star for a win.</li>
        <li>Two stars for a win within two turns of par.</li>
        <li>Three stars for a win in par or fewer turns.</li>
      </ul>
      <p>
        An Easy win earns two stars at most. Your best duel against each team this month (by score, then time) goes on that team&apos;s
        leaderboard.
      </p>

      <h3>The road</h3>
      <p>Signed in, Trainer Road follows a path through each region, one game per region:</p>
      <ol>
        <li>Beat the Gym Leaders in badge order to earn each badge. Alola has four island kahunas.</li>
        <li>Take on the League back to back: the Elite Four, then the Champion. Galar has its Champion Cup. Lose one and you start again from the League&apos;s first challenge, and your badges stay.</li>
        <li>Win the end-game battle to clear the region and open the next. Kanto comes first and Paldea last.</li>
      </ol>
      <p>
        Only a win against the next trainer on your path moves you along. Every other duel stays open to play. Wins earn XP toward your
        trainer level, and badges, Leagues and regions also pay tokens.
      </p>
      <p>
        Your trainer card shows your level, badges and regions. It turns bronze after your first region, silver after five, gold after all
        nine, and holo once you&apos;ve also won every end-game battle in Hard. It shows on your{" "}
        <Link href="/help/community/public-profile">profile</Link>{" "}once you&apos;ve earned something.
      </p>

      <h3>Villain teams</h3>
      <p>
        Each region&apos;s villain team turns up on your road once, where its game puts it (in Kanto, Team Rocket&apos;s hideout before
        Koga), and now and then after a badge. They swipe up to 50 tokens when they turn up, and the next trainer on your path waits until
        you beat them. Every other duel stays open. Beat them to get your tokens back plus 25. A loss changes nothing, so try again any time.
      </p>

      <h3>Tools and the Mart</h3>
      <p>Tools are items you use during your turn, before you act. Each shows the picture of the Item card it&apos;s named after.</p>
      <ul>
        <li><strong>Patch Up:</strong> heals 50 HP on one of your cards.</li>
        <li><strong>Cure All:</strong> cures your card on the field of every condition.</li>
        <li><strong>Quick Switch:</strong> swaps in a waiting card, and it still gets this turn&apos;s move.</li>
        <li><strong>Power Up:</strong> your attack this turn does 30 more.</li>
        <li><strong>Spare Energy:</strong> play a second Energy this turn.</li>
        <li><strong>Look Ahead:</strong> see the next six Energy and the next two events for three turns.</li>
        <li><strong>Second Wind:</strong> brings back a knocked-out card with half its HP.</li>
      </ul>
      <p>
        Your bag starts with three Patch Ups. Badges, Leagues, cleared regions, your first three-star win against a team and beaten villain
        teams give more. Each region also has a Mart that sells tools for tokens: open it from the Tools line on a region page or a
        trainer&apos;s start box. Some tools only reach the Mart&apos;s shelf as you earn that region&apos;s badges.
      </p>
      <p>
        Your bag holds up to five of each tool, and an earned tool past that is paid to you as tokens. Each region you clear also lets you
        keep one tool for good, ready once a day. Your first win against each trainer each month pays prize money in tokens too.
      </p>

      <h2>Duel a friend</h2>
      <p>
        On any trainer&apos;s page, <strong>Duel a friend</strong>{" "}makes a duel for that team and gives you a link to share: 2 players, or
        up to 8. Everyone duels the same team at the same time, with the same cards, Energy and events, and no professor or tools. The host
        picks Easy, Normal or Hard for everyone. Mark ready, and when the host starts the 10 second countdown, everyone&apos;s arena opens
        at 0.
      </p>
      <ul>
        <li>A win counts first, then fewer turns, then less time. Anyone who loses is placed after the winners, by how many cards they knocked out.</li>
        <li>With 4 or more players you can duel in teams: 2 to 4 teams, scored by everyone&apos;s turns added up or by each team&apos;s best. Everyone picks a team in the duel&apos;s room before the start.</li>
        <li>Your duel counts on Trainer Road like any other: stars, your best and the board.</li>
        <li>The duel&apos;s page shows everyone&apos;s knockouts and turns as they go. Add its link with <code>/obs</code>{" "}on the end to OBS to show it on stream. With GS Pro, chat can bet on who wins (<code>!bet</code>{" "}and a name or number).</li>
      </ul>

      <h2>Team up</h2>
      <p>
        <strong>Team up</strong>{" "}in the same window makes a tag team: two of you share one side against that trainer&apos;s team, on Normal.
      </p>
      <ul>
        <li>A coin flip decides who picks first. You take turns picking from the duel&apos;s six (as many as the duel brings), and each card belongs to whoever picked it.</li>
        <li>The player who picked second leads. After that, whoever owns the card on the field plays the turn. The Energy can go on any card on your side, and a swap can bring in your partner&apos;s card, which hands them the next turn.</li>
        <li>When a card is knocked out, its owner picks the next one, from either player&apos;s cards.</li>
        <li>Each turn has 60 seconds; three missed turns in a row, or a player leaving, ends the duel for both. No professor and no tools.</li>
        <li>A win shows stars against the duel&apos;s par, the same as playing it alone, but a tag duel doesn&apos;t go on your Trainer Road best or the board.</li>
      </ul>

      <h2>Battle each other</h2>
      <p>
        In the same window, <strong>Battle each other</strong>{" "}makes a trainer battle: one against one, with teams from that
        trainer&apos;s group (Gym Leaders, Elite Four, rivals, bosses or Champions). You start with that trainer&apos;s team and can change
        it; the other player picks theirs. Neither of you sees the other&apos;s team until the battle starts.
      </p>
      <ul>
        <li>At the start you each pick 3 cards to bring, after seeing the other team. A team of exactly 3 brings all three.</li>
        <li>You both pick a lead without seeing the other&apos;s, then a coin flip decides who goes first. The first player can&apos;t attack on the first turn.</li>
        <li>Turns go back and forth: play an Energy from your hand of 3, then attack, swap or end your turn. A card sent in after a knockout comes in with one Energy. Rain, sun and sandstorms come and go; there are no other events, no professor and no tools.</li>
        <li>Each turn has 60 seconds. A turn that runs out passes on its own, and three in a row lose the battle. Leaving the page for more than 2 minutes, or pressing Forfeit, gives the other player the win.</li>
        <li>Your wins and losses against each friend show at the end. Anyone with the link can watch, without seeing either hand.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>
        Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>. To report a wrong team or fact, use the{" "}
        <strong>Let us know</strong>{" "}link at the foot of any Daily Duel or Trainer Road page.
      </p>
    </HelpArticle>
  );
}
