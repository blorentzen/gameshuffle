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
import { Alert, Breadcrumb, Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { CreateSessionForm } from "@/components/hub/CreateSessionForm";
import { requireHubAccess } from "@/lib/capabilities/hub-access";

export const metadata: Metadata = {
  title: "New stream",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ test?: string }>;
}

export default async function NewSessionPage({ searchParams }: PageProps) {
  const { test: testParam } = await searchParams;
  // `?test=true` defaults the "Test session" toggle on — used by the
  // Hub home test-stream entry so the streamer goes through the same
  // draft → configure → activate flow as a real session, just with
  // the test_session flag pre-set.
  const defaultTestSession = testParam === "true" || testParam === "1";
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
          { label: "Stream hub", href: "/hub" },
          { label: defaultTestSession ? "New test stream" : "New stream" },
        ]}
        separator="chevron"
      />

      <header className="hub-detail__header">
        <div className="hub-detail__header-main">
          <h1 className="hub-detail__title">
            {defaultTestSession ? "New test stream" : "New stream"}
          </h1>
          <p className="hub-page__test-session-body">
            {defaultTestSession ? (
              <>
                Test streams work like real ones (the same setup and the
                same Start button), but they don&rsquo;t end on their own or
                wrap up. Use them to rehearse without adding to your stream
                history.
              </>
            ) : (
              <>
                A stream ties your chat, overlay and live page together for
                one broadcast. Name it, then set the games, the schedule and
                picks and bans on the next page.
              </>
            )}
          </p>
        </div>
      </header>

      {existingDraft ? (
        <section className="hub-detail__section">
          <Alert variant="warning">
            You already have a stream you haven&rsquo;t scheduled or started:{" "}
            <strong>{(existingDraft as { name: string }).name}</strong>. Finish it, or cancel it from its page to start a new one.
            <div className="new-session-modal__draft">
              <Link href={`/hub/sessions/${(existingDraft as { slug: string }).slug}`}>
                <Button variant="secondary" size="small">Open it</Button>
              </Link>
            </div>
          </Alert>
        </section>
      ) : (
        <CreateSessionForm
          twitchConnected={twitchConnected}
          twitchHandle={twitchHandle}
          defaultTestSession={defaultTestSession}
        />
      )}
    </div>
  );
}
