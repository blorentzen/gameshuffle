/**
 * /twitch/commands — Custom-commands editor (Spec 03 §2.1).
 *
 * Streamer-facing tactile surface. Adds, edits, deletes, and toggles
 * per-community static-response commands. Mirrors the chat-side
 * `!commands add|edit|delete|list` flow but with a fuller surface
 * (cooldown editing, actor-tier selection, enabled toggle).
 *
 * Auth: requires a signed-in Twitch streamer with a community row.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  listAllCustomCommandsForCommunity,
  type CustomCommandRow,
} from "@/lib/twitch/commands/customCommands";
import { ensureStreamerEconomyPresence } from "@/lib/economy/bootstrap";
import { CustomCommandsManager } from "./CustomCommandsManager";
import type { ProfileVarStatus } from "./CustomCommandEditModal";

export const metadata: Metadata = {
  title: "Custom Commands",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageState {
  community: { id: string; slug: string; display_name: string | null };
  rows: CustomCommandRow[];
}

export default async function CustomCommandsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/twitch/commands");
  }

  // Lazy-bootstrap the streamer's gs_identities + gs_communities so
  // the editor works for any signed-in Twitch streamer regardless of
  // whether chat / webhooks have run yet.
  const presence = await ensureStreamerEconomyPresence(user);
  if (!presence) {
    return (
      <div className="cc-manager">
        <h1>Custom Commands</h1>
        <p>
          Connect your Twitch account first.{" "}
          <a href="/account?tab=integrations">Open Integrations →</a>
        </p>
      </div>
    );
  }

  const rows = await listAllCustomCommandsForCommunity(presence.communityId);
  const profileStatus = await loadProfileStatus(user.id);
  const state: PageState = {
    community: {
      id: presence.communityId,
      slug: presence.communitySlug,
      display_name: presence.communityDisplayName,
    },
    rows,
  };
  return (
    <CustomCommandsManager
      communityId={state.community.id}
      communitySlug={state.community.slug}
      communityDisplayName={state.community.display_name}
      initialRows={state.rows}
      profileStatus={profileStatus}
    />
  );
}

/**
 * Returns which streamer-profile fields are set so the modal can
 * dim chips that don't have a value yet. Pulled from the users
 * row's gamertags jsonb + the deprecated discord_username /
 * twitch_username columns.
 */
async function loadProfileStatus(userId: string): Promise<ProfileVarStatus> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("gamertags, socials, discord_username, twitch_username")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return {};
  const row = data as {
    gamertags?: Record<string, string | undefined> | null;
    socials?: Record<string, string | undefined> | null;
    discord_username?: string | null;
    twitch_username?: string | null;
  };
  const g = (row.gamertags ?? {}) as Record<string, string | undefined>;
  const s = (row.socials ?? {}) as Record<string, string | undefined>;
  const has = (v: string | null | undefined) => !!(v && v.trim().length > 0);
  return {
    discord: has(row.discord_username) || has(g.discord),
    twitch: has(row.twitch_username) || has(g.twitch),
    psn: has(g.psn),
    nso: has(g.nso),
    xbox: has(g.xbox),
    steam: has(g.steam),
    epic: has(g.epic),
    youtube: has(s.youtube),
    twitter: has(s.twitter),
    tiktok: has(s.tiktok),
    instagram: has(s.instagram),
    bluesky: has(s.bluesky),
    threads: has(s.threads),
  };
}
