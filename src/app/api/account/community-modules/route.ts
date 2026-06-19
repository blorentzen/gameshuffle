/**
 * GET /api/account/community-modules
 *
 * Returns the catalog + enablement state for the authenticated
 * streamer's community. Used by the new "Community" tab on /account
 * to render the per-module on/off toggles that previously lived on
 * the `/twitch/modules` page.
 *
 * Bootstraps the streamer's `gs_identities` + `gs_communities` rows
 * on first hit so the tab works even before a webhook / chat trigger
 * has lazy-created them.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listCatalog,
  listForCommunity,
} from "@/lib/economy/modules/registry";
import { ensureStreamerEconomyPresence } from "@/lib/economy/bootstrap";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const presence = await ensureStreamerEconomyPresence(user);
  if (!presence) {
    // Streamer hasn't connected Twitch yet — the UI surfaces a
    // connect CTA in this case.
    return NextResponse.json({ error: "no_community" }, { status: 404 });
  }

  const [catalog, enablement] = await Promise.all([
    listCatalog(),
    listForCommunity(presence.communityId),
  ]);

  return NextResponse.json({
    ok: true,
    community: {
      id: presence.communityId,
      slug: presence.communitySlug,
      displayName: presence.communityDisplayName,
    },
    catalog,
    enablement,
  });
}
