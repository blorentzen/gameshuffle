import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/chat-commands";
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
      <h1>Twitch Chat Command Reference</h1>
      <p>
        Every GameShuffle chat command, grouped by what it does. Commands run in the chat of a
        GameShuffle Pro streamer. Viewer commands are free for anyone in chat; host and mod commands
        are marked below. Type <code>!gs help</code> in chat any time for a list tailored to your role.
      </p>
      <p>
        Most commands accept two forms: the modern spaced form (<code>!gs shuffle</code>) and the
        classic hyphenated form (<code>!gs-shuffle</code>). Both work; use whichever you like.
      </p>

      <h2>Info</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!gs</code></td><td>Anyone</td><td>What is GameShuffle? The one-liner.</td></tr>
          <tr><td><code>!gs help</code> · <code>!help</code></td><td>Anyone</td><td>List the commands available to you.</td></tr>
          <tr><td><code>!gs live</code> · <code>!live</code></td><td>Anyone</td><td>Link to the streamer&apos;s live GameShuffle page.</td></tr>
          <tr><td><code>!gs profile</code> · <code>!profile</code></td><td>Anyone</td><td>Share your GameShuffle profile in chat.</td></tr>
          <tr><td><code>!lurk</code></td><td>Anyone</td><td>Signal you&apos;re lurking; the bot welcomes you back on return.</td></tr>
          <tr><td><code>!gs mod</code></td><td>Mods + host</td><td>Get the link to join the streamer&apos;s GameShuffle mods (you sign in with Twitch).</td></tr>
        </tbody>
      </table>

      <h2>Lobby (viewers)</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!gs join</code> · <code>!join</code></td><td>Anyone</td><td>Join the active lobby.</td></tr>
          <tr><td><code>!gs leave</code> · <code>!leave</code></td><td>Anyone</td><td>Leave the lobby.</td></tr>
          <tr><td><code>!gs shuffle</code> · <code>!shuffle</code></td><td>Anyone</td><td>Roll your pick for the game on stream. In Overwatch and Marvel Rivals, add a role: <code>!gs shuffle tank</code>.</td></tr>
          <tr><td><code>!gs mycombo</code> · <code>!mycombo</code></td><td>Anyone</td><td>Show your current pick.</td></tr>
          <tr><td><code>!gs lobby</code> · <code>!lobby</code></td><td>Anyone</td><td>See who&apos;s in the lobby.</td></tr>
          <tr><td><code>!gs room</code> · <code>!room</code></td><td>Anyone</td><td>Get the streamer&apos;s current lobby room code.</td></tr>
          <tr><td><code>!gs fc</code> · <code>!fc</code></td><td>Anyone</td><td>Get the streamer&apos;s friend code for the current game.</td></tr>
        </tbody>
      </table>

      <h3>What a roll gives in each game</h3>
      <p>
        The game follows the streamer&apos;s Twitch category, and the lobby holds as many players as
        the game&apos;s online room.
      </p>
      <table>
        <thead><tr><th>Game</th><th>A roll gives</th><th>Lobby</th></tr></thead>
        <tbody>
          <tr><td>Mario Kart 8 Deluxe · Mario Kart World</td><td>A character and kart (plus wheels and glider in 8 Deluxe)</td><td>12 · 24</td></tr>
          <tr><td>Mario Kart 64</td><td>A racer</td><td>4</td></tr>
          <tr><td>Super Smash Bros. Ultimate</td><td>A fighter and costume</td><td>8</td></tr>
          <tr><td>Mario Party (Jamboree, Superstars, 1 to 3)</td><td>A character nobody else in the lobby has</td><td>4</td></tr>
          <tr><td>Overwatch · Marvel Rivals</td><td>A hero (add a role to pick from one role)</td><td>10 · 12</td></tr>
          <tr><td>Splatoon 3</td><td>A weapon kit: main, sub and special</td><td>8</td></tr>
          <tr><td>Kirby Air Riders</td><td>A rider and machine</td><td>16</td></tr>
          <tr><td>GoldenEye 007 · Perfect Dark</td><td>A multiplayer character</td><td>4</td></tr>
          <tr><td>Pokémon Stadium 1 and 2</td><td>The streamer&apos;s rental team (the streamer or a channel-points reroll; add a cup: <code>!gs shuffle prime</code>)</td><td>4</td></tr>
        </tbody>
      </table>

      <h2>Lobby control (mods &amp; host)</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!gs kick @user [minutes]</code></td><td>Mods + host</td><td>Kick a viewer from the lobby.</td></tr>
          <tr><td><code>!gs clear</code></td><td>Mods + host</td><td>Clear everyone from the lobby except you.</td></tr>
          <tr><td><code>!gs battle</code></td><td>Mods + host</td><td>A viewer battle: rolls everyone in the lobby at once, posts the lineup and shows it on your overlay. In Smash and Mario Party nobody gets the same pick, and Smash adds one stage from the competitive list.</td></tr>
          <tr><td><code>!gs setup</code></td><td>Mods + host</td><td>Rolls the match everyone plays on, posts it and shows it on your overlay: Mario Kart tracks (<code>!gs setup 8</code> for eight races, <code>rally</code> or <code>battle</code>), a Smash stage and rules (<code>party</code> for party rules), a Mario Party board and turns, an Overwatch or Marvel Rivals map (add a mode, like <code>push</code>), a Splatoon battle (<code>3</code> or <code>5</code> for a set, <code>salmon</code> for Salmon Run), a Kirby course (<code>top</code> or <code>city</code>), the whole GoldenEye or Perfect Dark match, or a Pokémon Stadium cup.</td></tr>
          <tr><td><code>!gs room set &lt;CODE&gt;</code></td><td>Host</td><td>Update the room code viewers see via <code>!gs room</code>.</td></tr>
        </tbody>
      </table>

      <h2>Stream tools (mods &amp; host)</h2>
      <p>These render on your OBS overlay. See <a href="/help/streaming/obs-overlay">Setting Up Your OBS Overlay</a> to place them.</p>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!spin</code></td><td>Mods + host</td><td>Spin your overlay wheel.</td></tr>
          <tr><td><code>!gs-dice [1-6]</code></td><td>Mods + host</td><td>Roll dice on your overlay.</td></tr>
          <tr><td><code>!gs-flip</code></td><td>Mods + host</td><td>Flip a coin on your overlay.</td></tr>
          <tr><td><code>!gs-timer 5m [label]</code> · <code>!gs-timer stop</code></td><td>Mods + host</td><td>Start or stop a countdown on the overlay.</td></tr>
          <tr><td><code>!gs-bingo new · mark &lt;n&gt; · clear</code></td><td>Mods + host</td><td>Run a shared community bingo board.</td></tr>
          <tr><td><code>!gs-tier new · place &lt;n&gt; &lt;S-D&gt; · clear</code></td><td>Mods + host</td><td>Run a live S-through-D tier list.</td></tr>
          <tr><td><code>!draw [count]</code></td><td>Mods + host</td><td>Draw raffle winner(s) onto the overlay.</td></tr>
        </tbody>
      </table>

      <h2>The wheel (viewer contributions)</h2>
      <p>Whether viewers can add to the wheel is set per wheel by the streamer.</p>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!wheel add &lt;option&gt;</code></td><td>Anyone*</td><td>Add an option to the wheel.</td></tr>
          <tr><td><code>!wheel remove &lt;option&gt;</code></td><td>Anyone*</td><td>Remove an option from the wheel.</td></tr>
          <tr><td><code>!wheel list</code> · <code>!wheel</code></td><td>Anyone</td><td>Show the wheel&apos;s current options.</td></tr>
          <tr><td><code>!wheel clear</code></td><td>Mods + host</td><td>Clear viewer entries from the wheel.</td></tr>
        </tbody>
      </table>

      <h2>Fun &amp; interaction (viewers)</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!gs-8ball &lt;question&gt;</code></td><td>Anyone</td><td>Ask the Magic 8-Ball; the answer shows on the overlay.</td></tr>
          <tr><td><code>!gs-decide &lt;question&gt;</code></td><td>Anyone</td><td>Let the overlay settle a yes/no.</td></tr>
          <tr><td><code>!gs-truth</code> · <code>!gs-dare</code></td><td>Anyone</td><td>Pull a Truth or Dare prompt onto the overlay.</td></tr>
          <tr><td><code>!enter</code></td><td>Anyone</td><td>Enter the streamer&apos;s raffle/giveaway.</td></tr>
          <tr><td><code>!8ball &lt;question&gt;</code></td><td>Anyone</td><td>Ask the magic 8-ball; the answer comes in chat.</td></tr>
          <tr><td><code>!roll [min-max]</code></td><td>Anyone</td><td>Roll a random number (1 to 100 unless you give a range).</td></tr>
          <tr><td><code>!choose a | b | c</code></td><td>Anyone</td><td>Pick one of the options at random.</td></tr>
          <tr><td><code>!engagement</code></td><td>Anyone</td><td>Check your engagement score for this stream.</td></tr>
        </tbody>
      </table>

      <h2>Polls and live games</h2>
      <p>
        Each has its own guide: <a href="/help/streaming/polls">polls</a>,{" "}
        <a href="/help/streaming/stream-bingo">Stream Bingo</a>,{" "}
        <a href="/help/streaming/chat-draft">Chat Draft</a>,{" "}
        <a href="/help/streaming/chat-brain">Chat Brain</a> and{" "}
        <a href="/help/streaming/who-said-it">Who Said It?</a>.
      </p>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!poll &lt;question&gt; | option 1 | option 2</code> · <code>!poll close</code></td><td>Mods + host</td><td>Open a poll with 2 to 8 options, or close it and announce the winner.</td></tr>
          <tr><td><code>!vote &lt;number&gt;</code></td><td>Anyone</td><td>Vote in the open poll, Chat Draft pick or Who Said It? round. Vote again to change it.</td></tr>
          <tr><td><code>!bingo start [pattern] [tokens] [prize]</code></td><td>Mods + host</td><td>Open a Stream Bingo game. Patterns: line, corners, x, frame, blackout, series, or one you made, by name.</td></tr>
          <tr><td><code>!bingo call</code> · <code>!bingo auto &lt;seconds&gt;</code> · <code>!bingo doors</code> · <code>!bingo end</code></td><td>Mods + host</td><td>Call a number, call on a timer, close sign-ups now, or end the game.</td></tr>
          <tr><td><code>!bingocard</code></td><td>Anyone</td><td>Where to get a Stream Bingo card.</td></tr>
          <tr><td><code>!draft start &lt;kind&gt;</code> · <code>!draft next</code> · <code>!draft end</code></td><td>Mods + host</td><td>Start a chat draft (pokemon, champions, kart, mkw, tracks, mkwtracks, stage, stages, smash or squad), skip to the next pick, or end it.</td></tr>
          <tr><td><code>!draft</code></td><td>Anyone</td><td>Show the draft&apos;s picks so far.</td></tr>
          <tr><td><code>!draft teams</code> · <code>!draft captains @a @b</code></td><td>Mods + host</td><td>Open sign-ups for a team draft, then name 2 to 4 captains.</td></tr>
          <tr><td><code>!draft in</code> · <code>!draft out</code></td><td>Anyone</td><td>Join or leave a team draft&apos;s sign-ups. Captains pick with <code>!pick &lt;name&gt;</code>.</td></tr>
          <tr><td><code>!a &lt;answer&gt;</code> · <code>!cb &lt;answer&gt;</code></td><td>Anyone</td><td>Answer the open Chat Brain question.</td></tr>
          <tr><td><code>!cb ask [seconds] [category or your own question]</code></td><td>Mods + host</td><td>Open a Chat Brain survey for chat.</td></tr>
          <tr><td><code>!cb start [boards] [seconds]</code> · <code>!cb next</code> · <code>!cb lock</code> · <code>!cb end</code></td><td>Mods + host</td><td>Run a Chat Brain game on published boards (add <code>speed</code> for a speed round).</td></tr>
          <tr><td><code>!whosaid</code> · <code>!whosaid reveal</code></td><td>Mods + host</td><td>Post a quote with the speaker hidden for chat to vote on, then reveal who said it.</td></tr>
        </tbody>
      </table>

      <h2>Break mode (mods &amp; host)</h2>
      <p>See <a href="/help/streaming/break-mode">Break mode</a> for the games chat plays while you&apos;re away.</p>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!gs brb [minutes]</code></td><td>Mods + host</td><td>Start break mode: GameShuffle runs games for chat until you&apos;re back. Add minutes to show when you&apos;ll be back.</td></tr>
          <tr><td><code>!gs back [now]</code></td><td>Mods + host</td><td>End break mode once the round in play finishes, or straight away with <code>now</code>.</td></tr>
          <tr><td><code>!gs pull</code></td><td>Mods + host</td><td>Skip a break question that&apos;s wrong; it stays off every channel until staff review it.</td></tr>
        </tbody>
      </table>

      <h2>Party nights</h2>
      <p>Available while the streamer runs a Mario Party night.</p>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!party</code> · <code>!party join</code></td><td>Anyone</td><td>Get the party night&apos;s join link, or take an open seat.</td></tr>
          <tr><td><code>!chance [help|crutch] [@name]</code> · <code>!chance vote</code></td><td>Mods + host</td><td>Deal a Chance card to someone seated or at random, or let chat vote who gets it.</td></tr>
          <tr><td><code>!mission [@name]</code> · <code>!mission done @name</code></td><td>Mods + host</td><td>Deal a mission, or confirm someone finished theirs.</td></tr>
        </tbody>
      </table>

      <h2>Picks &amp; bans</h2>
      <p>Available when a picks/bans round is open in the session.</p>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!pick &lt;option&gt;</code> · <code>!picks</code></td><td>Anyone</td><td>Cast a pick, or list current picks.</td></tr>
          <tr><td><code>!ban &lt;option&gt;</code> · <code>!bans</code></td><td>Anyone</td><td>Cast a ban, or list current bans.</td></tr>
          <tr><td><code>!gs picks open</code> · <code>!gs picks close</code></td><td>Host</td><td>Open or close a picks/bans round.</td></tr>
          <tr><td><code>!pickreset [@user]</code> · <code>!banreset [@user]</code></td><td>Mods + host</td><td>Reset picks or bans for a target.</td></tr>
        </tbody>
      </table>

      <h2>Race randomizer (host)</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!gs race [N]</code> · <code>!race</code></td><td>Host</td><td>Roll the race randomizer.</td></tr>
          <tr><td><code>!gs track [N]</code> · <code>!track</code></td><td>Host</td><td>Pick or randomize the next track.</td></tr>
          <tr><td><code>!gs items</code> · <code>!items</code></td><td>Host</td><td>Randomize the item mode.</td></tr>
          <tr><td><code>!gs rally</code></td><td>Host</td><td>Roll a knockout rally (Mario Kart World).</td></tr>
        </tbody>
      </table>

      <h2>Mario Kart lounge</h2>
      <p>
        Without a name, these read the streamer&apos;s <a href="/help/competitive/mmr-card">MMR card</a>; add a lounge
        name to look up anyone else.
      </p>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!mmr [lounge name]</code></td><td>Anyone</td><td>MMR, division, how far to the next one, world rank and tonight&apos;s run.</td></tr>
          <tr><td><code>!last10 [lounge name]</code></td><td>Anyone</td><td>The last ten events: record, MMR change, the best event and average score.</td></tr>
          <tr><td><code>!avg [lounge name]</code></td><td>Anyone</td><td>This season&apos;s average score, and partners&apos; average in team events.</td></tr>
          <tr><td><code>!tonight [lounge name]</code></td><td>Anyone</td><td>Tonight&apos;s events, record, MMR change and any new division.</td></tr>
          <tr><td><code>!compare &lt;name&gt; [name]</code></td><td>Anyone</td><td>Two players side by side: MMR, division, the gap and events played. One name compares with the streamer.</td></tr>
          <tr><td><code>!h2h &lt;name&gt; [name]</code></td><td>Anyone</td><td>Every event two players shared this season: who finished ahead and their record as teammates. One name compares with the streamer.</td></tr>
          <tr><td><code>!lounge [lounge name]</code></td><td>Anyone</td><td>A link to the player&apos;s lounge stats page.</td></tr>
          <tr><td><code>!odds</code></td><td>Anyone</td><td>The room the streamer checked tonight: seed, what each place pays, the break-even place and the favorite.</td></tr>
        </tbody>
      </table>

      <h2>Tournaments &amp; crews</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!gs-tourney next · prev · &lt;n&gt;</code></td><td>Mods + host</td><td>Advance the current race of your live tournament.</td></tr>
          <tr><td><code>!crews</code></td><td>Anyone</td><td>Show the <a href="/help/tournaments/multi-crew-tournaments">crew standings</a> for the live tournament.</td></tr>
        </tbody>
      </table>

      <h2>Tokens &amp; economy</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!tokens [@user]</code></td><td>Anyone</td><td>Check a token balance.</td></tr>
          <tr><td><code>!give @user &lt;amount&gt;</code></td><td>Anyone</td><td>Send tokens to another viewer.</td></tr>
          <tr><td><code>!leaderboard</code></td><td>Anyone</td><td>Top token holders in this community.</td></tr>
          <tr><td><code>!gs award @user &lt;amount&gt;</code></td><td>Host</td><td>Give a discretionary award to a viewer.</td></tr>
          <tr><td><code>!gs bounty &lt;amount&gt; &lt;description&gt;</code></td><td>Host</td><td>Open an outcome-pegged bounty.</td></tr>
          <tr><td><code>!gs bounty award @user</code> · <code>!gs bounty cancel</code></td><td>Host</td><td>Pay out or release the open bounty.</td></tr>
          <tr><td><code>!chaos</code></td><td>Anyone</td><td>Set off a chaos event for the game on stream. Costs tokens.</td></tr>
          <tr><td><code>!random</code></td><td>Anyone</td><td>Fire a free wild event: a token change, a story moment or a modifier.</td></tr>
          <tr><td><code>!opt-in</code> · <code>!opt-out</code> · <code>!consent</code></td><td>Anyone</td><td>Join or leave events that can take your tokens, or check where you stand.</td></tr>
        </tbody>
      </table>

      <h2>Prediction markets</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!bet &lt;option&gt; &lt;amount&gt;</code></td><td>Anyone</td><td>Bet on the active market.</td></tr>
          <tr><td><code>!gs market open [1|3|5]</code></td><td>Host</td><td>Open a prediction market with 1, 3, or 5 outcomes.</td></tr>
          <tr><td><code>!gs market lock</code> · <code>!gs market close</code></td><td>Host</td><td>Lock betting early, or cancel and refund.</td></tr>
          <tr><td><code>!gs resolve &lt;value&gt;</code></td><td>Host</td><td>Resolve the locked market and pay out.</td></tr>
        </tbody>
      </table>

      <h2>Custom commands (host)</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!commands add|edit|delete|list &lt;trigger&gt; [response]</code></td><td>Host</td><td>Create and manage your own chat commands.</td></tr>
        </tbody>
      </table>
      <p>
        Channels also have ready-made replies like <code>!socials</code>, <code>!rules</code>, <code>!discord</code> and
        {" "}<code>!quote</code>, which each streamer can turn off, reword or replace. To see what works on one channel, open
        its commands page at <code>gameshuffle.co/c/&lt;channel&gt;/commands</code>, or type <code>!commands</code> in its
        chat. Streamers manage theirs in <strong>Streaming</strong> &rsaquo; <strong>Chat</strong>{" "}&rsaquo;
        {" "}<strong>Commands</strong>.
      </p>

      <h2>Notes</h2>
      <ul>
        <li>Most commands have a short cooldown to keep chat clean; the broadcaster usually bypasses it.</li>
        <li>Some commands need an active session, an open round, or an enabled module. If nothing happens, the feature may not be running yet.</li>
        <li>Prediction market betting may show as spectator-only in certain regions for compliance.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> with any command questions.</p>
    </HelpArticle>
  );
}
