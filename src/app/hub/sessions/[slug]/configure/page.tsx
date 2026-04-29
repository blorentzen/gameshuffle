/**
 * /hub/sessions/[slug]/configure — per-session configuration surface.
 *
 * Per gs-pro-v1-phase-4b-spec.md §5. Hosts the three configuration UIs
 * relocated from /account?tab=integrations:
 *
 *   - Modules (picks/bans + future modules)
 *   - Public Lobby toggle
 *   - Channel Points reward
 *   - Platform attachment summary (read-only with health)
 *
 * Per spec §2.4, the channel point reward + lobby toggle remain
 * per-streamer-global today (data shape unchanged) — the configure page
 * just owns the UI. Notes on each section make this explicit.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Breadcrumb } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getSessionBySlug } from "@/lib/sessions/service";
import { ConfigureSections } from "@/components/hub/ConfigureSections";
import { SessionDetailsForm } from "@/components/hub/SessionDetailsForm";
import { requireHubAccess } from "@/lib/capabilities/hub-access";
import { GAME_NAMES } from "@/data/game-registry";

export const metadata: Metadata = {
  title: "Configure session",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ConfigureSessionPage({ params }: PageProps) {
  const { slug } = await params;
  await requireHubAccess(`/hub/sessions/${slug}/configure`);
  const session = await getSessionBySlug(slug);
  if (!session) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (session.owner_user_id !== user.id) notFound();

  // Pre-fetch the streamer's Twitch connection so client sections start
  // with hydrated state (no flash of "Loading…").
  const admin = createServiceClient();
  const { data: connectionRow } = await admin
    .from("twitch_connections")
    .select(
      "id, twitch_login, twitch_display_name, public_lobby_enabled, channel_points_enabled, channel_point_cost, channel_point_reward_id"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="hub-detail">
      <Breadcrumb
        items={[
          { label: "Hub", href: "/hub" },
          { label: session.name, href: `/hub/sessions/${session.slug}` },
          { label: "Configure" },
        ]}
        separator="chevron"
      />

      <header className="hub-detail__header">
        <div className="hub-detail__header-main">
          <h1 className="hub-detail__title">Configure {session.name}</h1>
        </div>
      </header>

      {!connectionRow && (
        <Alert variant="warning">
          Twitch isn&rsquo;t connected on this account. Some configuration
          options below are disabled — set up the streamer integration in{" "}
          <a href="/account?tab=integrations">Account → Integrations</a>{" "}
          first.
        </Alert>
      )}

      <SessionDetailsForm
        slug={session.slug}
        status={session.status}
        initial={{
          name: session.name,
          description: session.description ?? null,
          game: session.config?.game ?? null,
          scheduledAt: session.scheduled_at,
          scheduledEligibilityWindowHours:
            session.scheduled_eligibility_window_hours ?? 4,
          isTestSession: !!session.feature_flags?.test_session,
        }}
        games={Object.entries(GAME_NAMES).map(([slug, label]) => ({
          slug,
          label,
        }))}
      />

      <ConfigureSections
        sessionId={session.id}
        connection={
          connectionRow
            ? {
                publicLobbyEnabled:
                  (connectionRow.public_lobby_enabled as boolean | null) !== false,
                channelPointsEnabled:
                  !!connectionRow.channel_points_enabled,
                channelPointCost:
                  (connectionRow.channel_point_cost as number | null) ?? 500,
                channelPointRewardId:
                  (connectionRow.channel_point_reward_id as string | null) ?? null,
              }
            : null
        }
      />
    </div>
  );
}
