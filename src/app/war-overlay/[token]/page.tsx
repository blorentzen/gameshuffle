/**
 * /war-overlay/<token>: set up a Discord channel's war overlay (overlay looks picks 2026-10-31,
 * https://claude.ai/artifact/978WaHqftmK17ogWAWe19J). Reached from Overlay link on the war card. A live preview (the
 * channel's war, or a made-up one), the layout, look and pieces, and an OBS link that carries them with its size.
 * No account needed; signing in saves the look so edits show up without touching OBS, and paid looks unlock with
 * GS Pro or Supporter looks. Noindex: the token is the link.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/seo";
import { channelLabel } from "@/lib/wars/channelLabel";
import { fulfilSupportSession } from "@/lib/support/store";
import { hasLooks } from "@/lib/support/looks";
import { warLive } from "@/lib/wars/live";
import { channelByToken, latestWar } from "@/lib/wars/store";
import { looksReady, myLooks } from "@/lib/wars/looks";
import { streamWarFor } from "@/lib/wars/streamPiece";
import { isProUser } from "@/lib/subscription-server";
import { WarOverlaySetup } from "@/components/wars/WarOverlaySetup";
import { mmrRubik } from "@/components/mmr/mmrFonts";
import "@/styles/war-overlay.css";
import "@/styles/war-setup.css";
import "@/styles/mmr-studio.css";
import "@/styles/tools.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "War overlay setup", robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;

export default async function WarOverlaySetupPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Search> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? null; };
  const channel = await channelByToken(token);
  if (!channel) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const checkout = one("checkout") === "success" || one("checkout") === "canceled" ? { result: one("checkout") as "success" | "canceled", plan: (one("plan") ?? "pro").slice(0, 12) } : null;
  if (user && checkout?.result === "success" && checkout.plan !== "pro" && /^cs_[A-Za-z0-9_]+$/.test(one("session_id") ?? "")) {
    // Back from monthly support checkout: record it now (idempotent with the webhook) so the looks are on at once.
    await fulfilSupportSession(one("session_id")!).catch((e) => console.error("[war-overlay] support fulfil failed:", e));
  }

  const [live, last, label, saved, looksOk, ready, pro, streamWar] = await Promise.all([
    warLive(token),
    latestWar(channel.guildId, channel.channelId),
    channelLabel(channel.guildId, channel.channelId),
    user ? myLooks(user.id).catch(() => []) : Promise.resolve([]),
    user ? hasLooks(user.id).catch(() => false) : Promise.resolve(false),
    looksReady(),
    user ? isProUser(user.id).catch(() => false) : Promise.resolve(false),
    user ? streamWarFor(user.id).catch(() => null) : Promise.resolve(null),
  ]);
  const teams = {
    us: last?.us ?? channel.team ?? { tag: "KC", name: "Kart Club", logo: null },
    them: last?.them ?? { tag: "NOR", name: "Night Owls", logo: null },
  };

  return (
    <main className={`war-setup ${mmrRubik.variable}`}>
      <WarOverlaySetup
        token={token}
        siteUrl={SITE_URL}
        channel={label.channel}
        server={label.server}
        live={live?.ok ? live.war : null}
        teams={teams}
        signedIn={!!user}
        looksOk={looksOk}
        saved={saved}
        canSave={ready}
        then={one("then")}
        checkout={checkout}
        pro={pro}
        streamWar={streamWar}
      />
    </main>
  );
}
