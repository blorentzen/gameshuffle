import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseHero } from "@/components/events/BrowseHero";
import { SpeedrunSetup } from "@/components/speedrun/SpeedrunSetup";
import { SPEEDRUN_DESCRIPTION, SpeedrunPitch } from "@/components/speedrun/SpeedrunPitch";
import { createClient } from "@/lib/supabase/server";
import { SPEEDRUN_PUBLIC, speedrunShown } from "@/lib/games-visibility";
import { setupForPage } from "@/lib/speedrun/store";
import "@/styles/speedrun.css";

/**
 * /speedrun (picks 2026-11-09; launch picks 2026-11-10): a runner's speedrun overlay. Signed in: the setup (connect
 * LiveSplit One, the look, the OBS link), the same screen as Studio ▸ Tools ▸ Speedrun. Signed out: the pitch for
 * visitors (SpeedrunPitch), live and in search from the release (SPEEDRUN_PUBLIC); the menus list it once the
 * speedrun_listed switch is on.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Speedrun Timer Overlay for OBS",
  description: SPEEDRUN_DESCRIPTION,
  alternates: { canonical: "https://www.gameshuffle.co/speedrun" },
  openGraph: { title: "Speedrun timer overlay for OBS", description: SPEEDRUN_DESCRIPTION, url: "https://www.gameshuffle.co/speedrun", siteName: "GameShuffle", type: "website" },
  twitter: { card: "summary_large_image", title: "Speedrun timer overlay for OBS", description: SPEEDRUN_DESCRIPTION },
  robots: SPEEDRUN_PUBLIC ? undefined : { index: false, follow: false },
};

export default async function SpeedrunPage() {
  if (!speedrunShown()) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { initial, blocked } = await setupForPage(user.id);
    return (
      <main className="sr-page">
        <BrowseHero
          eyebrow="Speedrunning"
          title="Your speedrun overlay"
          sub="Connect LiveSplit or LiveSplit One once, add the link to OBS, and your splits follow you on stream."
          accent="blue"
          field="compete"
          compact
        />
        <div className="sr-page__body">
          <SpeedrunSetup initial={initial} blocked={blocked} />
        </div>
      </main>
    );
  }

  return <SpeedrunPitch />;
}
