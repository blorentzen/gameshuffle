/**
 * /speedrun for visitors (launch picks 2026-11-10, all as recommended; Britton: speedrunning applies to any game, so
 * nothing here leads with Mario Kart). Title and H1 ride the searches people make ("speedrun timer", "timer for
 * OBS"). Order: hero, the overlay playing a run, what you get, any game, three steps, what's free (Free, GS Pro and
 * the Supporter level, whose looks open the overlay's styling), about, questions, one closing line.
 */

import Link from "next/link";
import { Button } from "@empac/cascadeds";
import {
  IconBolt, IconDeviceMobile, IconLayoutSidebarRight, IconMessageCircle, IconStarFilled, IconChartBar,
} from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { RowPanel } from "@/components/marketing/RowPanel";
import { PlansPanel } from "@/components/marketing/PlansPanel";
import { FaqList } from "@/components/marketing/FaqList";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { SpeedrunDemo } from "./SpeedrunDemo";

const SIGN_UP = "/signup?redirect=/speedrun";

export const SPEEDRUN_DESCRIPTION = "A free speedrun timer overlay for OBS, for any game. Your LiveSplit splits, PB and sum of best on stream the instant you split, plus chat commands and a phone remote.";

const STEPS = [
  { name: "Connect your timer", text: "In LiveSplit on Windows, add the free GameShuffle add-on and paste your private address into its settings once. In LiveSplit One, paste the same address under Connect to Server." },
  { name: "Add the overlay to OBS", text: "Add a Browser source, paste your overlay link and set it to 1920 × 1080." },
  { name: "Start your run", text: "The overlay wakes up with your first split." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "What speedrun timer should I use?", a: "The one you already use. LiveSplit on Windows connects through our free add-on, and LiveSplit One connects from any browser at one.livesplit.org. To skip a timer program, use the phone remote." },
  { q: "Does it work for my game?", a: "Yes. The overlay shows your own splits, whatever you run: pick your game from the list or type its name, and type your category. Any%, 100%, glitchless or a run with one split all work the same way." },
  { q: "Does it work with desktop LiveSplit?", a: "Yes. GameShuffle for LiveSplit is a free, open source add-on: unzip it into LiveSplit's Components folder, add it to your layout and paste your address once. It also sends your game, category and attempt count from your splits file." },
  { q: "Do I need to download anything?", a: "Only the add-on, if you use LiveSplit on Windows. LiveSplit One runs in the browser, and the overlay is a link you paste into OBS." },
  { q: "Do I have to press Connect every time?", a: "Not with LiveSplit: the add-on connects by itself whenever LiveSplit opens. LiveSplit One remembers your address, but you press Connect each time you open it." },
  { q: "Can viewers see my timer address?", a: "No. Your timer gets a private address, and OBS gets a separate link that can only show the run. You can make a new address any time." },
  { q: "Do I need Twitch?", a: "Only for chat commands and predictions. The overlay works in any streaming app that takes a browser source." },
  { q: "Can viewers see my splits without an overlay?", a: "Yes. The GameShuffle Twitch extension shows a run card with your clock, splits, PB and sum of best whenever a run is going, so it works even from a console streaming straight to Twitch. Your live page shows the same card." },
  { q: "Does it post to Discord?", a: "With the GameShuffle Competitive bot in your server: new PBs (free), PB pace alerts that can ping a role (GS Pro), and /pb for anyone to look up a runner." },
  { q: "Are the predictions gambling?", a: "No money changes hands. Viewers bet Arcade Tokens they earn on GameShuffle, and tokens can't be bought or cashed out. A reset before bets lock gives everyone their tokens back." },
];

export function SpeedrunPitch() {
  return (
    <main className="sr-page srl">
      <MarketingJsonLd
        appName="GameShuffle speedrun overlay"
        appDescription={SPEEDRUN_DESCRIPTION}
        appUrl="/speedrun"
        appCategory="UtilitiesApplication"
        breadcrumb={{ label: "Speedrun overlay", path: "/speedrun" }}
        faq={FAQ.map((f) => ({ q: f.q, a: f.a }))}
        howTo={{ name: "How to add a speedrun timer to OBS", steps: STEPS.map((s) => ({ name: s.name, text: s.text })) }}
      />
      <BrowseHero
        eyebrow="Speedrunning"
        title="Speedrun timer overlay for OBS"
        sub="Your splits, PB and sum of best on stream the instant you split, from LiveSplit One or your phone. Any game. Free with a GameShuffle account."
        subShort="Your splits on stream as you split. Any game, free."
        accent="blue"
        field="compete"
        compact
        primary={{ href: SIGN_UP, label: "Set up my overlay" }}
        secondary={{ href: "#watch", label: "Watch a run" }}
      />

      <div className="srl__body">
        <section className="srl__sec" id="watch" aria-labelledby="srl-watch">
          <h2 id="srl-watch" className="srl__h">Watch a run</h2>
          <SpeedrunDemo />
        </section>

        <section className="srl__sec" aria-labelledby="srl-get">
          <h2 id="srl-get" className="srl__h">What you get</h2>
          <RowPanel rows={[
            { key: "layouts", Icon: IconLayoutSidebarRight, tone: "blue", title: "Column or Strip", text: "Every split down the side, or one line along the bottom or top so the game fills the screen. See-through at any size, so there's no color key to set up." },
            { key: "numbers", Icon: IconChartBar, tone: "teal", title: "Your run's numbers", text: "Ahead or behind at every split, the current segment, PB, sum of best, previous segment, attempt count and pace. Switch each one on or off." },
            { key: "moments", Icon: IconStarFilled, tone: "orange", title: "Gold splits and PBs", text: "Beat your best segment and the row flashes gold. Finish a PB and the timer turns gold under a banner. A reset shows where the run ended." },
          ]} />
          <RowPanel className="srl__more" rows={[
            { key: "remote", Icon: IconDeviceMobile, tone: "green", title: "A timer on your phone", text: "Big Split, Undo, Skip and Reset buttons, and the phone keeps the time. For runners on a console, a Mac or a phone with no timer program." },
            { key: "chat", Icon: IconMessageCircle, tone: "violet", title: "!pb, !pace and !splits", text: "Chat asks and the bot answers with your own numbers, after a delay that matches your stream so nobody sees a split early." },
            { key: "pred", Icon: IconBolt, tone: "magenta", eyebrow: "GS Pro", title: "A PB prediction every run", text: "Chat bets Arcade Tokens on a PB. It opens after your first split, locks after the split you pick and pays out when the run ends. No Twitch Affiliate needed." },
          ]} />
        </section>

        <section className="srl__sec srl__flat" aria-labelledby="srl-any">
          <h2 id="srl-any" className="srl__h">Any game, any category</h2>
          <p className="srl__p">The overlay shows whatever you run. Your splits come from LiveSplit, LiveSplit One or the names you type once for the phone remote, and LiveSplit sends your game and category too. Any%, 100%, glitchless, a single-level run with one split: they all draw the same way.</p>
          <p className="srl__p">Ready-made split lists for Super Mario 64, Minecraft, Celeste, Super Mario Bros., Odyssey, Breath of the Wild, Portal, Cuphead, Hollow Knight and Super Mario World come with a LiveSplit download. <ArrowLink href="/speedrun/splits">Speedrun splits by game</ArrowLink></p>
        </section>

        <section className="srl__sec srl__flat" aria-labelledby="srl-how">
          <h2 id="srl-how" className="srl__h">How to add a speedrun timer to OBS</h2>
          <ol className="sr-steps srl__steps">
            {STEPS.map((s, i) => (
              <li key={s.name}><span className="sr-steps__n" aria-hidden="true">{i + 1}</span><div><b>{s.name}</b><span className="srl__step-text">{s.text}</span></div></li>
            ))}
          </ol>
          <div className="srl__actions">
            <Link href={SIGN_UP} style={{ textDecoration: "none" }}><Button variant="primary">Set up my overlay</Button></Link>
            <span className="srl__aside">Already have an account? <Link href="/login?redirect=/speedrun">Sign in</Link></span>
          </div>
        </section>

        <PlansPanel
          id="plans"
          title="What's free"
          rows={["account", "pro", "supporter"]}
          from="speedrun"
          copy={{
            account: { name: "The whole overlay", body: "Both layouts with every number and moment, the LiveSplit add-on and the LiveSplit One connection, the phone remote and chat commands." },
            pro: { name: "Chat bets on the PB", body: "A PB prediction every run and every look, plus the rest of the stream kit: polls, Stream Bingo and break games for when you step away." },
            supporter: { name: "Your own look", body: "Brand themes, two colors of your own, more fonts, a two-color border and a line of your own in place of ours." },
          }}
          cta={{ account: { label: "Set up my overlay", href: SIGN_UP } }}
        />

        <section className="srl__sec srl__flat" aria-labelledby="srl-about">
          <h2 id="srl-about" className="srl__h">About the speedrun overlay</h2>
          <p className="srl__p">GameShuffle&apos;s speedrun overlay is a timer overlay for OBS and any streaming app with a browser source. It reads your run from LiveSplit on Windows through our free add-on, from LiveSplit One through its server connection, or from GameShuffle&apos;s phone remote, and draws it on stream as a split list or a strip with a stopwatch that ticks between splits.</p>
          <p className="srl__p">Everything on it comes from your own timer: your splits, your PB and your attempt count.</p>
        </section>

        <section className="srl__sec srl__flat" aria-labelledby="srl-faq">
          <h2 id="srl-faq" className="srl__h">Questions</h2>
          <FaqList items={FAQ} />
        </section>

        <section className="srl__end" aria-label="Set it up">
          <p className="srl__end-line">Set it up before your next run.</p>
          <Link href={SIGN_UP} style={{ textDecoration: "none" }}><Button variant="primary">Set up my overlay</Button></Link>
        </section>
      </div>
    </main>
  );
}
