import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { RANKED_GROUPS, RANKED_HELP, RANKED_HELP_PUBLIC } from "@/lib/help/ranked";

/** GS Ranked's help front page: the three groups (players, lounge staff, reference) and the Japanese player pages. */

const HREF = "/help/ranked";

export const metadata: Metadata = {
  title: "GS Ranked help",
  description: "Playing in a lounge on GameShuffle, running one, and the rules.",
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  robots: { index: RANKED_HELP_PUBLIC, follow: RANKED_HELP_PUBLIC },
};

export default function Page() {
  return (
    <HelpArticle href={HREF} fallbackLabel="GS Ranked">
      <h1>GS Ranked</h1>
      <p>Lounges on GameShuffle: tables, MMR and standings, run from your lounge&apos;s Discord and the web. <Link href="/help/ranked/ja">日本語のプレイヤー向けページ</Link></p>
      {RANKED_GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`ranked-${g.id}`}>
          <h2 id={`ranked-${g.id}`}>{g.label}</h2>
          <ul>
            {RANKED_HELP.filter((p) => p.group === g.id).map((p) => (
              <li key={p.slug}><Link href={p.href}>{p.title}</Link>: {p.description}</li>
            ))}
          </ul>
        </section>
      ))}
    </HelpArticle>
  );
}
