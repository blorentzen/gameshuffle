import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { loadSeries } from "@/lib/series/store";
import { seriesViewer } from "@/lib/series/viewer";
import { SeriesManage } from "@/components/series/SeriesManage";
import "@/styles/series.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Run a series", robots: { index: false, follow: false } };

/** Running a team series: staff and admins only. */
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const viewer = await seriesViewer();
  if (!viewer.userId) redirect(`/login?redirect=${encodeURIComponent(`/series/${slug}/manage`)}`);
  if (!viewer.staff) notFound();
  const l = await loadSeries({ slug });
  if (!l) notFound();
  return (
    <main className="ss-manage-page">
      <Container className="ss-container">
        <SeriesManage id={l.series.id} initialTab={tab ?? "setup"} />
      </Container>
    </main>
  );
}
