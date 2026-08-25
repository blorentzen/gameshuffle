import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { BingoCardTool } from "@/components/tools/BingoCardTool";
import { BingoTemplatePicker } from "@/components/tools/BingoTemplatePicker";
import { BINGO_TEMPLATES, getBingoTemplate } from "@/data/bingo-templates";

export function generateStaticParams() {
  return BINGO_TEMPLATES.map((t) => ({ template: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ template: string }>;
}): Promise<Metadata> {
  const { template } = await params;
  const t = getBingoTemplate(template);
  if (!t) return { title: "Bingo Card Generator" };
  return {
    title: `${t.title} Bingo Card Generator`,
    description: `${t.description} Free 5×5 bingo card generator. Print it or play along, no account required.`,
    alternates: { canonical: `https://www.gameshuffle.co/bingo-card-generator/${t.slug}` },
    openGraph: {
      title: `${t.title} Bingo`,
      url: `https://www.gameshuffle.co/bingo-card-generator/${t.slug}`,
    },
  };
}

export default async function BingoTemplatePage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  const t = getBingoTemplate(template);
  if (!t) notFound();

  return (
    <main>
      <Container className="tool-page">
        <h1 className="tool-page__title">{t.title} Bingo</h1>
        <p className="tool-page__lead">{t.description} Generate a card, print it, or mark squares as you play.</p>
        <BingoCardTool
          storageKey={`gs-bingo-${t.slug}`}
          seedSquares={t.squares}
          seedFreeSpace={t.freeSpace}
          defaultTitle={`${t.title} Bingo`}
        />
        <BingoTemplatePicker currentSlug={t.slug} />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
      <ProToolCta />
    </main>
  );
}
