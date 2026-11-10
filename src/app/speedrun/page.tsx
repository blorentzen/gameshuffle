import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconDeviceDesktop, IconLayoutSidebarRight, IconStopwatch } from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { IconTile } from "@/components/ui/IconTile";
import { SpeedrunSetup } from "@/components/speedrun/SpeedrunSetup";
import { SpeedrunPitchPreview } from "@/components/speedrun/SpeedrunPitchPreview";
import { createClient } from "@/lib/supabase/server";
import { SPEEDRUN_PUBLIC, speedrunShown } from "@/lib/games-visibility";
import { setupForPage } from "@/lib/speedrun/store";
import "@/styles/speedrun.css";

/**
 * /speedrun (picks 2026-11-09): a runner's speedrun overlay. Signed in: the setup (connect LiveSplit One, the look,
 * the OBS link), the same screen as Studio ▸ Tools ▸ Speedrun. Signed out: a short pitch with Sign up (the full pitch
 * comes with step 2). Hidden in production until the relay runs (SPEEDRUN_PUBLIC).
 */

export const dynamic = "force-dynamic";

const DESCRIPTION = "Your speedrun splits on stream, live from LiveSplit One: every split with ahead and behind, your PB and sum of best, with a moment for each gold split and new PB. Free.";

export const metadata: Metadata = {
  title: "Speedrun overlay for OBS",
  description: DESCRIPTION,
  alternates: { canonical: "https://www.gameshuffle.co/speedrun" },
  openGraph: { title: "Speedrun overlay for OBS", description: DESCRIPTION, url: "https://www.gameshuffle.co/speedrun", siteName: "GameShuffle", type: "website" },
  robots: SPEEDRUN_PUBLIC ? undefined : { index: false, follow: false },
};

const POINTS = [
  { icon: IconStopwatch, title: "Keep your timer", text: "LiveSplit One sends your splits as you run. Nothing to install: it works in the browser." },
  { icon: IconLayoutSidebarRight, title: "Column or Strip", text: "Every split down the side, or one line along the bottom so the game fills the screen." },
  { icon: IconDeviceDesktop, title: "One link in OBS", text: "Add it as a Browser source. Gold splits and new PBs get their own moment on stream." },
];

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
          sub="Connect LiveSplit One once, add the link to OBS, and your splits follow you on stream."
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

  return (
    <main className="sr-page">
      <BrowseHero
        eyebrow="Speedrunning"
        title="Speedrun overlay"
        sub="Your splits on stream from the timer you already use: ahead or behind at every split, your PB and sum of best, and a moment for every gold split. Free with an account."
        subShort="Your LiveSplit One splits on stream. Free."
        accent="blue"
        field="compete"
        compact
        primary={{ href: "/signup?redirect=/speedrun", label: "Sign up free" }}
        secondary={{ href: "/login?redirect=/speedrun", label: "Sign in" }}
      />
      <div className="sr-page__body">
        <section className="sr-pitch" aria-labelledby="sr-pitch-h">
          <div>
            <h2 id="sr-pitch-h" className="sr-pitch__h">How it works</h2>
            <ul className="sr-points">
              {POINTS.map((p) => (
                <li key={p.title}><IconTile icon={p.icon} tone="blue" /><div><b>{p.title}</b><span className="sr-points__text">{p.text}</span></div></li>
              ))}
            </ul>
          </div>
          <SpeedrunPitchPreview />
        </section>
      </div>
    </main>
  );
}
