import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { seriesView } from "@/lib/series/store";
import { seriesViewer } from "@/lib/series/viewer";
import { seriesPath, type SeriesView } from "@/lib/series/view";
import { SeriesClient } from "./SeriesClient";
import { HeroDates } from "./SeriesHeroDates";
import "@/styles/series.css";

/** A series' view for a page: public once announced, staff can see a draft. */
async function load(slug: string): Promise<SeriesView | null> {
  const view = await seriesView(slug);
  if (view) return view;
  const viewer = await seriesViewer();
  return viewer.staff ? seriesView(slug, { staff: true }) : null;
}

const DEFAULT_SUB = "Six teams, each one competitive Mario Kart player and one creator. A week to learn, then the Final.";

export async function seriesMetadata(slug: string): Promise<Metadata> {
  const view = await seriesView(slug);
  if (!view) return { title: "Series", robots: { index: false, follow: false } };
  const description = view.tagline ?? DEFAULT_SUB;
  return {
    title: view.title,
    description,
    alternates: { canonical: seriesPath(view.slug) },
    openGraph: { title: view.title, description, url: seriesPath(view.slug), type: "website", siteName: "GameShuffle" },
  };
}

/** The page (server): the band, then the tabs with the first paint already filled in. */
export async function SeriesPage({ slug, tab }: { slug: string; tab: string }) {
  const view = await load(slug);
  if (!view) notFound();
  const finished = view.status === "finished";
  return (
    <main className="ss-page">
      <BrowseHero
        eyebrow={finished ? "Official GameShuffle event · alumni" : "Official GameShuffle event"}
        title={view.title}
        sub={view.tagline ?? DEFAULT_SUB}
        accent="blue"
        field="compete"
        note={<HeroDates nights={view.nights.map((n) => ({ id: n.id, label: n.label, startsAt: n.startsAt }))} />}
      />
      <Container className="ss-container">
        <SeriesClient initial={view} initialTab={tab} />
      </Container>
    </main>
  );
}
