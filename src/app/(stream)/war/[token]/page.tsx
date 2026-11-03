/**
 * /war/<token>: a Discord channel's wars as an OBS browser source (transparent, no site chrome). The link comes from
 * the overlay's setup page (/war-overlay/<token>): free choices travel in the query (layout, surface, colors, font, show,
 * moments, side, gs), a saved look comes as ?look=<id> (its edits show up without touching OBS, and its paid choices
 * show while its owner has GS Pro or Supporter looks).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { warLive } from "@/lib/wars/live";
import { lookFromParams } from "@/lib/wars/look";
import { WarOverlay } from "@/components/wars/WarOverlay";
import { mmrRubik } from "@/components/mmr/mmrFonts";
import "@/styles/war-overlay.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "War overlay", robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;

export default async function WarOverlayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Search> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? null; };
  const lookId = /^[0-9a-f-]{36}$/.test(one("look") ?? "") ? one("look") : null;
  const initial = await warLive(token, lookId);
  if (!initial) notFound();
  const look = initial.ok && initial.look ? initial.look : lookFromParams({ get: one });
  return (
    <main className={`war-obs ${mmrRubik.variable}`}>
      <h1 className="war-sr">War overlay</h1>
      <WarOverlay token={token} initial={initial} look={look} lookId={lookId} />
    </main>
  );
}
