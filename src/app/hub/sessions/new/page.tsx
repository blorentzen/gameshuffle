/**
 * /hub/sessions/new — single-form session creation surface.
 *
 * Per gs-pro-v1-phase-4b-spec.md §4. Single page with progressive
 * disclosure (Accordion) — Platforms / Schedule / Modules / Advanced
 * sections collapsed by default; user expands what they need.
 *
 * Capability gate is inherited from /hub/layout.tsx (hub.access).
 * Ownership is enforced inside the Server Action, not here.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { CreateSessionForm } from "@/components/hub/CreateSessionForm";
import { requireHubAccess } from "@/lib/capabilities/hub-access";

export const metadata: Metadata = {
  title: "New session",
  robots: { index: false, follow: false },
};

export default async function NewSessionPage() {
  await requireHubAccess("/hub/sessions/new");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Look up Twitch connection state so the form can pre-fill the
  // "Twitch connected" affordance + skip the Discord placeholder when
  // appropriate.
  const admin = createServiceClient();
  const [{ data: twitchRow }, { data: existingDraft }] = await Promise.all([
    admin
      .from("twitch_connections")
      .select("twitch_login, twitch_display_name")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("gs_sessions")
      .select("slug, name")
      .eq("owner_user_id", user.id)
      .eq("status", "draft")
      .maybeSingle(),
  ]);

  const twitchHandle =
    (twitchRow?.twitch_display_name as string | null) ??
    (twitchRow?.twitch_login as string | null) ??
    null;
  const twitchConnected = !!twitchRow;

  return (
    <div className="hub-detail">
      <Breadcrumb
        items={[
          { label: "Hub", href: "/hub" },
          { label: "New session" },
        ]}
        separator="chevron"
      />

      <header className="hub-detail__header">
        <div className="hub-detail__header-main">
          <h1 className="hub-detail__title">Create a new session</h1>
          <p className="hub-page__test-session-body">
            Sessions are how GameShuffle binds your stream + chat + viewers
            together. Default to &ldquo;Start now&rdquo; — you can configure
            modules and schedule once it&rsquo;s created.
          </p>
        </div>
      </header>

      {existingDraft ? (
        <section className="hub-detail__section">
          <div className="hub-page__test-session">
            <p className="hub-page__test-session-body">
              You already have a draft session in progress:{" "}
              <strong>{(existingDraft as { name: string }).name}</strong>.
              Continue it at{" "}
              <Link
                href={`/hub/sessions/${(existingDraft as { slug: string }).slug}`}
                className="hub-page__test-session-refresh"
              >
                /hub/sessions/{(existingDraft as { slug: string }).slug}
              </Link>{" "}
              before starting a new one.
            </p>
          </div>
        </section>
      ) : (
        <CreateSessionForm
          twitchConnected={twitchConnected}
          twitchHandle={twitchHandle}
        />
      )}
    </div>
  );
}
