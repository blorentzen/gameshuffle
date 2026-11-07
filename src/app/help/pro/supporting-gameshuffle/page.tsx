import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/pro/supporting-gameshuffle";
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
      <h1>Supporting GameShuffle</h1>
      <p>
        GameShuffle is independent and has no ads. Support from players keeps it running. On the{" "}
        <Link href="/support">support page</Link>{" "}you can chip in once, or support every month at one of three levels.
      </p>

      <h2>Once or monthly</h2>
      <ul>
        <li><strong>Once:</strong> $3, $5, $10 or $25, or type any amount from $3. You don&apos;t need an account. For more than $1,000, email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</li>
        <li><strong>Monthly:</strong> pick a level. Monthly support needs a GameShuffle account, so you&apos;ll be asked to sign in first.</li>
      </ul>
      <p>
        You can add a name and a short note for the supporters wall when you give, and choose whether to show them.
      </p>

      <h2>Monthly levels</h2>
      <ul>
        <li><strong>Supporter, $3 a month:</strong> Supporter looks, plus the thank-yous every supporter gets (below).</li>
        <li><strong>Backer, $9 a month:</strong> everything in Supporter, plus <Link href="/help/pro/overview">GS Pro</Link>{" "}included (the Twitch and Discord tools, themes and the AI features) and the Backer badge.</li>
        <li><strong>Champion, $25 a month:</strong> everything in Backer, and your name listed first on the supporters wall and in the credits.</li>
      </ul>
      <p>
        Supporter looks are the choices that change how things look on GameShuffle: MMR card looks, profile and community skins, brand
        themes, custom CSS, and dice and coin looks. What things do, like the streamer and Discord tools and the AI features, stays with GS
        Pro. When a level ends, your saved looks are kept and your pages show the free versions until you have looks again.
      </p>
      <p>
        Because they include looks or GS Pro, the monthly levels are purchases, and any sales tax, VAT or GST that applies is added at
        checkout. If you already pay for GS Pro (a plan, a trial or GS Circuit 256), Backer and Champion stay closed until you cancel it in{" "}
        <strong>Account &rsaquo; Plans &amp; billing</strong>, so you&apos;re never charged twice. Supporter works alongside GS Pro.
      </p>

      <h2>A thank-you</h2>
      <p>
        One-time support is a thank-you: it keeps GameShuffle running and doesn&apos;t buy anything. GameShuffle isn&apos;t a charity, so
        support isn&apos;t tax-deductible. Support never comes with tokens or items.
      </p>

      <h2>Where support is open</h2>
      <p>
        Support is open with a billing address in any country where Stripe accepts the payment. It&apos;s charged in US dollars, so your
        bank may charge a fee to convert it. The GS Pro plan on its own is still for US billing addresses only.
      </p>

      <h2>How supporters are thanked</h2>
      <ul>
        <li><strong>Your badge:</strong> your profile shows a badge such as &ldquo;Supporter since Oct 2026&rdquo; (or Backer or Champion), with a ring and a heart on your profile picture. One-time support keeps the badge for a year, and monthly support keeps it while you give. Tap your own badge to share your supporter card.</li>
        <li><strong>Founding supporter:</strong> the first 100 supporters, at any level or amount, keep a Founding supporter badge for good.</li>
        <li><strong>The supporters wall:</strong> your name and note on the support page, if you choose to show them.</li>
        <li><strong>The credits:</strong> the <Link href="/credits">credits page</Link>{" "}lists everyone who chose to show their name, grouped by level.</li>
        <li><strong>The daily leaderboards:</strong> a heart beside your name.</li>
      </ul>

      <h2>Changing or stopping monthly support</h2>
      <p>Go to <strong>Account &rsaquo; Support GameShuffle</strong>. There you can:</p>
      <ul>
        <li>Pick a new level. The new level starts right away and the old one ends, with the unused time credited.</li>
        <li>Stop your support or change your card with <strong>Stop or update your card</strong>.</li>
        <li>Edit your name and note on the supporters wall. Changes save on their own.</li>
        <li>See every gift you&apos;ve given and share your supporter card.</li>
      </ul>
      <p>
        Support you give while signed out joins your account when you sign in with the same email address.
      </p>

      <h2>Refunds</h2>
      <p>
        If you gave the wrong amount, email <a href="mailto:billing@gameshuffle.co">billing@gameshuffle.co</a>{" "}within 30 days and
        we&apos;ll refund it. The full rules
        are in <Link href="/terms#use-of-service">section 3.6 of our Terms</Link>.
      </p>
    </HelpArticle>
  );
}
