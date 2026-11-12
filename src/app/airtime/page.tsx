import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { getRawAuthenticatedUser } from "@/lib/auth/raw";
import { createServiceClient } from "@/lib/supabase/admin";
import { avatarChoice, type AvatarFields } from "@/lib/avatar/choice";
import { isProduction } from "@/lib/env";
import { AIRTIME_PUBLIC, airtimeShown } from "@/lib/games-visibility";
import { GAME_NAME } from "@/lib/airtime/content";
import { newSeed } from "@/lib/airtime/rng";
import { AirtimeGame } from "@/components/airtime/AirtimeGame";
import type { OwnAvatar } from "@/components/airtime/engine/avatar";
import "../../styles/airtime.css";

/**
 * /airtime: GameShuffle's jetpack side-scroller (working name, see GAME_NAME), a
 * first playable slice. Staff only in production (AIRTIME_PUBLIC), never
 * indexed, not in the sitemap or menus; development shows everyone. Works
 * signed out; signed in, you fly with the picture the site shows for you.
 *   ?debug=1      frame rate, draw calls and your position (outside production)
 *   ?autopilot=1  the autopilot plays (outside production; for checks and filming)
 *   ?seed=123     every run on that seed (outside production)
 *   ?level=4      start at that level (outside production)
 *   ?quality=low  no rooftop clutter, fewer windows (high pins full quality; by default it picks from the first seconds)
 */

export const metadata: Metadata = {
  title: GAME_NAME,
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

export default async function AirtimePage({ searchParams }: { searchParams: Promise<{ debug?: string; autopilot?: string; quality?: string; seed?: string; level?: string }> }) {
  const viewer = await getRawAuthenticatedUser();
  const staff = viewer?.role === "staff" || viewer?.role === "admin";
  if (!airtimeShown(staff)) notFound();

  let own: OwnAvatar | null = null;
  if (viewer) {
    const { data } = await createServiceClient()
      .from("users")
      .select("id, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar")
      .eq("id", viewer.id)
      .maybeSingle();
    const choice = avatarChoice((data as AvatarFields | null) ?? { id: viewer.id });
    own = choice.kind === "photo" ? { kind: "photo", url: "/api/account/avatar/raw?size=320" } : { kind: "dicebear", seed: choice.seed, options: choice.options };
  }
  const sp = await searchParams;
  const dev = !isProduction;
  const debug = sp.debug === "1" && dev;
  const autopilot = sp.autopilot === "1" && dev;
  const quality = sp.quality === "low" || sp.quality === "high" ? sp.quality : "auto";
  const pinned = dev && sp.seed && /^\d{1,10}$/.test(sp.seed) ? Math.max(1, Number(sp.seed) % 2147483647) : null;
  const level = dev && sp.level && /^\d{1,2}$/.test(sp.level) ? Math.max(1, Math.min(20, Number(sp.level))) : 1;

  return (
    <main className="airtime-main">
      <Container>
        <AirtimeGame own={own} seed={pinned ?? newSeed()} pinnedSeed={pinned !== null} staffPreview={!AIRTIME_PUBLIC} debug={debug} autopilot={autopilot} quality={quality} startLevel={level} />
      </Container>
    </main>
  );
}
