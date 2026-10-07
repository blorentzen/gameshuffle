import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/ai-tools";
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
      <h1>AI tools</h1>
      <p>
        A few places on GameShuffle can write a first draft for you: a wheel, a set of bingo prompts, a recap of last
        night, a plan for tonight. They use Claude, an AI model made by Anthropic. Look for the sparkle icon.
      </p>

      <h2>How they work</h2>
      <ul>
        <li><strong>You approve everything.</strong> Nothing an AI tool writes is saved, posted or shown to anyone until you choose to use it, and you can edit it first.</li>
        <li><strong>The randomizers still roll.</strong> AI can set a randomizer&apos;s options, but it never picks a random result. Rolls stay random and fair.</li>
        <li><strong>Stream-safe by default.</strong> Everything passes the same word filter as the rest of the site. Still, read it over before it goes on stream.</li>
      </ul>

      <h2>Make it for your stream (GS Pro)</h2>
      <p>Type a theme, like &quot;Elden Ring boss night, punishments for dying&quot;, and get a list to untick and keep:</p>
      <ul>
        <li><strong>Wheels:</strong> <strong>Make one with AI</strong> on the <a href="/help/streaming/wheels">Wheels</a> tab opens the slices in the wheel editor.</li>
        <li><strong>Bingo prompts:</strong> <strong>Make prompts with AI</strong> in Stream Tools adds squares to your Community Bingo board.</li>
        <li><strong>Tier lists:</strong> <strong>Fill with AI</strong> on the <Link href="/tier-list-maker">tier list maker</Link> adds items to rank.</li>
        <li><strong>Party games:</strong> <strong>Make a pack with AI</strong> on Most Likely To and Odd One Out gives you a one-off pack to play straight away.</li>
      </ul>
      <p><strong>Give me different ones</strong> drafts a fresh batch without repeating what you already have.</p>

      <h2>Recaps (GS Pro)</h2>
      <p>
        When a <a href="/help/apps/live-game-nights">live game night</a> ends, or a stream session finishes in the Hub,
        <strong> Write it up with AI</strong> drafts a Discord post and a short post for X or Bluesky. It only uses what
        GameShuffle recorded (results, scores, who played), never anything made up. Edit either one, then copy it; the
        link is added for you.
      </p>

      <h2>Describe your night (free)</h2>
      <p>
        On the <a href="/help/apps/goldeneye-randomizer">GoldenEye</a> and <a href="/help/apps/pokemon-randomizers">Pokémon
        Stadium</a> randomizers, type what you want in plain words and press <strong>Set it up</strong>. &quot;Three of us, no
        Oddjob&quot; sets the players and options; &quot;give me a rain team&quot; puts fitting Pokémon on your team as your
        own choices. Then roll as usual.
      </p>

      <h2>Night Planner (free)</h2>
      <p>
        The <Link href="/game-nights/tools/night-planner">Night Planner</Link>{" "}suggests a lineup from how many are playing, how
        long you have and the console games you own, plus a Jackbox game that fits. Drag games into a different order, drop
        any you don&apos;t want, then start it as a live night on everyone&apos;s phones.
      </p>

      <h2>Tournament helper (free)</h2>
      <p>
        <strong>Draft it with AI</strong> on the <a href="/help/tournaments/creating-a-tournament">create tournament</a> page
        suggests a format for your player count and time, and drafts the description, rules and an announcement. Each part has
        its own <strong>Use</strong> button; fill in the [placeholders] like the date and prize before you create it.
      </p>

      <h2>How many you can make</h2>
      <ul>
        <li><strong>Free account:</strong> three a day across Describe your night, the Night Planner and the tournament helper. They reset at midnight Pacific time.</li>
        <li><strong>GS Pro:</strong> 60 every 30 days across all the AI tools, including content packs and recaps. Each one comes back 30 days after you use it.</li>
      </ul>
      <p>You need a free account to use any of them; if you&apos;re signed out, the AI buttons ask you to make one first. Each AI tool shows how many you have left.</p>

      <h2>Your data</h2>
      <p>
        We send Anthropic only what the draft needs: what you typed and, for recaps, the results we already hold. We
        don&apos;t send your email, account details or payment information, and we don&apos;t keep what you typed or what came
        back unless you save it. Anthropic doesn&apos;t use it to train its models. Details are in section 2.6 of the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
