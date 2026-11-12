import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaceLanes } from "@/components/races/RaceOverlays";
import { cleanCode } from "@/lib/versus/rules";
import { pageView } from "@/lib/versus/store";
import "@/styles/races.css";

/**
 * /races/<code>/obs: a speedrun race's restream link (pick 5A), a 1920 × 1080 OBS browser source with no site chrome:
 * every runner as a lane along the bottom, each after their own stream delay. Anyone with the race's link may use it.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Speedrun race for OBS", robots: { index: false, follow: false } };

export default async function RaceObsPage({ params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code);
  if (!code) notFound();
  const view = await pageView(code, null);
  if (!view) notFound();
  return <RaceLanes watchUrl={view.watchUrl} initial={view.live} />;
}
