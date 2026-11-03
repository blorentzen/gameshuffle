import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/HelpArticle";
import { RANKED_HELP, RANKED_HELP_PUBLIC, rankedPage } from "@/lib/help/ranked";
import { RANKED_HELP_BODIES } from "@/data/ranked-help";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return RANKED_HELP.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const meta = rankedPage((await params).slug);
  if (!meta) return {};
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `https://www.gameshuffle.co${meta.href}` },
    openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${meta.href}` },
    robots: { index: RANKED_HELP_PUBLIC, follow: RANKED_HELP_PUBLIC },
  };
}

export default async function Page({ params }: Props) {
  const meta = rankedPage((await params).slug);
  const body = meta ? RANKED_HELP_BODIES[meta.slug] : null;
  if (!meta || !body) notFound();
  return (
    <HelpArticle href={meta.href}>
      <h1>{meta.title}</h1>
      {body}
    </HelpArticle>
  );
}
