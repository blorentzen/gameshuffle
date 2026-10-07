import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { TierListTool } from "@/components/tools/TierListTool";
import { TierTemplatePicker } from "@/components/tools/TierTemplatePicker";
import { TIER_TEMPLATES, getTierTemplate } from "@/data/tier-templates";
import { IconListNumbers } from "@tabler/icons-react";

export function generateStaticParams() {
  return TIER_TEMPLATES.map((t) => ({ template: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ template: string }>;
}): Promise<Metadata> {
  const { template } = await params;
  const t = getTierTemplate(template);
  if (!t) return { title: "Tier List Maker" };
  return {
    title: `${t.title} Tier List Maker`,
    description: `${t.description} Free drag-and-drop tier list. No account required.`,
    alternates: { canonical: `https://www.gameshuffle.co/tier-list-maker/${t.slug}` },
    openGraph: { title: `${t.title} Tier List`, url: `https://www.gameshuffle.co/tier-list-maker/${t.slug}` },
  };
}

export default async function TierTemplatePage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  const t = getTierTemplate(template);
  if (!t) notFound();

  return (
    <main>
      <FreeToolShell icon={IconListNumbers} eyebrow="Tier list" name={`${t.title} Tier List`} lede={<>{t.description} Drag them into S-D tiers, or edit the tiers to taste.</>} crumbs={[{ label: "Tier List Maker", href: "/tier-list-maker" }, { label: t.title }]}>
        <TierListTool
          storageKey={`gs-tierlist-${t.slug}`}
          seedItems={t.items}
          defaultTitle={`${t.title} Tier List`}
        />
        <TierTemplatePicker currentSlug={t.slug} />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
