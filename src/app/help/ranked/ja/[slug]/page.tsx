import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/HelpArticle";
import { RANKED_HELP_JA, RANKED_HELP_PUBLIC, rankedPageJa } from "@/lib/help/ranked";
import { RANKED_HELP_BODIES_JA } from "@/data/ranked-help-ja";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return RANKED_HELP_JA.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const meta = rankedPageJa((await params).slug);
  if (!meta) return {};
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `https://www.gameshuffle.co${meta.href}`, languages: { en: `https://www.gameshuffle.co/help/ranked/${meta.slug}` } },
    robots: { index: RANKED_HELP_PUBLIC, follow: RANKED_HELP_PUBLIC },
  };
}

export default async function Page({ params }: Props) {
  const meta = rankedPageJa((await params).slug);
  const body = meta ? RANKED_HELP_BODIES_JA[meta.slug] : null;
  if (!meta || !body) notFound();
  return (
    <HelpArticle href={meta.href} lang="ja">
      <h1>{meta.title}</h1>
      {body}
    </HelpArticle>
  );
}
