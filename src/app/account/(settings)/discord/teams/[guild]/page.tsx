import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Breadcrumb } from "@empac/cascadeds";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { WarTeamsManager } from "@/components/wars/WarTeamsManager";
import { createClient } from "@/lib/supabase/server";
import { compAppLive } from "@/lib/discord/appIds";
import { warsReady } from "@/lib/wars/store";
import { logoManager, logoPageData } from "@/lib/wars/logoAdmin";
import { teamsView } from "@/lib/wars/teamAdmin";
import "@/styles/war-logos.css";
import "@/styles/war-teams.css";

/**
 * A server's teams (overrides picks 2026-11-09; was the Logos page, war tools pick 5A): each team's name, every tag
 * it plays under (the first is the one shown), color, logo and players, plus how the server's typed races read and its
 * track nicknames. For the account that added GameShuffle Competitive to the server (and staff); linked from that
 * server on Account ▸ Discord. Before wars-m5.sql runs it's the logos alone.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teams", robots: { index: false } };

type Props = { params: Promise<{ guild: string }> };

export default async function TeamsPage({ params }: Props) {
  const { guild } = await params;
  if (!compAppLive() || !(await warsReady())) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/account/discord/teams/${guild}`)}`);
  const m = await logoManager(user.id, guild);
  if (!m) notFound();
  const server = m.serverName ?? "This server";
  const [logos, view] = await Promise.all([logoPageData(guild), teamsView(guild)]);
  return (
    <>
      <Breadcrumb className="wl-crumbs" items={[{ label: "Discord", href: "/account/discord?tab=discord&app=comp" }, { label: "Teams" }]} />
      <AdminScreen
        title="Teams"
        intro={view
          ? <>How war cards, tables and the overlay show {server}&apos;s teams: names, tags, colors, logos and players.</>
          : <>{server}&apos;s logos for war cards, tables and the overlay. Teams on MKCentral show their own without one. Team names, tags and players arrive with the next update.</>}
      >
        <WarTeamsManager guild={guild} serverName={server} logos={logos} initial={view} />
      </AdminScreen>
    </>
  );
}
