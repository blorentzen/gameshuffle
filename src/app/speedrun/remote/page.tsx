import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { speedrunShown } from "@/lib/games-visibility";
import { speedrunEnvOrNull } from "@/lib/speedrun/env";
import { relayState } from "@/lib/speedrun/relay";
import { ensureSetup, gameName, setupForPage, speedrunReady, syncRelay, tokensFor } from "@/lib/speedrun/store";
import { idleState } from "@/lib/speedrun/rules";
import { SpeedrunRemote } from "@/components/speedrun/SpeedrunRemote";
import "@/styles/speedrun.css";

/**
 * /speedrun/remote (phase 1 step 2, approved mockup screen 5): the phone remote. A full-screen timer for runners with no
 * LiveSplit One (a console runner with a phone): big Start, then Split, with Undo, Skip and Reset (Reset asks first).
 * The relay keeps the time; the overlay, chat and predictions follow it as they do LiveSplit One. With LiveSplit One
 * connected, the same buttons split that instead. Signed in, the runner's own relay only; chrome-free, noindex.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Speedrun phone remote", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0d1130" };

export default async function SpeedrunRemotePage() {
  if (!speedrunShown()) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/speedrun/remote");

  const env = speedrunEnvOrNull();
  const { initial, blocked } = await setupForPage(user.id);
  const setup = env && !blocked && (await speedrunReady()) ? await ensureSetup(user.id) : null;
  if (!env || !initial || !setup) {
    return <SpeedrunRemote blocked={blocked ?? "not_ready"} socketUrl={null} initial={null} game="" category="" />;
  }
  const [tokens, rs] = await Promise.all([tokensFor(setup), relayState(setup.relayId)]);
  // The relay needs the run before the first Start: send the saved splits when it has none.
  if (rs.ok && (!rs.state || !rs.state.segments.length) && setup.run.length) await syncRelay(setup);
  const state = rs.ok && rs.state && rs.state.segments.length
    ? rs.state
    : idleState(setup.run, { game: setup.game, category: setup.category, attempt: setup.attempts });
  return (
    <SpeedrunRemote
      blocked={null}
      socketUrl={`${env.wsUrl}/watch/${tokens.overlay}?as=remote`}
      initial={{ state, reachable: rs.ok, overlays: rs.ok ? rs.overlays : null }}
      game={gameName(setup.game)}
      category={setup.category ?? ""}
    />
  );
}
