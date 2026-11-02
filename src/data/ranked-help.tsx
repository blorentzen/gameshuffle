/**
 * GS Ranked's help pages in English (name, web and docs pick 9A). Titles, descriptions and the order live in
 * src/lib/help/ranked.ts; these are the bodies. Facts here follow the code: the penalty numbers are each lounge's
 * starting values, which its staff can change.
 */

import type { ReactNode } from "react";
import Link from "next/link";

const H = (slug: string) => `/help/ranked/${slug}`;
const CONTACT = "/contact-us?topic=lounge";

export const RANKED_HELP_BODIES: Record<string, ReactNode> = {
  joining: (
    <>
      <p>A lounge on GS Ranked keeps its standings on GameShuffle and runs in its own Discord server. To play, tie your Discord account to your name on the lounge. You do it once.</p>
      <h2>If you&apos;ve played on the lounge before</h2>
      <ul>
        <li>In the lounge&apos;s Discord, type <code>/ranked join</code> with the name you play under.</li>
        <li>Or open the lounge&apos;s page on GameShuffle, sign in with Discord, type your name under <strong>You</strong> and press <strong>That&apos;s me</strong>.</li>
      </ul>
      <p>Your Discord goes on that name. A name that already has someone else&apos;s Discord is refused; ask the lounge&apos;s staff if it&apos;s yours.</p>
      <h2>If you&apos;re new to the lounge</h2>
      <p>Use the same command or box with the name you want. When nobody plays under it yet, you ask to join as that name. Some lounges add you on the spot when MKCentral vouches for you: your Discord is on one MKCentral profile, that profile has a Switch friend code, and it isn&apos;t banned. Otherwise the lounge&apos;s staff add you from their staff page.</p>
      <p>When you join, we look you up on MKCentral by your Discord, and you may start from your MKCentral number. See <Link href={H("from-mkcentral")}>Coming from MKCentral</Link>.</p>
      <h2>Changing your name</h2>
      <p>Use <code>/ranked name</code>, or <strong>Change my name</strong> on the lounge&apos;s page. Staff approve it, or the lounge lets clean names approve themselves (60 days apart, nobody else using it). Your old name stays on your page as an earlier name.</p>
    </>
  ),

  placement: (
    <>
      <p>Where a new player starts depends on the rules the lounge runs (see <Link href={H("mmr-rules")}>MMR rules explained</Link>).</p>
      <h2>MKCentral&apos;s model (150cc and Mario Kart World lounges)</h2>
      <p>You start at the lounge&apos;s starting MMR, and your first 5 tables count double. Until they&apos;re done, you show as <strong>Placement</strong> instead of a division.</p>
      <h2>The 200 Lounge&apos;s rules (200cc lounges)</h2>
      <p>Your first table&apos;s score places you: 110 or more starts you at 5,250 (Gold), 80 or more at 3,750 (Silver), 50 or more at 2,250 (Bronze), and anything less at 1,000 (Iron). A Tier C room asks 10 more points for each step. On that first table you count as 0 in your team&apos;s average, then you move like everyone else.</p>
      <h2>Starting from a number you already have</h2>
      <p>Two things start you placed, with your first 2 tables moving double to settle the number instead of a full placement:</p>
      <ul>
        <li>a start matched from your MKCentral record (<Link href={H("from-mkcentral")}>Coming from MKCentral</Link>);</li>
        <li>a soft reset at the start of a new season, which carries part of your last season&apos;s number over.</li>
      </ul>
    </>
  ),

  mmr: (
    <>
      <p>Every table the lounge&apos;s updaters verify moves the MMR of everyone in it. Your change depends on where your team finished and how strong the other teams were: beating stronger teams gains more, losing to weaker ones costs more. Everyone on a team moves by the team&apos;s change.</p>
      <h2>Divisions</h2>
      <p>Each lounge has a table of divisions by MMR, like the 200 Lounge&apos;s Iron, Bronze, Silver, Gold, Platinum, Diamond, Master and Grandmaster. Your division changes the moment your MMR crosses a line, and the table&apos;s card in Discord says who moved up or down. Some lounges keep your division as a role in their Discord too.</p>
      <h2>Where to see it</h2>
      <ul>
        <li>The lounge&apos;s page: this season&apos;s standings with everyone&apos;s last 10, the newest tables, and a Season menu for earlier seasons.</li>
        <li>Your player page: your chart, every table, penalties and bonuses, and your seasons.</li>
        <li><code>/ranked mmr</code> in the lounge&apos;s Discord, for you or anyone by name.</li>
        <li>Your <Link href={H("mmr-card")}>MMR card</Link> on stream.</li>
      </ul>
      <h2>Lines that aren&apos;t tables</h2>
      <p>A penalty takes MMR off as its own line on your page; taking one back adds it again as a bonus. When a teammate misses races, the rest of the team can lose less (see <Link href={H("penalties")}>Penalties and appeals</Link>).</p>
    </>
  ),

  queue: (
    <>
      <p>Lounges that run their queue on GameShuffle post a queue card in their Discord. The same queue shows on the lounge&apos;s page, and you can use either.</p>
      <h2>Joining</h2>
      <ul>
        <li><strong>Join</strong> and <strong>Leave</strong> put you in and take you out.</li>
        <li><strong>I can sub</strong> puts you on the sub list for rooms that lose a player.</li>
        <li><strong>I can host</strong> marks you as able to host; a star shows by your name.</li>
      </ul>
      <p>A queue can have an MMR range, like 7,000 and up. Players still placing join the lowest tier&apos;s queue. You can&apos;t join while you&apos;re on a break or already in a room.</p>
      <h2>When a room opens</h2>
      <ul>
        <li><strong>Always open:</strong> a room opens the moment the queue has 12 players (24 for Knockout Tour), first in, first placed.</li>
        <li><strong>Rush hour:</strong> join any time before the queue closes, a few minutes before the set time. At the time, everyone is sorted by MMR into rooms; whoever doesn&apos;t fill a room waits for the next one.</li>
      </ul>
      <p>The room&apos;s card pings everyone in it.</p>
      <h2>The format vote</h2>
      <p>Each room votes its format for 45 seconds, or until everyone has voted. The most votes wins, a tie goes to the bigger teams, and with no votes the biggest format the queue allows is played. A queue with one format, like Knockout Tour, skips the vote.</p>
      <h2>Teams and the host</h2>
      <p>Teams are drawn by MMR so each team averages about the same. The host is the highest MMR who marked I can host, or the highest MMR in the room if nobody did. The host makes the room in the game and posts its code with <strong>Room code</strong>.</p>
      <h2>Subs and drops</h2>
      <ul>
        <li><strong>Drop out</strong> takes you out of the room with the lounge&apos;s drop penalty.</li>
        <li>The host uses <strong>Need a sub</strong> to mark someone who didn&apos;t show; they get the same penalty.</li>
        <li>Either way, the first player on the sub list whose MMR fits the queue is pinged. They have two minutes to <strong>Take the spot</strong> or <strong>Pass</strong>, then the next sub is asked. If nobody fits, the host can play short.</li>
      </ul>
      <h2>After the room</h2>
      <p><strong>Submit the table</strong> on the room&apos;s card opens the table form with the teams filled in; add the scores or a screenshot of the results. The room closes once its table is in.</p>
    </>
  ),

  penalties: (
    <>
      <p>Lounge staff give penalties for breaking the lounge&apos;s rules. A penalty takes MMR off and can give strikes. These are the usual starting values; each lounge sets its own.</p>
      <ul>
        <li>Late: 50 MMR and 1 strike.</li>
        <li>Dropped before race 1: 200 MMR and 2 strikes.</li>
        <li>Dropped during the room: 100 MMR and 1 strike.</li>
        <li>Wrong tag: 50 MMR.</li>
      </ul>
      <p>You get a direct message from GameShuffle Competitive with the reason, and the penalty shows on your player page.</p>
      <h2>Strikes and breaks</h2>
      <p>Strikes last 30 days. Three active strikes start a 7-day break from the queue. Tables you&apos;re already in still count.</p>
      <h2>Appealing</h2>
      <p>Open the lounge&apos;s page, sign in with Discord, find the penalty under <strong>Your penalties</strong> and press <strong>Appeal</strong>. Say why it should be taken back. If staff agree, you get the MMR back and its strikes stop counting.</p>
      <h2>When a teammate misses races</h2>
      <p>Whoever submits the table can note who missed races. When a teammate misses 3 to 7 races, the rest of their team loses less, and with 8 or more they lose nothing. Gains aren&apos;t changed. A lounge can turn this off.</p>
    </>
  ),

  "from-mkcentral": (
    <>
      <p>MKCentral keeps each lounge player&apos;s Discord account. When you join a lounge on GS Ranked, or before your first table there, we look up your MKCentral lounge record by your Discord. There&apos;s nothing to type.</p>
      <h2>What number you start at</h2>
      <ul>
        <li><strong>The same scale:</strong> a 150cc lounge reads MKCentral&apos;s 150cc lounge, and a Mario Kart World lounge reads MKCentral&apos;s MK World lounge. You start at your MKCentral MMR.</li>
        <li><strong>Another scale:</strong> a 200cc lounge reads MKCentral&apos;s 150cc lounge, and a Knockout Tour lounge reads the 24-player lounge. Your rank there is matched to the same share of this lounge&apos;s players: top 18% on MKCentral starts you at this lounge&apos;s top 18%. This needs the lounge to have 50 rated players this season; before that you get its usual placement.</li>
      </ul>
      <h2>Which season</h2>
      <p>This MKCentral season if you&apos;ve played 10 events in it, otherwise last season&apos;s final number. Peaks aren&apos;t used.</p>
      <h2>Settling in</h2>
      <p>A matched start is a good guess, so your first 2 tables move double to settle it. Your division shows straight away.</p>
      <p>The reply when you join says where your start came from, and so does your player page. If it looks wrong, tell the lounge&apos;s staff. With no MKCentral record, you start with the lounge&apos;s usual placement (<Link href={H("placement")}>How placement works</Link>).</p>
    </>
  ),

  "mmr-card": (
    <>
      <p>The <Link href="/mmr-card">MMR card</Link> shows your MMR on stream as a browser source in OBS or Streamlabs, live after every table. It reads GS Ranked lounges as well as MKCentral.</p>
      <ul>
        <li>Sign in with the account that has your Discord tied to the lounge.</li>
        <li>On the MMR card page, pick your lounge under <strong>Rating from</strong>. We find your name through your Discord.</li>
        <li>Pick a look, then copy the card&apos;s link into a browser source.</li>
      </ul>
      <p>The card counts tonight&apos;s tables, shows your division and plays a moment when you move up.</p>
    </>
  ),

  moving: (
    <>
      <p>GS Ranked runs a lounge&apos;s tables, MMR and standings on GameShuffle, with GameShuffle Competitive (our Discord bot) in your server. It&apos;s free for lounges.</p>
      <h2>What your lounge gets</h2>
      <ul>
        <li>Tables submitted in Discord or on the web, with the screenshot read and checked, and verified by your updaters.</li>
        <li>MMR on your choice of rules, divisions, and pages for your standings, every player and every table.</li>
        <li>A staff page for tables, players, penalties, seasons, settings and a log of every action.</li>
        <li>A queue with rooms, format votes, teams by MMR, hosts and subs, if you want one.</li>
        <li>Penalties, strikes and breaks; appeals and name changes; seasons with resets; division roles in your Discord.</li>
        <li>Your players&apos; MMR card on stream.</li>
      </ul>
      <h2>The steps</h2>
      <ol>
        <li><Link href={CONTACT}>Talk to us</Link> first: we&apos;ll answer questions and bring in your history.</li>
        <li>Add GameShuffle Competitive to your server.</li>
        <li>Run <code>/ranked setup</code> (<Link href={H("setup")}>Setting up</Link>).</li>
        <li>We import your earlier seasons from your old bot (<Link href={H("history")}>Bringing in your history</Link>).</li>
        <li>Choose where your staff work and what checks itself (<Link href={H("discord-or-web")}>Discord or the web</Link>).</li>
        <li>Players tie their Discord to their names with <code>/ranked join</code>.</li>
      </ol>
      <p>Nothing about your lounge is announced until you say so.</p>
    </>
  ),

  setup: (
    <>
      <p>Someone who can manage the server runs <code>/ranked setup</code> once:</p>
      <ul>
        <li><strong>name:</strong> what your lounge is called, like 200cc Lounge.</li>
        <li><strong>address:</strong> its page, gameshuffle.co/ranked/your-address.</li>
        <li><strong>mode:</strong> Mario Kart 8 Deluxe 150cc (MKCentral&apos;s divisions and model), Mario Kart 8 Deluxe 200cc (the 200 Lounge&apos;s rules), Mario Kart World with 12 or 24 players, or Knockout Tour. The mode sets the game, rooms, divisions and MMR rules.</li>
        <li><strong>updaters:</strong> the role that verifies tables.</li>
        <li><strong>reporters:</strong> the role that submits tables. Leave it out to let anyone submit.</li>
        <li><strong>results:</strong> the channel where tables go for verifying. Leave it out to use the channel they&apos;re submitted in.</li>
      </ul>
      <h2>Who counts as staff</h2>
      <p>Staff are managed in your Discord. The server&apos;s owner and anyone who can manage the server are admins: everything, including settings and ending seasons. The updaters role verifies tables, gives penalties and handles requests. The staff page reads these roles when staff sign in with Discord.</p>
      <h2>Queues</h2>
      <p>Post a queue in a channel with <code>/ranked queue</code>, or add one on the staff page under <strong>Settings &gt; Queues</strong>. Each queue is always open or rush hour at set Pacific times, with an MMR range and the formats a room votes on.</p>
      <h2>Division roles</h2>
      <p>Turn on <strong>Division roles in Discord</strong> in Settings and every player tied to a Discord account gets their division&apos;s role, kept up to date. The roles are made the first time.</p>
      <h2>What the bot needs</h2>
      <p>GameShuffle Competitive needs to send messages and attach files in your results and queue channels, and Manage Roles for division roles (its own role above the division roles).</p>
    </>
  ),

  verifying: (
    <>
      <h2>How a table comes in</h2>
      <p>Reporters submit with <code>/ranked submit</code> in Discord, from a room&apos;s card, or on the lounge&apos;s page. They attach the results screenshot, type the players and scores, or both. The screenshot is always read when there is one.</p>
      <p>Before the table reaches you, the reporter sees anything to check: scores that don&apos;t add up to a full room, a name typed twice, names new to the lounge, a room the wrong size. They fix it or send it anyway. A table that can&apos;t be scored as typed can&apos;t be sent.</p>
      <h2>Verifying</h2>
      <p>The table&apos;s card in your results channel shows the table and why it&apos;s waiting, with <strong>Verify</strong>, <strong>Send back</strong> (with a note for the reporter), <strong>Fix the text</strong> and a link to the staff page. On the staff page, the Tables tab lists every table waiting with its reasons. <strong>Review</strong> shows the screenshot beside each player as typed and as read, the differences marked, and <strong>Use the screenshot&apos;s numbers and verify</strong> fixes the text in one press. Whatever you press on either shows on both.</p>
      <p>A verified card shows everyone&apos;s change and who moved division. <strong>Undo</strong> puts everyone&apos;s MMR back.</p>
      <h2>What checks itself</h2>
      <p>With <strong>Clean tables verify themselves</strong> on, a table verifies on its own 10 minutes after it comes in when the text and the screenshot agree exactly, every name is known, and nobody asked for a penalty or reduced loss on it. Its card says when. Anything else waits for an updater, with the reasons listed. Turn it on in the staff page&apos;s Settings.</p>
      <h2>Missed races</h2>
      <p>The table form has a <strong>Missed races</strong> box, like Vex 5. Teammates of a player who missed 3 to 7 races lose less, and with 8 or more they lose nothing. A table with missed races always waits for an updater.</p>
    </>
  ),

  discipline: (
    <>
      <h2>Giving a penalty</h2>
      <ul>
        <li>In Discord: <code>/ranked penalty</code> with the player&apos;s name and what it&apos;s for. The lounge&apos;s usual MMR and strikes for that kind are used unless you set them. The reply has <strong>Take it back</strong>.</li>
        <li>On the staff page: <strong>Give a penalty</strong> on the Penalties tab, or from a player found on the Players tab.</li>
      </ul>
      <p>The player gets a direct message with the reason. A player with no MMR this season can still get strikes (set MMR to 0).</p>
      <h2>Strikes and breaks</h2>
      <p>Strikes last 30 days, and 3 active strikes start a 7-day break from the queue. The Penalties tab lists everyone with strikes or a break; <strong>End break</strong> ends one early. All of these numbers, and each kind&apos;s MMR and strikes, are on the Settings tab.</p>
      <h2>Drops from the queue</h2>
      <p>A player who drops out of a room, or whom the host marks as a no-show, gets the lounge&apos;s penalty for dropping before race 1. Take it back from the Penalties tab if it was wrong.</p>
      <h2>Reports, appeals and names</h2>
      <p>Players appeal from the lounge&apos;s page and ask for new names with <code>/ranked name</code> or on the page. Appeals and name changes wait on the Players tab, and reports on the Penalties tab. Accepting does the thing: the penalty is taken back, the name changes. Every action goes in the Log tab, with who did it and from where.</p>
    </>
  ),

  seasons: (
    <>
      <p>Admins end a season on the staff page&apos;s Seasons tab with <strong>End Season</strong>. Tables still waiting have to be verified or sent back first, since they belong to the season they were played in.</p>
      <h2>Soft or full reset</h2>
      <ul>
        <li><strong>Soft reset:</strong> everyone rated keeps part of their distance from the season&apos;s middle MMR (a quarter, half or three quarters), starts the new season already placed, and their first 2 tables move double.</li>
        <li><strong>Full reset:</strong> everyone starts over and places again.</li>
      </ul>
      <p>The champion and the next places are posted in your results channel. The finished season stays on the lounge&apos;s page under the Season menu. Ending a season can&apos;t be undone.</p>
    </>
  ),

  history: (
    <>
      <p>Your lounge&apos;s earlier seasons can come with you: every table, penalty and bonus, players&apos; earlier names and their Discord accounts. Past seasons show under the Season menu, marked as from the lounge&apos;s own records.</p>
      <h2>How it works</h2>
      <ol>
        <li>Send us your old bot&apos;s export (a MySQL dump of its tables, or a spreadsheet of tables) through <Link href={CONTACT}>Lounge help</Link>.</li>
        <li>We read it and show you a check: seasons, tables, players, and whether the numbers match your bot&apos;s own formula.</li>
        <li>Once you&apos;re happy, we import it. An import can be undone.</li>
      </ol>
      <p>A season that already has tables played on GameShuffle can&apos;t be filled from an import. Importing a season again replaces it.</p>
    </>
  ),

  "discord-or-web": (
    <>
      <p>Every staff action works in Discord and on the staff page, and shows in both. The staff page is at gameshuffle.co/ranked/your-address/staff; sign in with Discord and your roles in the lounge&apos;s server let you in. <code>/ranked staff</code> gives the link, and every table card has a Staff page button.</p>
      <h2>Where waiting tables show</h2>
      <p>In Settings, choose <strong>Both</strong>, <strong>Discord</strong> (a card in the results channel) or <strong>The web</strong> (the staff page only). Verified tables and send backs always post in the results channel, so players see their numbers and reporters hear back.</p>
      <h2>What checks itself</h2>
      <ul>
        <li><strong>Clean tables verify themselves</strong> (<Link href={H("verifying")}>Verifying tables</Link>).</li>
        <li><strong>New players verify themselves</strong> when MKCentral has their Discord on one profile, with a Switch friend code and no ban.</li>
        <li><strong>Name changes approve themselves</strong> for clean names, 60 days apart.</li>
      </ul>
      <p>Anything that doesn&apos;t pass waits on the staff page with the reason.</p>
    </>
  ),

  commands: (
    <>
      <p>Every command is <code>/ranked</code> in the lounge&apos;s Discord, from GameShuffle Competitive.</p>
      <div className="help-table-wrap" role="region" aria-label="Commands and their web pages" tabIndex={0}>
        <table>
          <thead><tr><th>In Discord</th><th>What it does</th><th>On the web</th></tr></thead>
          <tbody>
            <tr><td><code>/ranked setup</code></td><td>Puts the server&apos;s lounge on GS Ranked (managers)</td><td>Staff page, Settings</td></tr>
            <tr><td><code>/ranked join</code></td><td>Ties your Discord to your name, or asks to join</td><td>The lounge&apos;s page, You</td></tr>
            <tr><td><code>/ranked submit</code></td><td>Submits a room&apos;s table</td><td>The lounge&apos;s page, Submit a table</td></tr>
            <tr><td><code>/ranked mmr</code></td><td>A player&apos;s MMR, division and rank</td><td>The lounge&apos;s page and player pages</td></tr>
            <tr><td><code>/ranked name</code></td><td>Asks for a new name</td><td>The lounge&apos;s page, Change my name</td></tr>
            <tr><td><code>/ranked queue</code></td><td>Posts a queue in this channel (updaters)</td><td>Staff page, Settings, Queues</td></tr>
            <tr><td><code>/ranked penalty</code></td><td>Gives a penalty (updaters)</td><td>Staff page, Penalties</td></tr>
            <tr><td><code>/ranked staff</code></td><td>Links the staff page (updaters)</td><td>gameshuffle.co/ranked/your-address/staff</td></tr>
            <tr><td>Table card buttons</td><td>Verify, Send back, Fix the text, Undo</td><td>Staff page, Tables</td></tr>
            <tr><td>Queue card buttons</td><td>Join, Leave, I can sub, I can host</td><td>The lounge&apos;s page, Queue</td></tr>
            <tr><td>Room card buttons</td><td>Vote, Room code, Need a sub, Drop out, Submit the table</td><td>The lounge&apos;s page, your room</td></tr>
          </tbody>
        </table>
      </div>
      <p>When a server runs more than one lounge, each command takes a <strong>lounge</strong> option.</p>
    </>
  ),

  "mmr-rules": (
    <>
      <p>A lounge runs one of two rule sets, chosen by its mode. In both, a team is rated at its players&apos; average MMR and every player on a team moves by the team&apos;s change.</p>
      <h2>MKCentral&apos;s model</h2>
      <p>Used by 150cc and Mario Kart World lounges, on the same scale as MKCentral&apos;s lounges. Every pair of teams in the room is compared: you gain for finishing ahead of a team and lose for finishing behind, by how unexpected the result was given the two ratings. A pair is worth more in bigger formats. A new player&apos;s first 5 tables count double.</p>
      <h2>The 200 Lounge&apos;s rules</h2>
      <p>Used by 200cc lounges, rebuilt from the 200cc Lounge&apos;s own bot and checked against its records. Every pair of teams moves points: beating a team pays more the higher its rating was compared with yours, and a tie moves points toward the lower team. A team&apos;s change is the total, rounded down. A new player is placed by their first table&apos;s score (<Link href={H("placement")}>How placement works</Link>) and counts as 0 in their team&apos;s average on that table.</p>
      <h2>Settling</h2>
      <p>A start carried from a soft reset or matched from MKCentral moves double for its first 2 tables, under either rule set.</p>
    </>
  ),

  glossary: (
    <dl className="help-glossary">
      <dt>Lounge</dt><dd>A competitive community with its own Discord server, tables and standings.</dd>
      <dt>Table</dt><dd>One room&apos;s results: every player, their team and their score or place.</dd>
      <dt>Reporter</dt><dd>Someone who can submit tables (the reporters role, or anyone when there isn&apos;t one).</dd>
      <dt>Updater</dt><dd>Staff who verify tables and handle penalties and requests.</dd>
      <dt>Admin</dt><dd>The server&apos;s owner and anyone who can manage it: everything updaters do, plus settings and seasons.</dd>
      <dt>MMR</dt><dd>Your rating on the lounge. Tables move it; penalties take it off.</dd>
      <dt>Division</dt><dd>A named band of MMR, like Gold or Diamond.</dd>
      <dt>Placement</dt><dd>A new player&apos;s first tables, which count double (or, on 200 Lounge rules, the first table&apos;s score).</dd>
      <dt>Settling</dt><dd>A carried or matched start&apos;s first 2 tables, which move double.</dd>
      <dt>Strike</dt><dd>A mark that lasts 30 days. Enough of them start a break.</dd>
      <dt>Break</dt><dd>Time out of the queue.</dd>
      <dt>Reduced loss</dt><dd>Teammates losing less when a player missed races.</dd>
      <dt>Rush hour</dt><dd>A queue that makes rooms by MMR at set times.</dd>
      <dt>Sub</dt><dd>A player who takes the spot of someone who dropped.</dd>
      <dt>Soft reset</dt><dd>A new season where everyone keeps part of their number.</dd>
    </dl>
  ),

  questions: (
    <>
      <h2>Is GS Ranked free?</h2>
      <p>Yes, for lounges and their players.</p>
      <h2>Do I need a GameShuffle account?</h2>
      <p>Not to play in Discord. You need one, signed in with Discord, to use the lounge&apos;s page and for staff to use the staff page.</p>
      <h2>Why is my table waiting?</h2>
      <p>Its card lists why: often the screenshot and the text disagree, a name is new, or someone missed races. An updater will verify it.</p>
      <h2>My MMR looks wrong.</h2>
      <p>Your player page lists every table and penalty that moved it. If one is wrong, ask the lounge&apos;s staff; they can undo a table or take a penalty back.</p>
      <h2>I changed my in-game name.</h2>
      <p>Ask for the new name with <code>/ranked name</code> (<Link href={H("joining")}>Joining a lounge</Link>).</p>
      <h2>Can I play in more than one lounge?</h2>
      <p>Yes. Each lounge has its own MMR and standings.</p>
    </>
  ),

  support: (
    <>
      <p>Lounge staff reach us through the contact form&apos;s <strong>Lounge help</strong> topic. Tell us which lounge and how urgent it is; anything stopping your lounge comes to the front.</p>
      <ul>
        <li>What happened, and what you expected.</li>
        <li>The table number or player name, if it&apos;s about one.</li>
        <li>A screenshot, if you have one.</li>
      </ul>
      <p><Link href={CONTACT}>Contact us about your lounge</Link>. You can also email support@gameshuffle.co. Players: ask your lounge&apos;s staff first; they can fix most things themselves.</p>
    </>
  ),
};
