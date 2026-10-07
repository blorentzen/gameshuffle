import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { BingoCardTool } from "@/components/tools/BingoCardTool";
import { BingoTemplatePicker } from "@/components/tools/BingoTemplatePicker";
import { BINGO_TEMPLATES, getBingoTemplate } from "@/data/bingo-templates";
import { IconLayoutGrid } from "@tabler/icons-react";

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
      <FreeToolShell icon={IconLayoutGrid} eyebrow="Bingo card" name={`${t.title} Bingo`} lede={<>{t.description} Generate a card, print it, or mark squares as you play.</>} crumbs={[{ label: "Bingo Card Generator", href: "/bingo-card-generator" }, { label: t.title }]}>
        <BingoCardTool
          storageKey={`gs-bingo-${t.slug}`}
          seedSquares={t.squares}
          seedFreeSpace={t.freeSpace}
          defaultTitle={`${t.title} Bingo`}
        />
        <BingoTemplatePicker currentSlug={t.slug} />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
