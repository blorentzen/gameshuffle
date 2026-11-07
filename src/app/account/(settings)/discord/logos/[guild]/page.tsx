import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Breadcrumb } from "@empac/cascadeds";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { WarLogosManager } from "@/components/wars/WarLogosManager";
import { createClient } from "@/lib/supabase/server";
import { compAppLive } from "@/lib/discord/appIds";
import { warsReady } from "@/lib/wars/store";
import { logoManager, logoPageData } from "@/lib/wars/logoAdmin";
import "@/styles/war-logos.css";

/**
 * A server's team logos (war tools pick 5A): many at once instead of one /logo add each. For the account that added
 * GameShuffle Competitive to the server (and staff); linked from that server on Account ▸ Discord.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team logos", robots: { index: false } };

type Props = { params: Promise<{ guild: string }> };

export default async function LogosPage({ params }: Props) {
  const { guild } = await params;
  if (!compAppLive() || !(await warsReady())) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/account/discord/logos/${guild}`)}`);
  const m = await logoManager(user.id, guild);
  if (!m) notFound();
  const server = m.serverName ?? "This server";
  return (
    <>
      <Breadcrumb className="wl-crumbs" items={[{ label: "Discord", href: "/account/discord?tab=discord&app=comp" }, { label: "Team logos" }]} />
      <AdminScreen title="Team logos" intro={<>{server}&apos;s logos for war cards, tables and the overlay. Teams on MKCentral show their own without one.</>}>
        <WarLogosManager guild={guild} serverName={server} initial={await logoPageData(guild)} />
      </AdminScreen>
    </>
  );
}
