/**
 * /mod/[streamer] — the mod's operational view of a streamer's surfaces.
 *
 * M.4 ships the live operational panel: active-participant list with
 * kick, real-time activity feed, plus stubbed sections for the
 * downstream features (code-request approval queue, prequeue
 * management, room-code release). Each stub explains what it'll
 * become so a streamer previewing the surface sees exactly what
 * their mods will get.
 *
 * Auth: caller must be signed in AND either (a) the streamer
 * themselves (implicit-mod self-access) OR (b) hold an `active` row
 * in `streamer_mods` for this streamer. Server actions
 * (`./actions.ts`) repeat the check on every write — the page gate
 * is the first layer, not the only one.
 */

import { redirect } from "next/navigation";
import { Alert, Badge, Button, Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getActiveSessionForOwner } from "@/lib/sessions/service";
import { listActiveParticipants, listSessionEvents } from "@/lib/sessions/queries";
import { RealtimeActivityFeed } from "@/components/hub/RealtimeActivityFeed";
import { ModParticipantsPanel } from "./ModParticipantsPanel";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ streamer: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface StreamerProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  twitch_username: string | null;
  twitch_avatar: string | null;
}

export default async function ModView({ params, searchParams }: PageProps) {
  const { streamer: slug } = await params;
  const sp = await searchParams;
  const justClaimed = sp.claimed === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?redirect=/mod/${encodeURIComponent(slug)}`);
  }

  const admin = createServiceClient();

  // Resolve the streamer profile by slug (username OR twitch_username).
  const { data: byUsername } = await admin
    .from("users")
    .select("id, display_name, username, twitch_username, twitch_avatar")
    .eq("username", slug)
    .maybeSingle();
  let streamer = byUsername as StreamerProfile | null;
  if (!streamer) {
    const { data: byTwitch } = await admin
      .from("users")
      .select("id, display_name, username, twitch_username, twitch_avatar")
      .eq("twitch_username", slug)
      .maybeSingle();
    streamer = byTwitch as StreamerProfile | null;
  }

  if (!streamer) {
    return (
      <Container>
        <ModShell>
          <h1 style={{ marginTop: 0 }}>Streamer not found</h1>
          <Alert variant="error">
            No GameShuffle streamer matches <strong>@{slug}</strong>.
          </Alert>
        </ModShell>
      </Container>
    );
  }

  // Access gates: caller is an active mod OR the streamer themselves.
  const isStreamerSelf = user.id === streamer.id;
  const { data: modRow } = await admin
    .from("streamer_mods")
    .select("id, status")
    .eq("streamer_user_id", streamer.id)
    .eq("gs_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const isActiveMod = modRow !== null;
  const canAccess = isStreamerSelf || isActiveMod;

  const streamerName =
    streamer.display_name ?? streamer.username ?? streamer.twitch_username ?? slug;

  if (!canAccess) {
    return (
      <Container>
        <ModShell>
          <h1 style={{ marginTop: 0 }}>You&rsquo;re not modding for this streamer</h1>
          <Alert variant="warning">
            You don&rsquo;t have active mod status for{" "}
            <strong>{streamerName}</strong>. If they invited you, check
            that you signed in with the same identity the invite was sent to.
          </Alert>
        </ModShell>
      </Container>
    );
  }

  // Active session lookup — drives whether we render the operational
  // panels or the "no active session" placeholder.
  const session = await getActiveSessionForOwner(streamer.id);

  // Pre-fetch initial state for the panels server-side so the client
  // gets first paint without a hydration flicker. Realtime takes over
  // from there.
  const [participants, events] = session
    ? await Promise.all([
        listActiveParticipants(session.id),
        listSessionEvents(session.id, { limit: 25 }),
      ])
    : [[], []];

  return (
    <Container>
      <ModShell>
        {justClaimed && (
          <div style={{ marginBottom: "var(--spacing-20)" }}>
            <Alert variant="success">
              You&rsquo;re in. {streamerName} now sees you as an active mod
              for their streams.
            </Alert>
          </div>
        )}

        {isStreamerSelf && (
          <div style={{ marginBottom: "var(--spacing-20)" }}>
            <Alert variant="info">
              <strong>You&rsquo;re viewing as the streamer.</strong> This is
              the same surface your active mods see — useful for previewing
              what they have access to, plus you can operate any of these
              tools yourself when you&rsquo;re live.
            </Alert>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-12)",
            marginBottom: "var(--spacing-16)",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ margin: 0 }}>Mod view — {streamerName}</h1>
          <Badge variant={isStreamerSelf ? "default" : "success"} size="small">
            {isStreamerSelf ? "Streamer" : "Active"}
          </Badge>
          {session ? (
            <Badge variant="success" size="small">
              ● Live session
            </Badge>
          ) : (
            <Badge variant="default" size="small">
              No active session
            </Badge>
          )}
        </div>

        {!session ? (
          <>
            <Alert variant="info">
              {streamerName} doesn&rsquo;t have an active session right now.
              When they go live, this view fills in with the moderation
              tools below — keep this tab open and it&rsquo;ll light up.
            </Alert>
            <div
              style={{
                marginTop: "var(--spacing-16)",
                padding: "var(--spacing-12) var(--spacing-16)",
                background: "var(--background-secondary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md, 0.5rem)",
                color: "var(--text-tertiary)",
                fontSize: "var(--font-size-12)",
                lineHeight: "var(--line-height-relaxed)",
              }}
            >
              Tools you&rsquo;ll have access to once a session is live:
              kick active participants · read the activity feed
              <span style={{ opacity: 0.7 }}>
                {" "}
                · approve code requests · kick prequeue spots · release
                room code <em>(rolling out as features ship)</em>
              </span>
            </div>
          </>
        ) : (
          <>
            <Section title="Active participants">
              <ModParticipantsPanel
                streamerSlug={slug}
                sessionId={session.id}
                initialParticipants={participants}
              />
            </Section>

            <Section
              title="Activity feed"
              hint="Read-only stream of what's happening this session — joins, shuffles, picks/bans, adapter events. Realtime."
            >
              <RealtimeActivityFeed
                sessionId={session.id}
                initialEvents={events.map((row) => ({ ...row }))}
                limit={25}
              />
            </Section>

            {/* Forward-looking stubs are scoped to the live-session
                branch so an inactive view stays quiet. They sit below
                the operational panels under a "rolling out" header so
                streamers can preview what their mods will eventually
                get without the stubs visually competing with the
                actually-functional tools above. */}
            <div
              style={{
                marginTop: "var(--spacing-32)",
                paddingTop: "var(--spacing-16)",
                borderTop: "1px dashed var(--border-subtle)",
              }}
            >
              <p
                style={{
                  margin: "0 0 var(--spacing-12)",
                  fontSize: "var(--font-size-12)",
                  fontWeight: "var(--font-weight-semibold)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-tertiary)",
                }}
              >
                Rolling out — preview
              </p>

              <Section
                title="Code requests"
                hint="Pending room-code + friend-code requests in approval mode."
                stub
              >
                <p style={{ margin: 0 }}>
                  Once the lobby-code-sharing feature ships, viewers who
                  request the room code (or your friend code) in approval
                  mode will land here for one-tap Approve / Deny.
                </p>
              </Section>

              <Section
                title="Pre-stream queue"
                hint="Discord pre-queue management for the streamer's next session."
                stub
              >
                <p style={{ margin: 0 }}>
                  Once the Discord prequeue feature ships, viewers who
                  clicked &ldquo;I&rsquo;m in&rdquo; on the announcement
                  embed will be listed here with per-row kick +
                  clear-no-shows controls.
                </p>
              </Section>

              <Section
                title="Room code release"
                hint="Manually release the room code when the streamer's sharing mode is set to approval + mod-release."
                stub
              >
                <p style={{ margin: 0 }}>
                  Once the lobby-code-sharing feature ships, this button
                  appears here when {streamerName} has the &ldquo;Allow
                  mods to release room codes&rdquo; setting on and the
                  current room code is in approval mode.
                </p>
              </Section>
            </div>
          </>
        )}

        <div
          style={{
            display: "flex",
            gap: "var(--spacing-8)",
            flexWrap: "wrap",
            marginTop: "var(--spacing-24)",
          }}
        >
          <a href={`/live/${slug}`} style={{ textDecoration: "none" }}>
            <Button variant="primary">
              View {streamerName}&rsquo;s live page →
            </Button>
          </a>
          <a href="/account?tab=mods" style={{ textDecoration: "none" }}>
            <Button variant="secondary">Manage your mod accounts</Button>
          </a>
        </div>
      </ModShell>
    </Container>
  );
}

function ModShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: "56rem",
        margin: "var(--spacing-48) auto",
        padding: "var(--spacing-24)",
        background: "var(--background-elevated)",
        borderRadius: "var(--radius-md, 0.5rem)",
        boxShadow: "0 0 1rem rgba(0, 0, 0, 0.1)",
      }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  hint,
  stub,
  children,
}: {
  title: string;
  hint?: string;
  /** When true, renders dimmed with a "Coming soon" pill so the
   *  user knows the section is a placeholder rather than empty state. */
  stub?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginTop: "var(--spacing-24)",
        padding: "var(--spacing-16) var(--spacing-20)",
        background: "var(--background-secondary)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md, 0.5rem)",
        opacity: stub ? 0.7 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-8)",
          marginBottom: hint ? "var(--spacing-4)" : "var(--spacing-12)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "var(--font-size-18)" }}>{title}</h2>
        {stub && (
          <Badge variant="default" size="small">
            Coming soon
          </Badge>
        )}
      </div>
      {hint && (
        <p
          style={{
            margin: "0 0 var(--spacing-12)",
            fontSize: "var(--font-size-12)",
            color: "var(--text-tertiary)",
            lineHeight: "var(--line-height-snug)",
          }}
        >
          {hint}
        </p>
      )}
      <div
        style={{
          fontSize: "var(--font-size-14)",
          color: "var(--text-secondary)",
          lineHeight: "var(--line-height-relaxed)",
        }}
      >
        {children}
      </div>
    </section>
  );
}
