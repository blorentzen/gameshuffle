import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SeriesPage, seriesMetadata } from "@/components/series/SeriesPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return seriesMetadata(slug);
}

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab } = await searchParams;
  // The Summer Series has its own short address.
  if (slug === "summer-series") redirect(`/summer-series${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`);
  return <SeriesPage slug={slug} tab={tab ?? "standings"} />;
}
