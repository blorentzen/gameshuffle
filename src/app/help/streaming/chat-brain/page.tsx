import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/chat-brain";
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
      <h1>Chat Brain on stream</h1>
      <p>
        Chat Brain is our survey game: guess what most people said. Each board is a question with the top answers people gave,
        worth more points the more people said them. On stream you can play boards with your chat, race chat in a speed round, run
        them as 1v1 or Teams with chat playing along, and run surveys that help build new boards. Games on stream are a GameShuffle
        Pro feature; surveys are free.
      </p>
      <p>
        Start everything from <strong>Streaming &gt; Live games &gt; Chat Brain</strong>, or the <strong>Live games</strong> tab on your
        stream page. Mods with Full access can run it from their mod page too. Add the <strong>Chat Brain</strong> piece in Overlay
        Layout to show the board on stream (see <Link href="/help/streaming/obs-overlay">the OBS overlay</Link>).
      </p>

      <h2>Chat plays</h2>
      <p>Chat is one team against 1 to 5 boards.</p>
      <ul>
        <li>The question shows, then chat has a set time to guess (15, 30, 45 or 60 seconds; you pick). Viewers answer with <code>!a &lt;answer&gt;</code>, and answering again changes their answer.</li>
        <li>Whatever most of chat says is chat&apos;s answer. If it&apos;s on the board and still hidden, chat banks its points. Anything else, including nobody answering, is a strike.</li>
        <li>The board ends when chat finds everything or takes three strikes. The rest is revealed, and you move on with <strong>Next board</strong> or <code>!cb next</code>.</li>
      </ul>
      <p>Start from the dashboard, or type <code>!cb start</code> (<code>!cb start 3 45</code> for 3 boards and 45-second guesses).</p>

      <h2>Speed round</h2>
      <p>
        A race instead of a vote. The board stays open, and the first viewer to type a hidden answer with <code>!a</code>{" "}reveals it and
        takes its points. Every find restarts a 20-second timer; when it runs out with nobody finding anything, that&apos;s a strike, and
        three strikes ends the board. Each answer on the board shows who found it, and the fastest viewers are called out at the end.
      </p>
      <p>
        Pick <strong>Speed round</strong> under <strong>Who plays</strong>, or type <code>!cb start speed</code> (<code>!cb start speed 2</code>{" "}
        for 2 boards). Because the first answer wins, it plays best on low-latency streams: viewers on normal latency see the question
        a few seconds after everyone else.
      </p>

      <h2>Co-stream: your chat against another streamer&apos;s</h2>
      <p>
        Two channels, one game. Pick <strong>Co-stream</strong> under <strong>Who plays</strong>, search for the other streamer (they
        need a GameShuffle account with Twitch connected and our bot in their chat) and send the invite. They get a notification and
        accept on their own Chat Brain tab; you start the game when you&apos;re both live. Only you need GS Pro to run it.
      </p>
      <ul>
        <li><strong>Face-off:</strong> each round opens with both chats answering at once with <code>!a</code>, each in their own channel. The chat whose answer ranks higher takes control. Same answer? The chat that typed it first. Nobody on the board after three tries, and you pick who plays.</li>
        <li><strong>Control and steal:</strong> the chat in control keeps answering until it clears the board or takes three strikes; then the other chat gets one answer to steal the round.</li>
        <li><strong>Points:</strong> every answer found goes into the round&apos;s pot and the winner banks it. The last round is worth double. The board shows on both overlays (each streamer adds the Chat Brain piece) and the lines go to both chats.</li>
        <li><strong>Who runs it:</strong> you and your mods set the pace (<strong>Next round</strong>, <code>!cb next</code>, <code>!cb lock</code>, <code>!cb control 1</code> or <code>2</code> after three empty face-offs). Either streamer can leave, which ends the game with the scores as they are. In a Twitch Shared Chat, each message counts for the channel it was typed in.</li>
      </ul>

      <h2>Prizes for the top brains</h2>
      <p>
        When you start any game, you can put up a token prize (25 to 500 tokens). When the game ends, the top three viewers by points
        split it 50/30/20 (60/40 if only two scored, all of it for one; viewers tied on points share). In a speed round that&apos;s the
        fastest finders; in every other game it&apos;s the play-along points. Prizes come out of your monthly token allowance, and the
        dashboard shows how much you have left. The winners are named in chat with what they won.
      </p>

      <h2>Playing on your live page</h2>
      <p>
        Viewers watching on your GameShuffle live page see the board there too, and once signed in they can answer from the page
        instead of chat: a guess, a speed-round find, a play-along guess or a survey answer, whatever is open. A viewer with Twitch
        linked to their account is the same player as in chat, so their points add up in one place.
      </p>

      <h2>1v1 and Teams</h2>
      <p>
        Two sides on stream play for each board: two players (say you and a guest) or two teams of 2 to 5. Start these from the
        dashboard: pick <strong>1v1</strong> or <strong>Teams</strong> under <strong>Who plays</strong> and add the names. Players say
        their answers out loud and you (or a mod) type them in. Hidden answers stay hidden on your screen too, so you can play.
      </p>
      <ul>
        <li><strong>Face-off:</strong> each round starts with one player from each side. Type the first answer you heard and press who said it. The top answer wins control straight away; otherwise the other side answers too and the higher answer wins. If nobody finds one after three tries, you pick who plays.</li>
        <li><strong>Control:</strong> the side in control keeps answering. Clear the board and they bank the round. In Teams, players take turns, and the dashboard shows who&apos;s up.</li>
        <li><strong>Steal:</strong> after three strikes, the other side gets one answer. A hit takes the round; a miss leaves it with the side in control.</li>
        <li><strong>Points:</strong> every answer found goes into the round&apos;s pot, and whoever wins the round banks it. The last round is worth double. Most points after the last round wins.</li>
      </ul>
      <p>Made a typo? <strong>Undo the last answer</strong> (or <code>!cb undo</code>) takes it back for a minute after, as long as nothing else was answered.</p>

      <h2>What chat does in 1v1 and Teams</h2>
      <ul>
        <li><strong>Play along (always on):</strong> while a side answers, viewers guess with <code>!a</code> too. Anyone who finds a hidden answer scores its points on their own, and the top viewers are called out at the end.</li>
        <li><strong>Trust chat? (optional):</strong> on a side&apos;s last guess before a third strike, and on a steal, the side locks in its answer first. Then chat&apos;s answer shows next to it, and the side picks which one to play. At the end of the round everyone sees whether chat was right.</li>
        <li><strong>Chat&apos;s last steal (optional):</strong> if the steal misses, chat gets one guess to take the round&apos;s points for itself. Not when the side already went with chat&apos;s answer on that steal.</li>
      </ul>

      <h2>Survey your chat</h2>
      <p>
        Ask chat a question and everyone answers with <code>!a</code>. Use the <strong>Survey your chat</strong> card on the Chat Brain
        screen, or <code>!cb ask</code> in chat. Chat has 60 seconds by default (<code>!cb ask 90</code> for longer, from 30 seconds up to
        3 minutes), and <code>!cb lock</code> or <strong>Close it now</strong> ends it early.
      </p>
      <ul>
        <li><strong>Your own question</strong> (GS Pro): <code>!cb ask what should I play next?</code> Answers show on stream as they come in: the same answers group together, AI folds in ones that mean the same thing, and each group gets a bar. Add <code>hidden</code> (<code>!cb ask hidden what&apos;s my worst habit?</code>) to keep them secret, for a board you&apos;ll play next.</li>
        <li><strong>A GameShuffle question</strong> (free): <code>!cb ask</code> on its own, or with a category like <code>!cb ask food</code>. Chat&apos;s answers help build the boards everyone plays, so they stay secret on stream.</li>
      </ul>
      <p>
        A group only shows on stream once two or more people gave it. If one shouldn&apos;t be there, hide it (<code>!cb hide 3</code>, using
        its number on stream, or <strong>Hide</strong> on the card). Same answer in different words? <code>!cb merge 1 4</code> folds 4 into 1,
        or pick them on the card and press <strong>Merge</strong>.
      </p>
      <h3>Play the board chat made</h3>
      <p>
        When your own question gets 10 or more answers, with at least 3 answers two or more people gave, it becomes a board. Play it
        straight away: <code>!cb start survey</code> starts Chat plays with it, or turn on <strong>Start with my survey board</strong> before
        starting any game, including 1v1 and Teams (guests guessing what your chat said works well).
      </p>

      <h2>Chat commands</h2>
      <ul>
        <li>Everyone: <code>!a &lt;answer&gt;</code> to answer or play along, <code>!cb</code> to see where the game stands.</li>
        <li>You and your mods, any game: <code>!cb lock</code> closes the guess now, <code>!cb next</code>, <code>!cb time 30</code>, <code>!cb end</code>. <code>!cb start survey</code> starts on the board your last survey made, and <code>!cb start speed</code> starts a speed round.</li>
        <li>Surveys: <code>!cb ask [seconds] [hidden] [category or your question]</code>, <code>!cb hide &lt;n&gt;</code>, <code>!cb merge &lt;n&gt; &lt;m&gt;</code>, <code>!cb lock</code>.</li>
        <li>Chat plays: <code>!cb accept [answer]</code> counts the last miss (naming the answer it should be), <code>!cb reject</code> takes back the last hit. Both work for 30 seconds.</li>
        <li>1v1 and Teams: <code>!cb play &lt;answer&gt;</code> enters what the side said (in a face-off, <code>!cb play &lt;side&gt; &lt;answer&gt;</code> for whoever answered first; the side can be its name or 1 or 2), <code>!cb trust chat</code> or <code>!cb trust team</code>, <code>!cb control &lt;side&gt;</code>, <code>!cb undo</code>.</li>
      </ul>
    </HelpArticle>
  );
}
