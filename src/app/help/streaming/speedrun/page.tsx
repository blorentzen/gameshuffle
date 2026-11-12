import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/streaming/speedrun";
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
      <h1>Speedrun overlay</h1>
      <p>
        The <Link href="/speedrun">speedrun overlay</Link>{" "}puts your run on stream the instant you split: every split with
        ahead or behind, the timer, your PB and sum of best, and a moment on screen for each gold split and new PB. It works
        for any game and any category, and it&apos;s free with a GameShuffle account. Set it up on{" "}
        <Link href="/speedrun">/speedrun</Link>, or in Studio ▸ Tools ▸ Speedrun.
      </p>

      <h2>Connect LiveSplit (Windows)</h2>
      <ol>
        <li>On your speedrun setup, under <strong>Which timer do you use?</strong>, pick <strong>LiveSplit</strong> and press <strong>Download</strong> for GameShuffle for LiveSplit, a free, open source add-on.</li>
        <li>Unzip it into LiveSplit&apos;s <strong>Components</strong>{" "}folder (next to LiveSplit.exe) and restart LiveSplit.</li>
        <li>Right-click LiveSplit, then <strong>Edit Layout</strong>, <strong>+</strong>, <strong>Other</strong>, <strong>GameShuffle</strong>.</li>
        <li>Copy your address from the setup, then in <strong>Layout Settings</strong>, on the <strong>GameShuffle</strong>{" "}tab, press <strong>Paste</strong>.</li>
      </ol>
      <p>
        From then on LiveSplit connects by itself every time it opens, and the add-on sends your game, category and
        attempt count from your splits file (switch that off on its tab if you&apos;d rather type them). It adds nothing
        you can see to your timer unless you turn on its status line, and LiveSplit keeps it up to date by itself. Your
        address is kept on your computer, not in your layout, so sharing a layout never shares it.
      </p>

      <h2>Connect LiveSplit One</h2>
      <ol>
        <li>On your speedrun setup, pick <strong>LiveSplit One</strong>{" "}and press <strong>Copy</strong>{" "}under your server address.</li>
        <li>In LiveSplit One (free, in the browser at one.livesplit.org), open <strong>Settings</strong>, then <strong>Connect to Server</strong>, and paste it.</li>
        <li>Press <strong>Connect</strong> each time you open LiveSplit One. It remembers the address, but it doesn&apos;t connect by itself.</li>
      </ol>
      <p>
        The setup shows <strong>Connected</strong>{" "}once your timer is talking to GameShuffle, and says which one. Your
        splits, PB and sum of best come from the splits file you have open.
      </p>

      <h2>Add the overlay to OBS</h2>
      <p>
        Press <strong>Copy for OBS</strong>, then in OBS add a <strong>Browser</strong> source, paste the link and set it
        to <strong>1920 × 1080</strong>. It&apos;s see-through, so there&apos;s no color key to set up. It works in any
        OBS version and in Streamlabs, and in any streaming app that takes a browser source.
      </p>

      <h2>Pick a look</h2>
      <ul>
        <li><strong>Column</strong> puts every split down the side; <strong>Strip</strong> puts one line along the bottom or top so the game fills the screen.</li>
        <li><strong>On the Column</strong> switches each number on or off: PB, sum of best, attempt count, previous segment and pace.</li>
        <li>Free: a dark, light or see-through surface, GameShuffle blue or one color of your own, glyphs, glow or solid behind the panel, two fonts, and &quot;Built by GameShuffle&quot; or the GameShuffle mark under the Column.</li>
        <li>With GS Pro or Supporter looks: brand themes, two colors of your own, stripes or dots, more fonts, a two-color border, and hiding the GameShuffle line or putting a line of your own there. You can try them in the preview first; your overlay shows them once you have looks.</li>
      </ul>
      <p>Ahead is always green with an arrow down, behind red with an arrow up, and a best ever segment gold with a star, whatever the look.</p>

      <h2>Your splits</h2>
      <p>
        With LiveSplit or LiveSplit One connected, your splits come from your timer. Without one, or to start a new run,
        set them under <strong>Your splits</strong>{" "}three ways:
      </p>
      <ul>
        <li><strong>Start from a template</strong>: ready-made lists for Mario Kart 8 Deluxe (48 Tracks, Nitro, Retro, Bonus, Booster Course, 96 Tracks or one cup), Mario Kart World (32 Tracks or one cup), Mario Kart 64 (16 Tracks or one cup), Kirby Air Riders (the 18 Air Ride courses) and Pokémon FireRed &amp; LeafGreen (Any%). Mario Kart lists split on every track with cups as groups, or one split a cup, and your speed and items name the category. For any other game, <strong>Number them</strong>: a name and a range (World 1 to 8), plus a last split if you like.</li>
        <li><strong>Type them</strong>: one per line. To group splits the way LiveSplit does, start a line with - and name the group&apos;s last split {"{Group} Name"}.</li>
        <li><strong>Bring a LiveSplit file</strong>: your .lss file from LiveSplit or LiveSplit One. Its PB, best splits, game, category and attempt count come with it, so ahead and behind show from your first run.</li>
      </ul>
      <p>
        <strong>Download for LiveSplit</strong>{" "}saves any of these as a splits file to open in LiveSplit or LiveSplit One.
        Grouped splits show on stream as plain names, with the cup beside the split you&apos;re on.
      </p>

      <h2>My runs</h2>
      <p>
        Keep several runs, each with its own splits, PB and attempts, like a splits file each. <strong>Add a run</strong>{" "}
        starts a fresh one; <strong>Use this run</strong>{" "}puts another on stream (between attempts). With GameShuffle for
        LiveSplit, opening another splits file in LiveSplit switches the run on its own, and a file it hasn&apos;t seen
        becomes a new run.
      </p>

      <h2>Races</h2>
      <p>
        Race other runners live, 2 to 8 of you, each on your own timer and stream. Under <strong>Races</strong>{" "}on the
        speedrun page, <strong>Make a race</strong>{" "}takes your game, category and splits and gives you a link to share.
        Pick how many runners and whether anyone with the link can join or only people you invite.
      </p>
      <ul>
        <li>Everyone&apos;s splits need the same count, and every timer has to be one GameShuffle can start: LiveSplit with GameShuffle for LiveSplit (remote control on), LiveSplit One, or the phone remote open. The race page says who isn&apos;t set.</li>
        <li>Keep your timer at 0:00 and mark yourself ready. Once at least two runners are ready, the host starts a 10 second countdown, and GameShuffle starts every timer at 0. Anyone not ready sits that race out.</li>
        <li>Places and gaps compare the same split on each runner&apos;s own clock, so a slow connection never decides a race. A reset forfeits. The race ends when everyone has finished or is out; the host can also end it.</li>
        <li>Your overlay shows the race beside your splits. For a restream or commentary, add the race&apos;s link with <code>/obs</code>{" "}on the end to OBS: every runner as a lane. Both wait out each runner&apos;s <strong>Replies wait</strong>.</li>
        <li>With GS Pro, chat can bet Arcade Tokens on who wins (<code>!bet nova 100</code>, or a runner&apos;s number). Bets lock a quarter of the way in and settle at the finish.</li>
        <li>With 4 or more runners you can race in teams: pick 2 to 4 teams when you make the race, and whether a team scores everyone&apos;s times added up or its fastest runner. Everyone picks a team in the race&apos;s room before the start, and the race page shows the teams above the runners.</li>
      </ul>

      <h2>No timer program? Use your phone</h2>
      <p>
        Set your splits under <strong>Your splits</strong>, then <strong>Open the phone remote</strong>{" "}(or scan its
        code). The remote has big Split, Undo, Skip and Reset buttons and keeps the time itself. Keep your phone&apos;s
        screen on during a run. Changing the split names starts their times fresh.
      </p>

      <h2>Chat commands</h2>
      <ul>
        <li><code>!pb</code>: your PB and sum of best.</li>
        <li><code>!pace</code>: where the run stands against your PB and where it&apos;s heading.</li>
        <li><code>!splits</code>: each split so far, ahead or behind, with a star for a gold.</li>
      </ul>
      <p>
        They answer in your Twitch chat once Twitch is connected in Streaming ▸ Setup. Set <strong>Replies wait</strong> to
        your stream delay so chat never hears about a split before it sees it.
      </p>

      <h2>PB predictions (GS Pro)</h2>
      <p>
        Turn on <strong>Open a prediction every run</strong> and chat bets Arcade Tokens on whether the run is a PB
        (<code>!bet pb 100</code> or <code>!bet no 100</code>). It opens after your first split, locks after the split
        you pick under <strong>Bets lock after</strong>{" "}(a quarter of the way in unless you change it) and pays out when the
        run ends. A reset before the lock gives everyone their tokens back. Tokens can&apos;t be bought or cashed out. See{" "}
        <Link href="/help/streaming/token-economy">the token economy</Link>.
      </p>

      <h2>Your run on Twitch and your live page</h2>
      <p>
        While a run is going, and for two minutes after it ends, a run card shows the clock, the split you&apos;re on with
        how far ahead or behind, five splits around it, your PB and sum of best. It sits on top of the GameShuffle Twitch
        extension&apos;s card, so viewers see your splits even with no OBS overlay (a console streaming straight to Twitch),
        and on your live page, with the PB bet under it when one is open. It waits out <strong>Replies wait</strong>{" "}
        like chat does.
      </p>

      <h2>In Discord</h2>
      <p>
        Speedrunning lives on the <strong>GameShuffle Competitive</strong>{" "}bot. Turn things on per server in{" "}
        <Link href="/account/discord?app=comp">Account ▸ Discord ▸ GameShuffle Competitive</Link>, under
        <strong> Speedrunning</strong>. Posts go to the server&apos;s posting channel.
      </p>
      <ul>
        <li><strong>Post new PBs</strong>{" "}(free): the time, how much faster, gold splits and a Watch on Twitch button, for you and members who connected GameShuffle with Discord.</li>
        <li><strong>PB pace alerts</strong>{" "}(GS Pro): once per run, when a live runner is ahead of PB with a quarter of the run left, with an optional role ping. Discord only lets the bot ping roles that allow mentions.</li>
        <li><code>/pb</code>{" "}(free): anyone can look up PB, sum of best and attempts. It shows the server owner&apos;s run unless you pick a member.</li>
        <li><strong>Post races and duels</strong>{" "}(free): a race (or a Trainer Road duel) starting, with a Watch button, then its results once every stream has shown the finish.</li>
      </ul>
      <p>
        The GameShuffle bot&apos;s end-of-stream recap also adds <strong>Speedrun tonight</strong>: attempts, your best run,
        a new PB if there was one and gold splits.
      </p>

      <h2>Attempts</h2>
      <p>
        With the LiveSplit add-on, your attempt count comes from your splits file. Type a number under{" "}
        <strong>Attempts</strong>{" "}to use your own instead; it stays until you press <strong>Use LiveSplit&apos;s count</strong>.
        The count never goes down, because saved attempts are numbered by it. LiveSplit One doesn&apos;t send its
        attempt count, so with it, type yours once and GameShuffle counts up from there with every run you start.
      </p>

      <h2>Keep your address private</h2>
      <p>
        Your server address lets anyone send splits to your overlay, so keep it off stream. The OBS link can only show the
        run. If either one gets out, press <strong>Make a new address</strong> or <strong>Make a new OBS link</strong>: the
        old one stops working straight away.
      </p>

      <h2>If something&apos;s off</h2>
      <ul>
        <li><strong>The overlay asks you to connect your timer, or says Waiting for splits:</strong> it hasn&apos;t had a run from your timer yet. With LiveSplit, check the GameShuffle tab in Layout Settings says Connected. With LiveSplit One, press Connect in its Connect to Server settings. Or save your splits for the phone remote.</li>
        <li><strong>GameShuffle isn&apos;t under Other in LiveSplit:</strong> check LiveSplit.GameShuffle.dll is in the Components folder next to LiveSplit.exe, then restart LiveSplit.</li>
        <li><strong>The GameShuffle tab says the address was replaced:</strong> you made a new one. Copy it from the setup and paste it again.</li>
        <li><strong>LiveSplit One won&apos;t connect:</strong> close any settings or layout editor in LiveSplit One first, then press Connect again. Check you pasted the whole address.</li>
        <li><strong>Chat hears a split before the stream shows it:</strong> raise Replies wait to match your stream delay.</li>
        <li><strong>Nothing in OBS:</strong> check the source is 1920 × 1080 and the link is your current OBS link.</li>
      </ul>
    </HelpArticle>
  );
}
