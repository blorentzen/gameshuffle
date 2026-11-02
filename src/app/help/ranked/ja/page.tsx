import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { RANKED_HELP_JA, RANKED_HELP_PUBLIC } from "@/lib/help/ranked";

/** GS Ranked's player pages in Japanese (name, web and docs pick 9A). */

const HREF = "/help/ranked/ja";

export const metadata: Metadata = {
  title: "GS Ranked ヘルプ（日本語）",
  description: "GameShuffleのラウンジでプレイするための案内。",
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  robots: { index: RANKED_HELP_PUBLIC, follow: RANKED_HELP_PUBLIC },
};

export default function Page() {
  return (
    <HelpArticle href={HREF} fallbackLabel="日本語" lang="ja">
      <h1>GS Ranked（プレイヤー向け）</h1>
      <p>GameShuffleで運営されるラウンジでのプレイ方法です。<Link href="/help/ranked">English</Link></p>
      <ul>
        {RANKED_HELP_JA.map((p) => (
          <li key={p.slug}><Link href={p.href}>{p.title}</Link>：{p.description}</li>
        ))}
      </ul>
    </HelpArticle>
  );
}
