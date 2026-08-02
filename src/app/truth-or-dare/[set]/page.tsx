import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { TruthOrDareTool } from "@/components/tools/TruthOrDareTool";
import { TruthOrDarePicker } from "@/components/tools/TruthOrDarePicker";
import { TRUTH_OR_DARE_SETS, getTruthOrDareSet } from "@/data/truth-or-dare";

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
    title: `${s.title} Truth or Dare — free prompt generator`,
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
      <Container className="tool-page">
        <h1 className="tool-page__title">{s.title} Truth or Dare</h1>
        <p className="tool-page__lead">{s.description}</p>
        <TruthOrDareTool truths={s.truths} dares={s.dares} />
        <TruthOrDarePicker currentSlug={s.slug} />
        <p className="tool-page__lead">
          More free tools on the <Link href="/tools">tools hub</Link>.
        </p>
      </Container>
    </main>
  );
}
