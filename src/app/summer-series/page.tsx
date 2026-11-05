import type { Metadata } from "next";
import { SeriesPage, seriesMetadata } from "@/components/series/SeriesPage";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return seriesMetadata("summer-series");
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <SeriesPage slug="summer-series" tab={tab ?? "standings"} />;
}
