/**
 * /mod/[streamer] — the mod's operational view of a streamer's surfaces.
 *
 * M.3 ships only the welcome landing (post-claim redirect target). The
 * full panel (pending code requests, prequeue management, participants,
 * activity feed, "Release room code" button) lands in M.4.
 *
 * Auth: caller must be signed in AND have an `active` row in
 * `streamer_mods` for this streamer. Anything else → soft redirect to
 * the account page so the user understands what happened.
 */

import { redirect } from "next/navigation";
import { Alert, Badge, Button, Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

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
        <div
          style={{
            maxWidth: "44rem",
            margin: "var(--spacing-48) auto",
            padding: "var(--spacing-24)",
            background: "var(--background-elevated)",
            borderRadius: "var(--radius-md, 0.5rem)",
            boxShadow: "0 0 1rem rgba(0, 0, 0, 0.1)",
          }}
        >
          <h1 style={{ marginTop: 0 }}>Streamer not found</h1>
          <Alert variant="error">
            No GameShuffle streamer matches <strong>@{slug}</strong>.
          </Alert>
        </div>
      </Container>
    );
  }

  // Verify the caller is an active mod for this streamer.
  const { data: modRow } = await admin
    .from("streamer_mods")
    .select("id, status, claimed_at")
    .eq("streamer_user_id", streamer.id)
    .eq("gs_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const isActiveMod = modRow !== null;

  const streamerName =
    streamer.display_name ?? streamer.username ?? streamer.twitch_username ?? slug;

  if (!isActiveMod) {
    return (
      <Container>
        <div
          style={{
            maxWidth: "44rem",
            margin: "var(--spacing-48) auto",
            padding: "var(--spacing-24)",
            background: "var(--background-elevated)",
            borderRadius: "var(--radius-md, 0.5rem)",
            boxShadow: "0 0 1rem rgba(0, 0, 0, 0.1)",
          }}
        >
          <h1 style={{ marginTop: 0 }}>You&rsquo;re not modding for this streamer</h1>
          <Alert variant="warning">
            You don&rsquo;t have active mod status for{" "}
            <strong>{streamerName}</strong>. If they invited you, check that
            you signed in with the same identity the invite was sent to.
          </Alert>
        </div>
      </Container>
    );
  }

  return (
    <Container>
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
        {justClaimed && (
          <div style={{ marginBottom: "var(--spacing-20)" }}>
            <Alert variant="success">
              You&rsquo;re in. {streamerName} now sees you as an active mod
              for their streams.
            </Alert>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-12)",
            marginBottom: "var(--spacing-16)",
          }}
        >
          <h1 style={{ margin: 0 }}>Mod view — {streamerName}</h1>
          <Badge variant="success" size="small">
            Active
          </Badge>
        </div>

        <p
          style={{
            fontSize: "var(--font-size-16)",
            color: "var(--text-secondary)",
            margin: "0 0 var(--spacing-24)",
            lineHeight: "var(--line-height-relaxed)",
          }}
        >
          This is your operational view of {streamerName}&rsquo;s
          GameShuffle surfaces. The full panel — pending code requests,
          prequeue management, participant kicking, the room-code release
          button — lands in the next build chunk.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-12)",
            padding: "var(--spacing-16)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md, 0.5rem)",
            background: "var(--background-secondary)",
            marginBottom: "var(--spacing-20)",
          }}
        >
          <strong style={{ fontSize: "var(--font-size-14)" }}>
            Coming soon — your mod tools
          </strong>
          <ul
            style={{
              margin: 0,
              paddingLeft: "var(--spacing-20)",
              fontSize: "var(--font-size-14)",
              color: "var(--text-secondary)",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            <li>Approve / deny room + friend code requests as they come in</li>
            <li>Kick prequeue spots, clear no-shows after stream starts</li>
            <li>Release the room code (when the streamer enables it)</li>
            <li>Kick active session participants</li>
            <li>Read-only activity feed of what&rsquo;s happening live</li>
          </ul>
        </div>

        <div
          style={{
            display: "flex",
            gap: "var(--spacing-8)",
            flexWrap: "wrap",
          }}
        >
          <a href={`/live/${slug}`} style={{ textDecoration: "none" }}>
            <Button variant="primary">View {streamerName}&rsquo;s live page →</Button>
          </a>
          <a href="/account?tab=mods" style={{ textDecoration: "none" }}>
            <Button variant="secondary">Manage your mod accounts</Button>
          </a>
        </div>
      </div>
    </Container>
  );
}
