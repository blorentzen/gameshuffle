/**
 * /twitch/modules — Module Registry management surface (Spec 06 §5).
 *
 * Streamer-facing. Lists every catalog module with the current
 * community's enablement state and a toggle. Disabled modules
 * disappear from chat, help, and tactile surfaces per Spec 06 §4 —
 * this page is the only place they remain visible.
 *
 * Phase 1 surface: list + toggle. Per-module config (chaos price
 * within the band, market timer defaults, etc.) lands in a follow-
 * up alongside the dashboard panel revisions.
 *
 * Auth: requires a signed-in Twitch streamer with a community row.
 * Non-connected users are redirected to the integration flow.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  listCatalog,
  listForCommunity,
  type ModuleCatalogRow,
  type CommunityModuleRow,
} from "@/lib/economy/modules/registry";
import { ensureStreamerEconomyPresence } from "@/lib/economy/bootstrap";
import { ModulesManager } from "./ModulesManager";

export const metadata: Metadata = {
  title: "Modules",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageState {
  community: { id: string; slug: string; display_name: string | null };
  catalog: ModuleCatalogRow[];
  enablement: CommunityModuleRow[];
}

export default async function ModulesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/twitch/modules");
  }

  // Lazy-bootstrap the streamer's gs_identities + gs_communities so
  // the page works even before any webhook / chat hit has created
  // them (common on localhost without Twitch tunneling).
  const presence = await ensureStreamerEconomyPresence(user);
  if (!presence) {
    return (
      <div className="cc-manager">
        <h1>Modules</h1>
        <p>
          Connect your Twitch account first.{" "}
          <a href="/account?tab=integrations">Open Integrations →</a>
        </p>
      </div>
    );
  }

  const [catalog, enablement] = await Promise.all([
    listCatalog(),
    listForCommunity(presence.communityId),
  ]);
  const state: PageState = {
    community: {
      id: presence.communityId,
      slug: presence.communitySlug,
      display_name: presence.communityDisplayName,
    },
    catalog,
    enablement,
  };
  return (
    <ModulesManager
      communityId={state.community.id}
      communitySlug={state.community.slug}
      communityDisplayName={state.community.display_name}
      catalog={state.catalog}
      enablement={state.enablement}
    />
  );
}
