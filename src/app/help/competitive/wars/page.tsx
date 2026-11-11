import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/competitive/wars";
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
      <h1>Wars and the War room</h1>
      <p>
        GameShuffle scores Mario Kart clan wars race by race in Discord: a card in your channel, the War
        room for scoring together in a call, a page to share afterwards and an overlay for your stream.
        It all runs on the GameShuffle Competitive app. Scoring, tables and cans are free. To add the
        app to your server, see{" "}
        <Link href="/help/competitive/competitive-discord-app">The GameShuffle Competitive Discord app</Link>.
      </p>

      <h2>Start a war</h2>
      <p>
        In the channel your team uses, run <code>/war</code>. The bot posts the war card there. It needs
        the Send Messages and Attach Files permissions in that channel.
      </p>
      <ul>
        <li><code>vs</code>{" "}(required): the other team&apos;s tag. It suggests this server&apos;s team cards, then teams it has played, then teams from MKCentral.</li>
        <li><code>us</code>: your team&apos;s tag. The channel remembers it after the first war.</li>
        <li><code>game</code>: Mario Kart 8 Deluxe or Mario Kart World.</li>
        <li><code>entry</code>: one person adds each race, or everyone taps the place they finished.</li>
        <li><code>format</code>: players a team, 6v6 to 2v2, or 12v12 in Mario Kart World. See Other team sizes below.</li>
        <li><code>others</code>: more teams in the same room, their tags with spaces between, like <code>others: PBM</code>.</li>
        <li><code>races</code>: how many races, 4 to 32. 12 when you leave it out.</li>
        <li><code>continue</code>: carry over a war that&apos;s running in another bot. See Carrying a war over below.</li>
      </ul>
      <p>
        The channel remembers the game, the entry, the team size and the race count too, so later wars
        only need <code>vs</code>. A channel holds one war at a time. Anyone in the channel can score,
        and private replies only go to whoever pressed.
      </p>

      <h2>How a war is scored</h2>
      <p>
        A 6v6 war is 12 races in a 12-player room, six players a side. Places score 15, 12, 10, 9, 8, 7,
        6, 5, 4, 3, 2 and 1, so each race is worth 82 points. Your team&apos;s race score is the total of
        its six places, and the other team gets the rest.
      </p>
      <p>
        The card shows each race and the lead. In a 6v6, one race can move the lead by 40 points at most,
        so once a lead is bigger than that times the races left, the card says the war can&apos;t be
        caught. The war ends on its own after its last race.
      </p>

      <h3>Other team sizes</h3>
      <ul>
        <li>
          <strong>Two teams of 2 to 5</strong>{" "}race in a room of just them: a 4v4 is an 8-player room.
          Mario Kart 8 Deluxe rooms use Toad Bot&apos;s points: 4 players 5, 3, 2, 1; 6 players 7, 5, 4,
          3, 2, 1; 8 players 10, 8, 6, 5, 4, 3, 2, 1; 10 players 12, 10, 8, 7, 6, 5, 4, 3, 2, 1. Mario
          Kart World&apos;s points for rooms under 12 aren&apos;t written down anywhere we could check, so
          those formats aren&apos;t on yet.
        </li>
        <li>
          <strong>Several teams in one 12-player room:</strong> three teams of 4, four teams of 3 or six
          teams of 2. Name the extra teams in <code>others</code>; the team size follows from how many
          teams there are. Points are the usual 15 to 1.
        </li>
        <li>
          <strong>Mario Kart World&apos;s 24-player rooms:</strong> 12v12, or several teams of 6, 4, 3 or
          2. Places score 15, 12, 10, 9, 9, 8, 8, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2 and 1.
        </li>
      </ul>
      <p>
        With several teams, the card shows the standings with each team&apos;s gap to the leader, the
        race&apos;s places in each team&apos;s color, and a marker per race in the color of the team that
        won it. &ldquo;Can&apos;t be caught&rdquo; and the overlay follow you against the leader, or
        against the team right behind you when you lead.
      </p>

      <h3>One person adds each race</h3>
      <p>
        After each race, press <strong>Add race</strong>, type your team&apos;s places and, if you like,
        the track&apos;s code (SSC, rMMM or bNYM in Mario Kart 8 Deluxe). You can add the track later. If
        someone else put the same race in first with other places, you can pick{" "}
        <strong>Use mine instead</strong>{" "}or keep theirs.
      </p>
      <p>Places read the way other war bots read them:</p>
      <ul>
        <li>Each digit is a place: <code>12378</code>{" "}is 1st, 2nd, 3rd, 7th and 8th.</li>
        <li><code>0</code>{" "}is 10th and <code>+</code>{" "}is 11th. <code>a</code>, <code>b</code>{" "}and <code>c</code>{" "}are 10th, 11th and 12th.</li>
        <li><code>10</code>{" "}and <code>11</code>{" "}read as one place. <code>12</code>{" "}at the start is 1st and 2nd; anywhere else it&apos;s 12th.</li>
        <li>A dash fills a range: <code>1-378</code>{" "}is 1st to 3rd, then 7th and 8th. A dash at the start begins at 1st, and one at the end runs to 12th.</li>
        <li>With spaces or commas, each piece is a place or a range: <code>1-3 7 8 12</code>.</li>
      </ul>
      <p>
        Fewer than six places are topped up with the last places, so <code>12378</code>{" "}counts 12th as
        your sixth. If more than one is filled in, the card says so. More than six keeps the best six.
        Other team sizes work the same way with their own number of places.
      </p>
      <p>
        With several teams, type one group of places per team, in the order the teams were named (yours,
        then <code>vs</code>, then <code>others</code>), with spaces between groups:{" "}
        <code>1269 347</code>{" "}is your team 1st, 2nd, 6th and 9th, the next team 3rd, 4th, 7th and
        12th, and the last team the places left. You can always leave out the last team. A slash between
        groups works too: <code>1 2 6 9 / 3 4 7 8</code>. In a 24-player room, put spaces or commas
        between places (the shorthand would read 13 as 1st and 3rd), and a slash between teams.
      </p>

      <h3>Typing races with /race</h3>
      <p>
        <code>/race</code>{" "}takes what you&apos;d type to another war bot, in the war&apos;s channel:
      </p>
      <ul>
        <li>Places, any of the ways above: <code>/race 1-378</code>, or with the track first: <code>/race SSC 12378</code>.</li>
        <li>A track on its own sets the next race&apos;s track: <code>/race rMMM</code>.</li>
        <li>Take the last race back: <code>back</code>, <code>undo</code>, <code>%back</code>, <code>!back</code>{" "}or <code>!u</code>.</li>
        <li>Fix a race: <code>race 3 1-378</code>, <code>race 3 SSC</code>, <code>%race 3 12378</code>{" "}or <code>!editrace 3 12378</code>.</li>
        <li>Penalties: <code>pen 15</code>{" "}is 15 off the other team and <code>pen -15</code>{" "}15 off yours (Quaxly&apos;s way); <code>%penalty 10</code>{" "}and <code>%repick</code>{" "}(15) are off yours (Sokuji&apos;s way); add a team&apos;s tag or name to say which, like <code>pen 15 FRVR</code>. <code>unpen 15</code>{" "}takes one back.</li>
        <li>Ice Mario&apos;s <code>!a 1 2 3 7 8 12</code>{" "}and Toad&apos;s <code>_race 1 2 3 4 5 6</code>{" "}add a race. <code>%tag FRVR</code>{" "}changes the other team&apos;s tag mid-war.</li>
      </ul>
      <p>
        Where the other bots disagree, your server picks which one it reads like: press{" "}
        <strong>More &rsaquo; Typed races</strong>{" "}on the card (people who manage the server). Sokuji
        and Quaxly is the default; Kiwi reads every <code>12</code>{" "}as 1st and 2nd.
      </p>

      <h3>Everyone taps their place</h3>
      <p>
        Each player taps the place they finished on the card. Tap it again to take it back, or tap
        another place to move. If two players tap the same place, the race waits until one of them picks
        again. The race goes in once every player on the team has tapped a different place. Taps work in
        two-team wars of up to 12 players; with several teams or in a 24-player room, races go in with
        Add race.{" "}
        <strong>Fill in the rest</strong>{" "}opens the places form with the taps already in, for anyone
        who didn&apos;t tap. <strong>Track</strong>{" "}sets the race&apos;s track.
      </p>

      <h3>Fixing a war</h3>
      <p>
        <strong>Undo race</strong>{" "}takes back the last race. Everything else is in the{" "}
        <strong>More</strong>{" "}menu on the card:
      </p>
      <ul>
        <li><strong>Fix a race:</strong> change any race&apos;s places or track.</li>
        <li><strong>Add a penalty:</strong> take 1 to 200 points off any team, with a reason shown on the card.</li>
        <li><strong>Make the table:</strong> see Tables below.</li>
        <li><strong>Overlay link:</strong> see The war overlay below.</li>
        <li><strong>Typed races:</strong> how <code>/race</code>{" "}reads lines in this server (see above).</li>
        <li>Switch between one person scoring and everyone tapping.</li>
        <li><strong>End the war:</strong> stop before all the races are in.</li>
      </ul>
      <p>
        After the last race, the card offers <strong>Make the table</strong>, <strong>Rematch</strong>,{" "}
        <strong>Overlay link</strong>{" "}and <strong>War page</strong>. The war page has the score, the
        lead race by race, every race and your table. Anyone with its link can open it, and search
        engines don&apos;t list it.
      </p>

      <h3>Carrying a war over from another bot</h3>
      <p>
        If a war is already running in Quaxly, Toad Bot, Kiwi or Sokuji, you can move it to GameShuffle
        partway through without typing every race again. Right-click the other bot&apos;s score message
        (long-press on a phone) and pick <strong>Apps &rsaquo; Continue in GameShuffle</strong>. On a
        computer you can also select the score&apos;s text, copy it and paste it into{" "}
        <code>/war vs: NOR continue: True</code>.
      </p>
      <p>
        Only you see the check first: the teams, the score, every race and its track, and the penalties.{" "}
        <strong>Fix a race</strong>{" "}opens it as text to change anything that was read wrong, like a
        track the other bot showed only as an emoji. <strong>Continue here</strong>{" "}posts
        GameShuffle&apos;s card with &ldquo;Continued from Quaxly after race 5&rdquo;; the other bot&apos;s
        war is left as it is.
      </p>
      <p>
        Quaxly, Kiwi and Sokuji&apos;s 6v6 scores hold every race&apos;s places, so the whole war comes
        over. Toad Bot and Sokuji&apos;s smaller formats hold each race&apos;s points but not everyone&apos;s
        places, so those races come over as points. No other bot says who finished where, so the War
        room&apos;s player scores count only races tapped in GameShuffle.
      </p>

      <h2>Tables</h2>
      <p>
        Run <code>/table</code>, or press <strong>Make the table</strong>{" "}on the card. The form
        starts from the channel&apos;s last war and has:
      </p>
      <ul>
        <li><strong>Final results screenshot</strong>{" "}(optional): every name and score is read from it, and you check them before the table is posted. Players are sorted into teams by the tag in their names, at the front or the back (<code>Ω umiko</code>, <code>FRVR♪ichor</code>, <code>Jalen [FRVR]</code>), and the tag comes off the name.</li>
        <li><strong>Background</strong>{" "}(optional): use it just this once, or save it for this channel&apos;s tables. Left empty, the channel&apos;s saved background is used.</li>
        <li><strong>Players and scores</strong>: Lorenzi&apos;s format, with a team&apos;s tag on its own line and then one player per line, like <code>Name [us] 94</code>. An Ice Mario table (starting with <code>!tablel</code>) or a Lounge <code>!submit</code>{" "}block can be pasted as it is.</li>
        <li><strong>Look</strong>: the channel&apos;s look, or another layout for this table. Save it with the background to make it the channel&apos;s.</li>
      </ul>
      <p>
        Names and flags come from your server&apos;s team cards and players&apos; own cards (below). When
        you fix names on a table, the bot asks whether to <strong>Remember</strong>{" "}them for that
        team, so the next table fills them in on its own.
      </p>
      <p>
        Each team&apos;s total is checked against the war. If something is off, you see it privately with{" "}
        <strong>Draw it anyway</strong>, <strong>Fix the text</strong>{" "}or <strong>Cancel</strong>, and{" "}
        <strong>Swap teams</strong>{" "}when the teams may be the wrong way round. A posted table has{" "}
        <strong>Edit</strong>{" "}(for whoever made it, or anyone who manages the server) and{" "}
        <strong>Copy the text</strong>. Edit can also redraw the table in another layout.
      </p>
      <p>
        When a team on the table has no logo yet, the check and the posted table offer{" "}
        <strong>Add logos</strong>: an image box for each team without one. Save them for every table,
        card and overlay in this server (under the team&apos;s tag and name), or put them on this table
        only. In the text, a logo link can also go at the end of a team&apos;s line
        (<code>KC - Kart Club https://…</code>) or in place of its tag, the way Ice Mario reads it. Links
        to pictures in Discord or on MKCentral work; a Discord picture is copied in, since Discord&apos;s
        links expire.
      </p>
      <p>
        <code>/table show</code>{" "}posts one of the channel&apos;s tables again at the bottom of the
        channel (start typing to find it); the old message stays where it is.
      </p>

      <h3>How tables look</h3>
      <p>
        Each channel has its own look, set on the server&apos;s Teams page (Account ▸ Discord ▸ Teams) under{" "}
        <strong>War tables</strong>, with a preview drawn from the channel&apos;s newest table.
      </p>
      <ul>
        <li><strong>Layouts:</strong>{" "}Stacked (one team above the other, big logos, totals on the right), Side by side (each team under a header in its color) and Classic.</li>
        <li><strong>Team colors:</strong>{" "}a team&apos;s card color, else one picked from its logo. A team whose picked color is too close to the other team&apos;s gets another, so the two never look alike; a color set on the card is always used.</li>
        <li><strong>Medals</strong>{" "}for 1st to 3rd, and each team&apos;s total with who won and by how much.</li>
        <li><strong>Background:</strong>{" "}the channel&apos;s saved one, else the two teams&apos; colors or Competitive&apos;s checker. The Teams page can stop using a saved background.</li>
      </ul>
      <p>
        With GS Pro or Supporter looks on the account that added GameShuffle Competitive to the server,
        tables can also use a brand theme or your own two colors for the frame, another font, a light
        version, and leave out the gameshuffle.co line. They can be tried in the preview either way.
      </p>

      <h3>Teams and players</h3>
      <p>
        Anything the bot works out on its own can be set by hand. A team card holds a team&apos;s name,
        every tag it plays under (the first one is shown), its color and its players:
      </p>
      <ul>
        <li><code>/team set</code>: make or change a card, with <code>also</code>{" "}for the other tags it plays under, like <code>TZ</code>{" "}for Twilight Zone (Ω).</li>
        <li><code>/team players</code>: the team&apos;s players, one per line: in-game name, the name for tables, a flag, like <code>Jalen = peep/Sxyd [us]</code>.</li>
        <li><code>/team link</code>: link the card to the team on MKCentral (start typing its name or tag, or paste its MKCentral link). It fills the card&apos;s blanks and brings the team&apos;s players with their countries, so names on tables fill in. <code>/team unlink</code>{" "}undoes it.</li>
        <li><code>/team logo</code>: where the logo comes from: <strong>Automatic</strong>{" "}(your upload, then the linked MKCentral team&apos;s, then MKCentral by tag), <strong>Upload</strong>{" "}(only yours) or <strong>From MKCentral</strong>.</li>
        <li><code>/team show</code>{" "}and <code>/team remove</code>.</li>
      </ul>
      <p>
        The first time a war&apos;s tag matches teams on MKCentral, <code>/war</code>{" "}asks which one it
        is, and remembers the answer (including <strong>None of these</strong>). On a linked team, an
        in-game name matches a player when it&apos;s the same, the start of their name (<code>yozo</code>{" "}
        for yozo75) or its last four letters or more (<code>ichor</code>{" "}for cloudedichor), and only
        when one player fits. Names it can&apos;t place come up as <strong>Who are these?</strong>{" "}when
        the table is checked: pick each from the team&apos;s list once, and it&apos;s remembered.
      </p>
      <p>
        Players can set their own card with <code>/me</code>: the name and flag tables show for them,
        the in-game names they race under and the teams they race for. It starts from their MKCentral
        profile and is used in every server. In your server, your server&apos;s player list wins, then a
        player&apos;s own card, then MKCentral.
        Anyone can fill in something blank; changing what someone else set takes them or someone who
        manages the server.
      </p>

      <h3>Logos and flags</h3>
      <p>
        Team logos show on war cards, tables and the overlay. Add one with <code>/logo add</code>, and
        use <code>/logo get</code>, <code>/logo list</code>{" "}or <code>/logo remove</code>{" "}to manage
        them. To add many at once, open <strong>Account &rsaquo; Discord &rsaquo; Servers</strong>,
        pick GameShuffle Competitive at the top and press <strong>Manage teams</strong>. The same
        page sets each team&apos;s name, tags, color and players.{" "}
        <code>/flag</code>{" "}works the same way for flags on tables. Country codes like{" "}
        <code>[us]</code>{" "}already have theirs.
      </p>

      <h2>Cans</h2>
      <p>
        <code>/cans</code>{" "}finds out who can race a war. Run <code>/cans post</code>{" "}with a time in
        your own time zone, like 7pm or 19:30. You can add the day (today if left out), the other
        team&apos;s tag, the players a side (6 if left out) and your team&apos;s role. The first time, it
        asks your time zone, and Discord shows the time to each reader in theirs.
      </p>
      <p>
        Players tap <strong>Can</strong>, <strong>Sub</strong>, <strong>Maybe</strong>{" "}or{" "}
        <strong>Can&apos;t</strong>, and the post keeps count with names. When it&apos;s full, whoever
        posted it is pinged. <strong>Lock lineup</strong>{" "}pings the players, and a reminder goes out
        15 minutes before the war. Only the person who posted it, or someone who manages the server, can
        lock the lineup or press <strong>Call it off</strong>.
      </p>
      <ul>
        <li><code>/cans setup</code>: people who manage the server set a team&apos;s role (and its tag), which is pinged when a check goes up.</li>
        <li><code>/cans timezone</code>: change the time zone your times are typed in.</li>
        <li><code>/cans hours</code>: opens the War room&apos;s Cans tab to mark the hours you can usually race.</li>
      </ul>

      <h2>The War room</h2>
      <p>
        The War room is GameShuffle Competitive&apos;s Discord Activity: your team scores its war
        together from a call. Open it with the <strong>War room</strong>{" "}button on the war card, from
        Discord&apos;s App Launcher, or with <strong>Open the War room</strong>{" "}on a can check.
      </p>
      <p>
        It shows the war in the channel it was opened from. Opened from a call, it shows the war that
        call picked before, else the server&apos;s only live war, else a list of live wars to pick from.
        With no war going, press <strong>Start a war</strong>{" "}and search for the other team or type
        their tag.
      </p>
      <p>The War room has three tabs:</p>
      <ul>
        <li><strong>War room:</strong> the score, then three views. <strong>Race</strong>{" "}is where everyone taps their place, with the track, who you&apos;re waiting on, Fill in the rest, Undo, Penalty and End the war. <strong>Races</strong>{" "}lists every race with Fix and penalties. <strong>Players</strong>{" "}shows each player&apos;s places and points from their taps. After the war it shows the final with Rematch, War page and Make the table.</li>
        <li><strong>Time trials:</strong> the server&apos;s records with your gaps, and Add a time from a screenshot. See <Link href="/help/competitive/time-trials">Time trials</Link>.</li>
        <li><strong>Cans:</strong> the team&apos;s week (how many players can usually race each hour, in your time zone, with the best time and a button to post a can check for it) and your own usual hours, saved as you tap them.</li>
      </ul>
      <p>
        The War room and the card use the same war, so a race added in one shows in the other.
      </p>

      <h2>The war overlay</h2>
      <p>
        Press <strong>Overlay link</strong>{" "}on the war card. You get the channel&apos;s OBS link and{" "}
        <strong>Set up the overlay</strong>. The link follows every war in that channel, so you set it
        up once. No account is needed.
      </p>
      <p>On the setup page, pick:</p>
      <ul>
        <li><strong>Layout:</strong> Scorebug (bottom center, 1000 by 230), Top strip (full width, 1920 by 110), Corner card (520 by 300) or Race list (a side column, 440 by 800).</li>
        <li><strong>Look:</strong> Dark, Light or See-through.</li>
        <li><strong>Colors</strong>{" "}and <strong>Font for the numbers</strong>.</li>
        <li><strong>On the left:</strong> your team, or the other team for their stream.</li>
        <li><strong>What&apos;s on it:</strong> logos, race markers, the race and track, the comeback line and this race&apos;s places.</li>
        <li><strong>Moments:</strong> a race lands, can&apos;t be caught, and the final.</li>
        <li><strong>GameShuffle line:</strong> Built by GameShuffle or the mark only.</li>
      </ul>
      <p>
        Then press <strong>Copy link</strong>{" "}and add it to OBS or Streamlabs as a Browser source at
        the width and height shown. The link holds the choices you made. Sign in and press{" "}
        <strong>Save to my account</strong>, and later changes show up in OBS without a new link.
      </p>
      <p>
        Ice and Team colors, Rubik Italic and GameShuffle&apos;s font are free. Brand themes, two colors
        of your own, the other fonts and turning the GameShuffle line off are paid looks: they come with
        GS Pro, or with Supporter looks from the Supporter level of{" "}
        <Link href="/support">monthly support</Link>. You can try them on the setup page, and the link
        shows the free version until your account has looks.
      </p>
      <p>
        With GS Pro, press <strong>Add to my GameShuffle overlay</strong>{" "}to show the war score on
        your <Link href="/help/streaming/obs-overlay">GameShuffle overlay</Link>{" "}instead of adding
        another source. Move it in <strong>Account &rsaquo; Streaming &rsaquo; Overlay &rsaquo; Layout</strong>.
      </p>

      <h2>Still need help?</h2>
      <p>
        Use the <Link href="/contact-us">contact form</Link>.
      </p>
    </HelpArticle>
  );
}
