/**
 * /mod/invite/[token] — the magic-link landing page where an invited
 * mod accepts their mod status for a streamer.
 *
 * Server-side: look up the row by token to render the appropriate
 * state without round-tripping after sign-in. Three terminal states
 * + one happy path:
 *
 *   - Invalid / wrong status → "This invite link isn't valid."
 *   - Expired → "This invite link expired — ask the streamer for a fresh one."
 *   - Already claimed (status=active) → "You've already accepted." link to mod view.
 *   - Open + caller not signed in → "Sign in with Twitch/Discord" buttons.
 *   - Open + caller signed in → ClaimClient renders the Accept button.
 *
 * Per `specs/gs-pro-updates/gs-mod-accounts-spec.md` §Invite flow.
 */

import { redirect } from "next/navigation";
import { Container, Alert } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ClaimClient } from "./ClaimClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface InviteRow {
  id: string;
  streamer_user_id: string;
  twitch_user_id: string | null;
  discord_user_id: string | null;
  display_name: string;
  status: "pending" | "invited" | "active" | "revoked";
  invite_expires_at: string | null;
  claimed_at: string | null;
}

interface StreamerProfile {
  username: string | null;
  twitch_username: string | null;
  display_name: string | null;
  twitch_avatar: string | null;
}

export default async function ModInvitePage({ params }: PageProps) {
  const { token } = await params;
  const admin = createServiceClient();

  const { data: rowRaw } = await admin
    .from("streamer_mods")
    .select(
      "id, streamer_user_id, twitch_user_id, discord_user_id, display_name, status, invite_expires_at, claimed_at",
    )
    .eq("invite_token", token)
    .maybeSingle();
  const row = rowRaw as InviteRow | null;

  // Caller's session — used to decide between "sign in" and "accept" UI.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Look up streamer details for personalized copy regardless of state.
  let streamer: StreamerProfile | null = null;
  if (row) {
    const { data: profileRaw } = await admin
      .from("users")
      .select("username, twitch_username, display_name, twitch_avatar")
      .eq("id", row.streamer_user_id)
      .maybeSingle();
    streamer = profileRaw as StreamerProfile | null;
  }
  const streamerName =
    streamer?.display_name ?? streamer?.username ?? streamer?.twitch_username ?? "a streamer";

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
        <ModInviteContent
          token={token}
          row={row}
          user={user}
          streamerName={streamerName}
        />
      </div>
    </Container>
  );
}

/** Extracted so the render branch reads cleanly + dodges the React-
 *  Compiler purity lint that flags `Date.now()` called during render.
 *  Server components don't re-render, but the rule applies anyway. */
function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

function ModInviteContent({
  token,
  row,
  user,
  streamerName,
}: {
  token: string;
  row: InviteRow | null;
  user: { id: string } | null;
  streamerName: string;
}) {
  // -- Invalid token --
  if (!row) {
    return (
      <>
        <h1 style={{ marginTop: 0 }}>Invite link not found</h1>
        <Alert variant="error">
          This invite link isn&rsquo;t valid. Ask the streamer to send you
          a fresh one.
        </Alert>
      </>
    );
  }

  // -- Already claimed --
  if (row.status === "active") {
    redirect(`/account?tab=mods&claimed=already`);
  }

  // -- Revoked --
  if (row.status === "revoked") {
    return (
      <>
        <h1 style={{ marginTop: 0 }}>Invite was revoked</h1>
        <Alert variant="error">
          The streamer revoked this invite before you accepted it. Reach
          out to them directly if this is unexpected.
        </Alert>
      </>
    );
  }

  // -- Wrong status (pending, somehow without an active token) --
  if (row.status !== "invited") {
    return (
      <>
        <h1 style={{ marginTop: 0 }}>Invite isn&rsquo;t active</h1>
        <Alert variant="error">
          This invite isn&rsquo;t in a state we can accept. The streamer
          may have cancelled it — ask them to resend.
        </Alert>
      </>
    );
  }

  // -- Expired --
  if (row.invite_expires_at && isExpired(row.invite_expires_at)) {
    return (
      <>
        <h1 style={{ marginTop: 0 }}>Invite expired</h1>
        <Alert variant="warning">
          Invite links are good for 14 days. Ask {streamerName} to send
          you a fresh one and you&rsquo;ll be in.
        </Alert>
      </>
    );
  }

  // -- Open invite -- delegate to the client component so we can wire
  // OAuth + Accept behavior interactively. We pass only the data the
  // client actually needs; the token stays in the URL.
  return (
    <ClaimClient
      token={token}
      isSignedIn={user !== null}
      streamerName={streamerName}
      neededProvider={
        row.twitch_user_id ? "twitch" : row.discord_user_id ? "discord" : null
      }
      modDisplayName={row.display_name}
    />
  );
}
