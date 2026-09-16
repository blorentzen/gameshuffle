import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/chat-commands";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
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
        </tbody>
      </table>

      <h2>Lobby (viewers)</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!gs join</code> · <code>!join</code></td><td>Anyone</td><td>Join the active lobby.</td></tr>
          <tr><td><code>!gs leave</code> · <code>!leave</code></td><td>Anyone</td><td>Leave the lobby.</td></tr>
          <tr><td><code>!gs shuffle</code> · <code>!shuffle</code></td><td>Anyone</td><td>Roll a fresh kart loadout.</td></tr>
          <tr><td><code>!gs mycombo</code> · <code>!mycombo</code></td><td>Anyone</td><td>Show your current combo.</td></tr>
          <tr><td><code>!gs lobby</code> · <code>!lobby</code></td><td>Anyone</td><td>See who&apos;s in the lobby.</td></tr>
          <tr><td><code>!gs room</code> · <code>!room</code></td><td>Anyone</td><td>Get the streamer&apos;s current lobby room code.</td></tr>
          <tr><td><code>!gs fc</code> · <code>!fc</code></td><td>Anyone</td><td>Get the streamer&apos;s friend code for the current game.</td></tr>
        </tbody>
      </table>

      <h2>Lobby control (mods &amp; host)</h2>
      <table>
        <thead><tr><th>Command</th><th>Who</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>!gs kick @user [minutes]</code></td><td>Mods + host</td><td>Kick a viewer from the lobby.</td></tr>
          <tr><td><code>!gs clear</code></td><td>Mods + host</td><td>Clear everyone from the lobby except you.</td></tr>
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
