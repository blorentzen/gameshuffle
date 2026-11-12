import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { getRawAuthenticatedUser } from "@/lib/auth/raw";
import { createServiceClient } from "@/lib/supabase/admin";
import { avatarChoice, type AvatarFields } from "@/lib/avatar/choice";
import { isProduction } from "@/lib/env";
import { KART_PUBLIC, kartShown } from "@/lib/games-visibility";
import { isRideId } from "@/lib/kart/content";
import { driverFor, YOU } from "@/lib/kart/roster";
import { isCharacterLook } from "@/components/games3d/character/types";
import { newSeed } from "@/lib/kart/rng";
import { KartGame } from "@/components/kart/KartGame";
import type { OwnAvatar } from "@/components/kart/engine/avatars";
import "../../styles/kart.css";

/**
 * /kart — Shuffle Kart, GameShuffle's own kart racer (picks 2026-11-12). A first
 * playable prototype: staff only in production (KART_PUBLIC), never indexed, not
 * in the sitemap or menus. A signed-in player drives as their own avatar (the
 * picture the site shows for them).
 *   ?debug=1      frame rate, speed and drift charge over the race (outside production)
 *   ?autopilot=1  the autopilot drives (outside production; for checks and filming)
 *   ?quality=low  no shadows, fewer props (high pins full quality; by default it picks from the first seconds)
 *   ?ride=sedan   draws another ride's model, e.g. one waiting to join the roll (outside production; looks only)
 *   ?look=helmet  the drivers as 3D characters: helmet, token, built or cutout (outside production; picks pending)
 *   ?pose=stand   with ?look, the roll card shows the character on its own, standing or flying (outside production)
 *   ?driver=max   deals this driver, a cast id or "you" (outside production)
 *   ?photo=/images/…  drive as this same-origin picture, like a Twitch or Discord picture (outside production)
 */

export const metadata: Metadata = {
  title: "Shuffle Kart",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

export default async function KartPage({ searchParams }: { searchParams: Promise<{ debug?: string; autopilot?: string; quality?: string; ride?: string; look?: string; pose?: string; driver?: string; photo?: string }> }) {
  const viewer = await getRawAuthenticatedUser();
  const staff = viewer?.role === "staff" || viewer?.role === "admin";
  if (!kartShown(staff)) notFound();

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
  const debug = sp.debug === "1" && !isProduction;
  const autopilot = sp.autopilot === "1" && !isProduction;
  const quality = sp.quality === "low" || sp.quality === "high" ? sp.quality : "auto";
  const ride = !isProduction && sp.ride && isRideId(sp.ride) ? sp.ride : null;
  const look = !isProduction && isCharacterLook(sp.look) ? sp.look : null;
  const pose = look && (sp.pose === "stand" || sp.pose === "fly") ? sp.pose : null;
  const driverId = !isProduction && sp.driver && (sp.driver === YOU || driverFor(sp.driver).id === sp.driver) ? sp.driver : null;
  // A same-origin path only (no other hosts, so the canvas it's drawn on stays readable).
  if (!isProduction && sp.photo && /^\/[^/\\]/.test(sp.photo)) own = { kind: "photo", url: sp.photo };

  return (
    <main className="kart-main">
      <Container>
        <KartGame own={own} seed={newSeed()} staffPreview={!KART_PUBLIC} debug={debug} autopilot={autopilot} quality={quality} ride={ride} look={look} pose={pose} driverId={driverId} />
      </Container>
    </main>
  );
}
