"use client";

/**
 * CommunityTab — community module enablement on /account.
 *
 * Replaces the standalone `/twitch/modules` page as the canonical
 * surface for toggling which community features (markets, bounties,
 * awards, chaos events, leaderboards, …) are live for the
 * streamer's viewers. The underlying `<ModulesManager>` component is
 * reused as-is; this tab handles the API fetch + connect-CTA empty
 * state.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@empac/cascadeds";
import { ModulesManager } from "@/app/twitch/modules/ModulesManager";
import type {
  ModuleCatalogRow,
  CommunityModuleRow,
} from "@/lib/economy/modules/registry";

interface ApiResponse {
  ok: true;
  community: { id: string; slug: string; displayName: string | null };
  catalog: ModuleCatalogRow[];
  enablement: CommunityModuleRow[];
}

export function CommunityTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [noCommunity, setNoCommunity] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/community-modules", {
        cache: "no-store",
      });
      if (res.status === 404) {
        setNoCommunity(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Failed to load (${res.status}).`);
        return;
      }
      const body = (await res.json()) as ApiResponse;
      setData(body);
      setNoCommunity(false);
    } catch {
      setLoadError("Network error while loading.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (noCommunity) {
    return (
      <div className="account-card">
        <h2 className="account-tab__heading">Community</h2>
        <Alert variant="info">
          Connect Twitch on{" "}
          <a href="/account?tab=integrations">Account → Integrations</a>{" "}
          to start your community. Once it&rsquo;s set up the
          community modules (markets, bounties, awards, chaos events,
          leaderboards, etc.) will surface here for enablement.
        </Alert>
      </div>
    );
  }

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Community</h2>
      <p className="account-tab__intro">
        Toggle community features on or off for your viewers. Disabled
        modules disappear from chat, help, overlays, and tactile
        surfaces — turn one back on to bring its commands and panels
        back instantly.
      </p>

      {loadError && (
        <div style={{ marginTop: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      {!data ? (
        <p
          style={{
            color: "var(--text-tertiary)",
            fontSize: "var(--font-size-14)",
          }}
        >
          Loading…
        </p>
      ) : (
        <ModulesManager
          communityId={data.community.id}
          communitySlug={data.community.slug}
          communityDisplayName={data.community.displayName}
          catalog={data.catalog}
          enablement={data.enablement}
        />
      )}
    </div>
  );
}
