import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { TruthOrDareTool } from "@/components/tools/TruthOrDareTool";
import { TruthOrDarePicker } from "@/components/tools/TruthOrDarePicker";
import { TRUTH_OR_DARE_SETS, getTruthOrDareSet } from "@/data/truth-or-dare";
import { IconMessageQuestion } from "@tabler/icons-react";

export function generateStaticParams() {
  return TRUTH_OR_DARE_SETS.map((s) => ({ set: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ set: string }>;
}): Promise<Metadata> {
  const { set } = await params;
  const s = getTruthOrDareSet(set);
  if (!s) return { title: "Truth or Dare" };
  return {
    title: `${s.title} Truth or Dare: free prompt generator`,
    description: `${s.description} Free online truth-or-dare, no account required.`,
    alternates: { canonical: `https://www.gameshuffle.co/truth-or-dare/${s.slug}` },
    openGraph: { title: `${s.title} Truth or Dare`, url: `https://www.gameshuffle.co/truth-or-dare/${s.slug}` },
  };
}

export default async function TruthOrDareSetPage({
  params,
}: {
  params: Promise<{ set: string }>;
}) {
  const { set } = await params;
  const s = getTruthOrDareSet(set);
  if (!s) notFound();

  return (
    <main>
      <FreeToolShell icon={IconMessageQuestion} eyebrow="Truth or dare" name={`${s.title} Truth or Dare`} lede={<>{s.description}</>} crumbs={[{ label: "Truth or Dare", href: "/truth-or-dare" }, { label: s.title }]}>
        <TruthOrDareTool truths={s.truths} dares={s.dares} />
        <TruthOrDarePicker currentSlug={s.slug} />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
