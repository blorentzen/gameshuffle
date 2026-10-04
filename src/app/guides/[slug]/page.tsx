import type { Metadata } from "next";
import { GUIDES_PUBLIC } from "@/lib/games-visibility";
import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/guides/GuideArticle";
import { GuideBody } from "@/components/guides/GuideBody";
import { dbGuideBySlug, publishedGuidesAsync } from "@/lib/guides/store";

/**
 * Database-backed guides.
 *
 * The two original guides are their own route files under
 * src/app/guides/<slug>/, and a static segment beats a dynamic one in Next's
 * router, so they keep winning and this never sees them. `dbGuideBySlug`
 * returns null for anything file-backed as a second guard, so the two can never
 * both render.
 */

export const revalidate = 300;

export async function generateStaticParams() {
  // Pre-render what exists at build time; anything published later is still
  // served, just on first request.
  const guides = await publishedGuidesAsync().catch(() => []);
  return guides.filter((g) => g.fromDb).map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = await dbGuideBySlug(slug);
  if (!guide) return { title: "Guide not found" };
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `https://www.gameshuffle.co/guides/${slug}` },
    openGraph: {
      title: `${guide.title} | GameShuffle`,
      description: guide.description,
      url: `https://www.gameshuffle.co/guides/${slug}`,
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  if (!GUIDES_PUBLIC && process.env.NODE_ENV === "production") notFound();
  const { slug } = await params;
  const guide = await dbGuideBySlug(slug);
  if (!guide) notFound();

  return (
    <GuideArticle slug={slug} guide={guide}>
      <GuideBody markdown={guide.bodyMd ?? ""} />
    </GuideArticle>
  );
}
