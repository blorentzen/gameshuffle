/**
 * /run/<overlay token>[?look=column|strip]: a runner's speedrun overlay as an OBS browser source (transparent, no site
 * chrome, 1920 × 1080). The token is the OBS link from /speedrun; the page checks its signature and that it's the
 * current link, draws the runner's look and last run at once, then follows the relay's /watch socket live.
 * `?look=` previews the other layout. In development `?relay=ws://localhost:PORT` points at another relay. With the
 * prediction on, the page asks /api/speedrun/prediction/<token> for chat's tally while a run is going.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocalDev } from "@/lib/env";
import { speedrunEnvOrNull } from "@/lib/speedrun/env";
import { idleState } from "@/lib/speedrun/rules";
import { setupForOverlayToken, speedrunReady } from "@/lib/speedrun/store";
import { SpeedrunOverlay } from "@/components/speedrun/SpeedrunOverlay";
import type { SpeedrunLook } from "@/lib/speedrun/types";
import { freeSpeedrunLook, speedrunPaidUsed } from "@/lib/speedrun/look";
import { hasLooks } from "@/lib/support/looks";
import "@/styles/speedrun.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Speedrun overlay", robots: { index: false, follow: false } };

type Search = { look?: string; relay?: string };

export default async function RunObsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Search> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const env = speedrunEnvOrNull();
  if (!env || !(await speedrunReady())) notFound();
  const setup = await setupForOverlayToken(token);
  if (!setup) notFound();

  const layout = sp.look === "column" || sp.look === "strip" ? sp.look : null;
  const saved: SpeedrunLook = layout ? { ...setup.look, layout } : setup.look;
  // Paid choices draw while the runner has GS Pro or Supporter looks; the saved look keeps them either way.
  const look = speedrunPaidUsed(saved).length && !(await hasLooks(setup.userId).catch(() => false)) ? freeSpeedrunLook(saved) : saved;
  const relay = isLocalDev && typeof sp.relay === "string" && /^ws:\/\/localhost:\d{2,5}$/.test(sp.relay) ? sp.relay : env.wsUrl;
  const initial = idleState(setup.run, { game: setup.game, category: setup.category, attempt: setup.attempts });
  // Chat's prediction line, when the runner has it on (GS Pro is checked when one opens).
  const predictionUrl = setup.settings.prediction.on ? `/api/speedrun/prediction/${encodeURIComponent(token)}` : null;
  return (
    <main className="sr-obs">
      <SpeedrunOverlay socketUrl={`${relay}/watch/${token}`} initial={initial} look={look} game={setup.game} category={setup.category} predictionUrl={predictionUrl} />
    </main>
  );
}
