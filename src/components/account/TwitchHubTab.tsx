"use client";

/**
 * Twitch Hub — embedded as a tab under /account. Accessed via
 * /account?tab=twitch-hub. The UserMenu dropdown links here after the
 * user has linked Twitch (via sign-in or account settings).
 *
 * Phase 4A scope: this tab is now strictly for **integration setup**.
 * Live operations (active session, recent shuffles, test-session control,
 * detected-category indicator) moved to /hub. The C.2 deferred decision
 * keeps Connection Status, Bot Check, Overlay Setup, Public Lobby toggle,
 * Feature Modules, and Channel Points config here until Phase 4B has a
 * dedicated configuration destination.
 *
 * Four states:
 *   - Not connected + free tier     → features list + Start-trial / Go-Pro CTAs
 *   - Not connected + Pro/staff     → Connect CTA with feature list
 *   - Connected                     → integration setup (no session/shuffle data — see /hub)
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Badge, Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import {
  canCreateSession,
  normalizeTier,
  type SubscriptionTier,
} from "@/lib/subscription";
import { ProUpgradeCtaButtons } from "./ProUpgradeCtaButtons";

interface TwitchConnection {
  id: string;
  twitch_login: string | null;
  twitch_display_name: string | null;
  scopes: string[] | null;
  bot_authorized: boolean | null;
  overlay_token: string | null;
  channel_points_enabled: boolean | null;
  channel_point_reward_id: string | null;
  channel_point_cost: number | null;
  public_lobby_enabled: boolean | null;
  updated_at: string | null;
}

interface EventSubSubRow {
  id: string;
  type: string;
  status: string;
}

const EXPECTED_SUB_TYPES = [
  "channel.update",
  "stream.online",
  "stream.offline",
  "channel.chat.message",
];

const CONNECT_ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Twitch sent us back without a code or state — please try again.",
  state_mismatch: "Security check failed (state mismatch). Try connecting again.",
  token_exchange_failed: "Couldn't exchange the Twitch authorization code for a token.",
  db_write_failed: "Connection succeeded with Twitch, but we couldn't save it. Please retry.",
  tier_gated: "Streamer integration requires the Pro plan — coming soon.",
};

export function TwitchHubTab() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [userTier, setUserTier] = useState<SubscriptionTier>("free");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userHasUsedTrial, setUserHasUsedTrial] = useState<boolean>(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<TwitchConnection | null>(null);
  const [subs, setSubs] = useState<EventSubSubRow[]>([]);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [testingChat, setTestingChat] = useState(false);
  const [testChatMessage, setTestChatMessage] = useState<string | null>(null);
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenMessage, setRegenMessage] = useState<string | null>(null);

  const connectError = searchParams.get("connect_error");
  const justConnected = searchParams.get("connected") === "1";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const [connRes, subsRes, userRes] = await Promise.all([
        supabase
          .from("twitch_connections")
          .select(
            "id, twitch_login, twitch_display_name, scopes, bot_authorized, overlay_token, channel_points_enabled, channel_point_reward_id, channel_point_cost, public_lobby_enabled, updated_at"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("twitch_eventsub_subscriptions")
          .select("id, type, status")
          .eq("user_id", user.id),
        supabase
          .from("users")
          .select("subscription_tier, role, has_used_trial")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const conn = (connRes.data as TwitchConnection | null) ?? null;
      setConnection(conn);
      setSubs((subsRes.data as EventSubSubRow[] | null) ?? []);
      if (userRes?.data) {
        setUserTier(normalizeTier(userRes.data.subscription_tier as string | null));
        setUserRole((userRes.data.role as string | null) ?? null);
        setUserHasUsedTrial(!!userRes.data.has_used_trial);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || loading) {
    return (
      <div className="account-card">
        <p>Loading…</p>
      </div>
    );
  }

  if (!connection) {
    const twitchIdentity = user.identities?.find((i) => i.provider === "twitch");
    const isTwitchLinked = !!twitchIdentity;
    const linkedTwitchName =
      twitchIdentity?.identity_data?.preferred_username ||
      twitchIdentity?.identity_data?.name ||
      null;
    // Client-side capability resolution — staff impersonation cookies are
    // HTTP-only and not readable here, so this falls back to HIGHEST_TIER for
    // staff. Server-side gates remain authoritative.
    const isPro = canCreateSession({ tier: userTier, role: userRole });

    // The four no-connection states per gs-connections-architecture.md §7:
    //
    //   Free + no link     → Step 1 (link in Profile, free) + Step 2 (upgrade to Pro)
    //   Free + linked      → "Twitch linked ✓" + Pro upsell to enable streamer integration
    //   Pro  + no link     → "Link Twitch in Profile → Connections first"
    //   Pro  + linked      → "Authorize streamer integration" CTA
    //
    // The basic Twitch OAuth identity link is FREE and lives in Profile →
    // Connections. The streamer integration (bot, overlay, channel points,
    // EventSub) is the Pro-tier upgrade step that lives here.

    const features = (
      <ul style={{ color: "var(--text-primary)", fontSize: "var(--font-size-14)", lineHeight: "var(--line-height-relaxed)", marginBottom: "var(--spacing-20)", paddingLeft: "var(--spacing-20)", display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
        <li>
          <strong>Viewer lobby in your chat.</strong> Viewers type <code>!gs-join</code> to
          enter the shuffle and <code>!gs-shuffle</code> to roll their own Mario Kart combo.
          Up to 24 viewers per session (MKW) / 12 (MK8DX).
        </li>
        <li>
          <strong>Channel point redemptions.</strong> Optional &ldquo;Reroll the
          Streamer&rsquo;s Combo&rdquo; reward — viewers spend points to make <em>you</em>{" "}
          shuffle. Cost is configurable; refunds happen automatically if you&rsquo;re between
          games.
        </li>
        <li>
          <strong>Broadcaster OBS overlay.</strong> A transparent browser source that
          animates your new combo on screen every time you reroll. One URL, works across
          every stream.
        </li>
        <li>
          <strong>Auto-detected game.</strong> The bot follows your Twitch category — MKW for
          MKW, MK8DX for MK8DX. Switch mid-stream and the bot announces the swap.
        </li>
        <li>
          <strong>Public lobby viewer.</strong> Viewers can click a link from chat to see the
          full roster and everyone&rsquo;s current combo.
        </li>
      </ul>
    );

    const ProBadge = (
      <div style={{ marginBottom: "var(--spacing-16)" }}>
        <Badge variant="info" size="small">Pro plan</Badge>
      </div>
    );

    const StepBadge = ({ n, done, disabled }: { n: number; done: boolean; disabled?: boolean }) => (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: "var(--radius-full)",
          background: done ? "var(--success-700)" : disabled ? "var(--gray-300)" : "var(--primary-600)",
          color: "var(--empac-white)",
          fontSize: "var(--font-size-12)",
          fontWeight: "var(--font-weight-bold)",
          marginRight: "var(--spacing-8)",
          flexShrink: 0,
        }}
      >
        {done ? "✓" : n}
      </span>
    );

    return (
      <>
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--spacing-24)", fontSize: "var(--font-size-14)" }}>
          {isTwitchLinked && linkedTwitchName
            ? `Welcome, ${linkedTwitchName}. Set up the streamer integration to turn your stream into a chat-driven Mario Kart randomizer party.`
            : "Turn your stream into a chat-driven Mario Kart randomizer party. Two steps to get there."}
        </p>
        {connectError && (
          <div style={{ marginBottom: "var(--spacing-16)" }}>
            <Alert variant="error">
              {CONNECT_ERROR_MESSAGES[connectError] || `Connection failed: ${connectError}`}
            </Alert>
          </div>
        )}

        {/* Step 1 — link Twitch (free, lives on Profile → Connections) */}
        <div className="account-card">
          <h2 style={{ display: "flex", alignItems: "center" }}>
            <StepBadge n={1} done={isTwitchLinked} />
            Link your Twitch account
          </h2>
          {isTwitchLinked ? (
            <p style={{ color: "var(--text-primary)", fontSize: "var(--font-size-14)", margin: 0 }}>
              <strong style={{ color: "var(--success-700)" }}>Linked as @{linkedTwitchName ?? "your Twitch account"}.</strong>{" "}
              Manage this in <a href="/account?tab=profile" style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}>Profile → Connections</a>.
            </p>
          ) : (
            <>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginBottom: "var(--spacing-16)" }}>
                Free for everyone — gives the platform your Twitch handle and avatar so the
                bot can address you correctly. Lives in Profile → Connections.
              </p>
              <a href="/account?tab=profile">
                <Button variant="secondary">Link Twitch in Profile → Connections</Button>
              </a>
            </>
          )}
        </div>

        {/* Step 2 — authorize the streamer integration (Pro-gated) */}
        <div className="account-card">
          {ProBadge}
          <h2 style={{ display: "flex", alignItems: "center" }}>
            <StepBadge n={2} done={false} disabled={!isTwitchLinked} />
            Authorize streamer integration
          </h2>
          {features}

          {!isPro ? (
            <>
              <p style={{ color: "var(--text-secondary)", marginBottom: "var(--spacing-16)", fontSize: "var(--font-size-14)" }}>
                The bot, overlay, and channel point flow are Pro features. Start a 14-day
                trial (or skip to paid if you&rsquo;ve trialed before) to unlock — your
                Twitch link from step 1 stays exactly as it is.
              </p>
              {upgradeError && (
                <div style={{ marginBottom: "var(--spacing-12)" }}>
                  <Alert variant="error" onClose={() => setUpgradeError(null)}>
                    {upgradeError}
                  </Alert>
                </div>
              )}
              <ProUpgradeCtaButtons hasUsedTrial={userHasUsedTrial} onError={setUpgradeError} />
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-16)", marginBottom: 0 }}>
                {userHasUsedTrial
                  ? "Your card is charged immediately. Cancel anytime from the billing portal."
                  : "Credit card required to start trial. Cancel anytime in the 14-day window and you won't be charged."}
              </p>
            </>
          ) : !isTwitchLinked ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
              Complete step 1 first — link your Twitch account in Profile → Connections, then
              come back here to authorize the streamer integration.
            </p>
          ) : (
            <>
              <p style={{ color: "var(--text-secondary)", marginBottom: "var(--spacing-16)", fontSize: "var(--font-size-14)" }}>
                You&rsquo;re on Pro and Twitch is linked. One last step grants the elevated
                permissions the bot + overlay need. You can disconnect anytime.
              </p>
              <a href="/api/twitch/auth/start">
                <Button variant="primary">Authorize streamer integration</Button>
              </a>
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-16)", marginBottom: 0 }}>
                You&rsquo;ll be asked to grant: read chat (so the bot sees <code>!gs-*</code>),
                send chat as the GameShuffle bot, manage channel point rewards, and detect
                your live status + category. Tokens are encrypted at rest (AES-256-GCM).
              </p>
            </>
          )}
        </div>
      </>
    );
  }

  const enabledCount = subs.filter((s) => s.status === "enabled").length;
  const expectedCount = EXPECTED_SUB_TYPES.length;
  const subsHealthy = enabledCount === expectedCount;

  const handleSyncSubscriptions = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/twitch/subscriptions/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setSyncMessage(`Sync failed: ${body.error || res.statusText}`);
      } else {
        const created = body.created?.length ?? 0;
        const present = body.alreadyPresent?.length ?? 0;
        const failed = body.failures?.length ?? 0;
        setSyncMessage(
          `Sync done. ${created} created, ${present} already present` +
            (failed ? `, ${failed} failed (see console).` : ".")
        );
        if (failed > 0) console.error("[twitch sync] failures:", body.failures);
        // Refresh subs panel after a short delay so the new rows show up.
        window.setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      console.error(err);
      setSyncMessage("Sync failed (network error).");
    }
    setSyncing(false);
  };

  const handleSendTestChat = async () => {
    setTestingChat(true);
    setTestChatMessage(null);
    try {
      const res = await fetch("/api/twitch/bot/test-message", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setTestChatMessage(`Send failed: ${body.error || res.statusText}`);
      } else {
        setTestChatMessage("Sent! Check your Twitch chat.");
      }
    } catch (err) {
      console.error(err);
      setTestChatMessage("Send failed (network error).");
    }
    setTestingChat(false);
  };

  const handleRegenerateOverlay = async () => {
    if (
      !confirm(
        "Regenerate overlay URL? Your current OBS browser source URL will stop working immediately. You'll need to update OBS with the new URL."
      )
    ) {
      return;
    }
    setRegenerating(true);
    setRegenMessage(null);
    try {
      const res = await fetch("/api/twitch/overlay/regenerate", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setRegenMessage(`Regenerate failed: ${body.error || res.statusText}`);
      } else {
        setRegenMessage("New URL ready — copy it from above and update OBS.");
        window.setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      console.error(err);
      setRegenMessage("Regenerate failed (network error).");
    }
    setRegenerating(false);
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your Twitch account from GameShuffle? Active EventSub subscriptions and session data will be removed.")) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch("/api/twitch/disconnect", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ? `Disconnect failed: ${body.error}` : "Disconnect failed.");
        setDisconnecting(false);
        return;
      }
      window.location.reload();
    } catch (err) {
      alert("Disconnect failed.");
      console.error(err);
      setDisconnecting(false);
    }
  };

  return (
    <>
      {justConnected && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <Alert variant="success">
            Connected! Go live in a supported game and we&rsquo;ll detect it within a few seconds.
          </Alert>
        </div>
      )}

      <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginBottom: "var(--spacing-16)" }}>
        Looking for live sessions, shuffle history, or want to configure modules,
        public lobby, and channel points?{" "}
        <a href="/hub" style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}>
          Visit your Hub →
        </a>{" "}
        Open a session and click <em>Configure</em> for the per-session settings.
      </p>

      {/* Connection Status */}
      <div className="account-card">
        <h2>Connection Status</h2>
        <div className="account-card__row">
          <span className="account-card__label">Twitch Account</span>
          <span className="account-card__value">
            {connection.twitch_display_name || connection.twitch_login || "—"}
            {connection.twitch_login && (
              <span style={{ color: "var(--text-tertiary)", marginLeft: "var(--spacing-8)", fontSize: "var(--font-size-12)" }}>
                @{connection.twitch_login}
              </span>
            )}
          </span>
        </div>
        <div className="account-card__row">
          <span className="account-card__label">EventSub Health</span>
          <span className="account-card__value">
            <Badge variant={subsHealthy ? "success" : "warning"} size="small">
              {enabledCount} of {expectedCount} subscriptions active
            </Badge>
          </span>
        </div>
        <div className="account-card__row">
          <span className="account-card__label">Bot Authorized</span>
          <span className="account-card__value">{connection.bot_authorized ? "Yes" : "No"}</span>
        </div>
        <div style={{ marginTop: "var(--spacing-20)", display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="secondary" onClick={handleSyncSubscriptions} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync bot subscriptions"}
          </Button>
          <Button variant="danger" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
          {syncMessage && (
            <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>{syncMessage}</span>
          )}
        </div>
      </div>

      {/* Bot Test */}
      <div className="account-card">
        <h2>Bot Check</h2>
        <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", marginBottom: "var(--spacing-16)" }}>
          Send a one-off test message from the GameShuffle bot to your channel to confirm
          chat permissions are wired up correctly.
        </p>
        <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={handleSendTestChat} disabled={testingChat}>
            {testingChat ? "Sending…" : "Send test chat message"}
          </Button>
          {testChatMessage && (
            <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>{testChatMessage}</span>
          )}
        </div>
      </div>

      {/* Overlay Setup */}
      <div className="account-card">
        <h2>Overlay Setup</h2>
        {connection.overlay_token ? (
          <>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", marginBottom: "var(--spacing-12)" }}>
              Add this URL as a <strong>browser source</strong> in OBS (recommended size: 1920×1080,
              transparent). Whenever you <code>!gs-shuffle</code>, the combo card animates onto the
              overlay for 8 seconds. Viewer shuffles stay in chat only.
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--spacing-8)",
                alignItems: "center",
                background: "var(--background-secondary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-6)",
                padding: "var(--spacing-8) var(--spacing-12)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: "var(--font-size-12)",
                wordBreak: "break-all",
                color: "var(--text-primary)",
              }}
            >
              <span style={{ flex: 1 }}>
                {`${typeof window !== "undefined" ? window.location.origin : "https://www.gameshuffle.co"}/overlay/${connection.overlay_token}`}
              </span>
            </div>
            <div style={{ marginTop: "var(--spacing-12)", display: "flex", gap: "var(--spacing-8)", alignItems: "center", flexWrap: "wrap" }}>
              <Button
                variant="secondary"
                onClick={() => {
                  const url = `${window.location.origin}/overlay/${connection.overlay_token}`;
                  navigator.clipboard.writeText(url);
                  setOverlayCopied(true);
                  window.setTimeout(() => setOverlayCopied(false), 2000);
                }}
              >
                {overlayCopied ? "Copied!" : "Copy overlay URL"}
              </Button>
              <a
                href={`/overlay/${connection.overlay_token}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost">Preview in new tab</Button>
              </a>
              <Button variant="ghost" onClick={handleRegenerateOverlay} disabled={regenerating}>
                {regenerating ? "Regenerating…" : "Regenerate URL"}
              </Button>
              {regenMessage && (
                <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>{regenMessage}</span>
              )}
            </div>
            <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)", marginTop: "var(--spacing-12)", marginBottom: 0 }}>
              Treat this URL like a password — anyone who has it can read your live shuffle activity.
              If it leaks (accidentally shown OBS sources on stream, etc.), use <em>Regenerate URL</em>{" "}
              to invalidate it immediately.
            </p>
          </>
        ) : (
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>
            Overlay URL will be generated automatically. Try reconnecting if this persists.
          </p>
        )}
      </div>

    </>
  );
}
