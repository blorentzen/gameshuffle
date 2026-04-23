"use client";

/**
 * Twitch Hub — embedded as a tab under /account. Accessed via
 * /account?tab=twitch-hub. The UserMenu dropdown links here after the
 * user has linked Twitch (via sign-in or account settings).
 *
 * Four states:
 *   - Not connected + free tier     → "Coming soon for Creator plan"
 *   - Not connected + Creator+      → Connect CTA with feature list
 *   - Connected + active session    → full dashboard (sessions, lobby, overlay, channel points)
 *   - Connected + no session        → test session / go live hint
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getGameName } from "@/data/game-registry";
import {
  canUseTwitchIntegration,
  effectiveTier,
  type SubscriptionTier,
} from "@/lib/subscription";

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
  updated_at: string | null;
}

interface EventSubSubRow {
  id: string;
  type: string;
  status: string;
}

interface SessionRow {
  id: string;
  randomizer_slug: string | null;
  twitch_category_id: string | null;
  status: string;
  started_at: string;
}

interface ShuffleEventRow {
  id: string;
  twitch_display_name: string;
  trigger_type: string;
  combo: { character?: { name: string }; vehicle?: { name: string }; wheels?: { name: string }; glider?: { name: string } } | null;
  is_broadcaster: boolean;
  created_at: string;
}

const LOBBY_CAPS: Record<string, number> = {
  "mario-kart-8-deluxe": 12,
  "mario-kart-world": 24,
};

const EXPECTED_SUB_TYPES = [
  "channel.update",
  "stream.online",
  "stream.offline",
  "channel.chat.message",
];

const SUPPORTED_GAME_LABELS = ["Mario Kart 8 Deluxe", "Mario Kart World"] as const;

const CONNECT_ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Twitch sent us back without a code or state — please try again.",
  state_mismatch: "Security check failed (state mismatch). Try connecting again.",
  token_exchange_failed: "Couldn't exchange the Twitch authorization code for a token.",
  db_write_failed: "Connection succeeded with Twitch, but we couldn't save it. Please retry.",
  tier_gated: "Streamer integration requires the Creator plan — coming soon.",
};

export function TwitchHubTab() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [userTier, setUserTier] = useState<SubscriptionTier>("free");
  const [userRole, setUserRole] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<TwitchConnection | null>(null);
  const [subs, setSubs] = useState<EventSubSubRow[]>([]);
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [recentShuffles, setRecentShuffles] = useState<ShuffleEventRow[]>([]);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [testingChat, setTestingChat] = useState(false);
  const [testChatMessage, setTestChatMessage] = useState<string | null>(null);
  const [testSessionWorking, setTestSessionWorking] = useState(false);
  const [testSessionMessage, setTestSessionMessage] = useState<string | null>(null);
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [cpCost, setCpCost] = useState<number>(500);
  const [cpWorking, setCpWorking] = useState(false);
  const [cpMessage, setCpMessage] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenMessage, setRegenMessage] = useState<string | null>(null);
  const [detectedCategory, setDetectedCategory] = useState<{
    name: string | null;
    slug: string | null;
    supported: boolean;
  } | null>(null);
  const [refreshingCategory, setRefreshingCategory] = useState(false);

  const connectError = searchParams.get("connect_error");
  const justConnected = searchParams.get("connected") === "1";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const [connRes, subsRes, sessionsRes, userRes] = await Promise.all([
        supabase
          .from("twitch_connections")
          .select(
            "id, twitch_login, twitch_display_name, scopes, bot_authorized, overlay_token, channel_points_enabled, channel_point_reward_id, channel_point_cost, updated_at"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("twitch_eventsub_subscriptions")
          .select("id, type, status")
          .eq("user_id", user.id),
        supabase
          .from("twitch_sessions")
          .select("id, randomizer_slug, twitch_category_id, status, started_at")
          .eq("user_id", user.id)
          .in("status", ["active", "test"])
          .order("status", { ascending: true })
          .order("started_at", { ascending: false })
          .limit(1),
        supabase
          .from("users")
          .select("subscription_tier, role")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const conn = (connRes.data as TwitchConnection | null) ?? null;
      setConnection(conn);
      if (conn?.channel_point_cost) setCpCost(conn.channel_point_cost);
      setSubs((subsRes.data as EventSubSubRow[] | null) ?? []);
      if (userRes?.data) {
        setUserTier(((userRes.data.subscription_tier as SubscriptionTier) ?? "free"));
        setUserRole((userRes.data.role as string | null) ?? null);
      }
      const session = ((sessionsRes.data as SessionRow[] | null) ?? [])[0] ?? null;
      setActiveSession(session);

      if (session) {
        const [{ count }, shufflesRes] = await Promise.all([
          supabase
            .from("twitch_session_participants")
            .select("id", { count: "exact", head: true })
            .eq("session_id", session.id)
            .is("left_at", null),
          supabase
            .from("twitch_shuffle_events")
            .select("id, twitch_display_name, trigger_type, combo, is_broadcaster, created_at")
            .eq("session_id", session.id)
            .order("created_at", { ascending: false })
            .limit(10),
        ]);
        if (cancelled) return;
        setParticipantCount(count ?? 0);
        setRecentShuffles((shufflesRes.data as ShuffleEventRow[] | null) ?? []);
      } else {
        setParticipantCount(0);
        setRecentShuffles([]);

        // Detect current Twitch category so we can show what game a
        // test session would adopt if the streamer started one now.
        try {
          const res = await fetch("/api/twitch/category/current", { cache: "no-store" });
          if (res.ok) {
            const body = await res.json();
            if (cancelled) return;
            setDetectedCategory({
              name: body.categoryName ?? null,
              slug: body.randomizerSlug ?? null,
              supported: !!body.supported,
            });
          }
        } catch {
          // Best-effort — the start endpoint will try again at click time.
        }
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
    const linkedTwitchName =
      twitchIdentity?.identity_data?.preferred_username ||
      twitchIdentity?.identity_data?.name ||
      null;
    const eligibleTier = effectiveTier({ tier: userTier, role: userRole });
    const canConnect = canUseTwitchIntegration(eligibleTier);

    const features = (
      <ul style={{ color: "#404040", marginBottom: "1.25rem", paddingLeft: "1.25rem", lineHeight: 1.8 }}>
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

    return (
      <>
        <p style={{ color: "#606060", marginBottom: "1.5rem", fontSize: "15px" }}>
          {linkedTwitchName
            ? `Welcome, ${linkedTwitchName}. You've linked your Twitch account — here's what else you can unlock.`
            : "Turn your stream into a chat-driven Mario Kart randomizer party. Here's what the streamer integration unlocks."}
        </p>
        {connectError && (
          <div className="auth-page__error" style={{ marginBottom: "1rem" }}>
            {CONNECT_ERROR_MESSAGES[connectError] || `Connection failed: ${connectError}`}
          </div>
        )}

        {canConnect ? (
          <div className="account-card">
            <h2>What streamer integration unlocks</h2>
            {features}
            <a href="/api/twitch/auth/start">
              <Button variant="primary">Connect for streamer integration</Button>
            </a>
            <p style={{ color: "#808080", fontSize: "12px", marginTop: "1rem", marginBottom: 0 }}>
              You&rsquo;ll be asked to grant: read chat (so the bot sees <code>!gs-*</code>),
              send chat as the GameShuffle bot, manage channel point rewards, and detect your
              live status + category. Tokens are encrypted at rest (AES-256-GCM). You can
              disconnect anytime.
            </p>
          </div>
        ) : (
          <div className="account-card">
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "#fff8e1",
                color: "#7a5b00",
                padding: "0.4rem 0.75rem",
                borderRadius: "999px",
                border: "1px solid #f0d97a",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                marginBottom: "1rem",
              }}
            >
              Coming soon — Creator plan
            </div>
            <h2>Streamer integration is a Creator feature</h2>
            <p style={{ color: "#606060", marginBottom: "1rem" }}>
              The full bot, overlay, and channel point flow ships with the Creator plan. Paid
              plans aren&rsquo;t live yet — we&rsquo;ll notify connected accounts when they
              are. For now, here&rsquo;s what you&rsquo;re signing up for:
            </p>
            {features}
            <p style={{ color: "#808080", fontSize: "13px", margin: 0 }}>
              Your Twitch account link (for sign-in &amp; avatar) stays active — the
              integration is a separate OAuth grant with elevated permissions.
            </p>
          </div>
        )}
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

  const handleRefreshCategory = async () => {
    setRefreshingCategory(true);
    try {
      const res = await fetch("/api/twitch/category/current", { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setDetectedCategory({
          name: body.categoryName ?? null,
          slug: body.randomizerSlug ?? null,
          supported: !!body.supported,
        });
      }
    } catch {
      // ignore
    }
    setRefreshingCategory(false);
  };

  const handleStartTestSession = async () => {
    setTestSessionWorking(true);
    setTestSessionMessage(null);
    try {
      const res = await fetch("/api/twitch/sessions/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const body = await res.json();
      if (!res.ok) {
        setTestSessionMessage(`Couldn't start test session: ${body.error || res.statusText}`);
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      setTestSessionMessage("Couldn't start test session (network error).");
    }
    setTestSessionWorking(false);
  };

  const handleEndTestSession = async () => {
    setTestSessionWorking(true);
    setTestSessionMessage(null);
    try {
      const res = await fetch("/api/twitch/sessions/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setTestSessionMessage(`Couldn't end test session: ${body.error || res.statusText}`);
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      setTestSessionMessage("Couldn't end test session (network error).");
    }
    setTestSessionWorking(false);
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

  const handleChannelPoints = async (action: "enable" | "disable" | "update_cost") => {
    setCpWorking(true);
    setCpMessage(null);
    try {
      const res = await fetch("/api/twitch/channel-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cost: cpCost }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCpMessage(body.message || `Failed: ${body.error || res.statusText}`);
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      setCpMessage("Channel points request failed (network error).");
    }
    setCpWorking(false);
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
        <div
          style={{
            background: "#e6f7ee",
            color: "#155724",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            border: "1px solid #b7e4c7",
            marginBottom: "1rem",
            fontSize: "14px",
          }}
        >
          Connected! Go live in a supported game and we&rsquo;ll detect it within a few seconds.
        </div>
      )}

      {/* Connection Status */}
      <div className="account-card">
        <h2>Connection Status</h2>
        <div className="account-card__row">
          <span className="account-card__label">Twitch Account</span>
          <span className="account-card__value">
            {connection.twitch_display_name || connection.twitch_login || "—"}
            {connection.twitch_login && (
              <span style={{ color: "#808080", marginLeft: "0.5rem", fontSize: "13px" }}>
                @{connection.twitch_login}
              </span>
            )}
          </span>
        </div>
        <div className="account-card__row">
          <span className="account-card__label">EventSub Health</span>
          <span className="account-card__value">
            <span style={{ color: subsHealthy ? "#17A710" : "#856404", fontWeight: 600 }}>
              {enabledCount} of {expectedCount} subscriptions active
            </span>
          </span>
        </div>
        <div className="account-card__row">
          <span className="account-card__label">Bot Authorized</span>
          <span className="account-card__value">{connection.bot_authorized ? "Yes" : "No"}</span>
        </div>
        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="secondary" onClick={handleSyncSubscriptions} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync bot subscriptions"}
          </Button>
          <Button variant="danger" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
          {syncMessage && (
            <span style={{ fontSize: "13px", color: "#606060" }}>{syncMessage}</span>
          )}
        </div>
      </div>

      {/* Active Session */}
      <div className="account-card">
        <h2>Active Session</h2>
        {activeSession ? (
          <>
            <div className="account-card__row">
              <span className="account-card__label">Game</span>
              <span className="account-card__value">
                {activeSession.randomizer_slug ? (
                  getGameName(activeSession.randomizer_slug)
                ) : (
                  <span style={{ color: "#856404" }}>
                    Unsupported category — bot will reply &ldquo;not supported&rdquo; on shuffle
                  </span>
                )}
              </span>
            </div>
            <div className="account-card__row">
              <span className="account-card__label">Status</span>
              <span className="account-card__value">
                {activeSession.status === "test" ? (
                  <span style={{ color: "#856404", fontWeight: 600 }}>Test session</span>
                ) : (
                  <span style={{ color: "#17A710", fontWeight: 600 }}>Live</span>
                )}
              </span>
            </div>
            <div className="account-card__row">
              <span className="account-card__label">Started</span>
              <span className="account-card__value">
                {new Date(activeSession.started_at).toLocaleString()}
              </span>
            </div>
            <div className="account-card__row">
              <span className="account-card__label">In the shuffle</span>
              <span className="account-card__value">
                {participantCount} / {(activeSession.randomizer_slug && LOBBY_CAPS[activeSession.randomizer_slug]) ?? "—"}
              </span>
            </div>
            {recentShuffles.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "#606060", marginBottom: "0.5rem" }}>
                  Recent shuffles
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {recentShuffles.map((s) => {
                    const parts = [s.combo?.character?.name, s.combo?.vehicle?.name, s.combo?.wheels?.name, s.combo?.glider?.name]
                      .filter((p): p is string => !!p && p !== "N/A");
                    return (
                      <li key={s.id} style={{ fontSize: "13px", color: "#606060" }}>
                        <span style={{ fontWeight: 600, color: s.is_broadcaster ? "#0E75C1" : "#404040" }}>
                          {s.twitch_display_name}
                        </span>
                        {" — "}
                        {parts.join(" · ")}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {activeSession.status === "test" && (
              <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <Button variant="secondary" onClick={handleEndTestSession} disabled={testSessionWorking}>
                  {testSessionWorking ? "Ending…" : "End test session"}
                </Button>
                {testSessionMessage && (
                  <span style={{ fontSize: "13px", color: "#606060" }}>{testSessionMessage}</span>
                )}
              </div>
            )}
            <p style={{ color: "#606060", fontSize: "13px", marginTop: "1rem", marginBottom: 0 }}>
              Type <code>!gs-shuffle</code> in your Twitch chat for your own combo.
              Viewers can <code>!gs-join</code> to play, then <code>!gs-shuffle</code>
              for theirs. Full list: <code>!gs-help</code>.
            </p>
          </>
        ) : (
          <>
            <p style={{ color: "#808080", fontSize: "14px", marginBottom: "1rem" }}>
              No active session. Go live in {SUPPORTED_GAME_LABELS.join(" or ")}, or
              start a test session — the bot will use whatever Twitch category your
              channel is set to.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={handleStartTestSession} disabled={testSessionWorking}>
                {testSessionWorking ? "Starting…" : "Start test session"}
              </Button>
              {testSessionMessage && (
                <span style={{ fontSize: "13px", color: "#606060" }}>{testSessionMessage}</span>
              )}
            </div>
            {detectedCategory && (
              <p style={{ fontSize: "12px", color: "#808080", marginTop: "0.75rem", marginBottom: 0 }}>
                {detectedCategory.supported ? (
                  <>Twitch category: <strong>{detectedCategory.name}</strong> — bot will use the matching randomizer.</>
                ) : detectedCategory.name ? (
                  <>Twitch category: <strong>{detectedCategory.name}</strong> — not supported; bot will reply &ldquo;not supported&rdquo; until you switch to a Mario Kart category.</>
                ) : (
                  <>No category set on your Twitch channel — set one before testing.</>
                )}{" "}
                <button
                  type="button"
                  onClick={handleRefreshCategory}
                  disabled={refreshingCategory}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#0E75C1",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "12px",
                    textDecoration: "underline",
                  }}
                >
                  {refreshingCategory ? "Refreshing…" : "Refresh"}
                </button>
              </p>
            )}
          </>
        )}
      </div>

      {/* Bot Test */}
      <div className="account-card">
        <h2>Bot Check</h2>
        <p style={{ color: "#808080", fontSize: "14px", marginBottom: "1rem" }}>
          Send a one-off test message from the GameShuffle bot to your channel to confirm
          chat permissions are wired up correctly.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={handleSendTestChat} disabled={testingChat}>
            {testingChat ? "Sending…" : "Send test chat message"}
          </Button>
          {testChatMessage && (
            <span style={{ fontSize: "13px", color: "#606060" }}>{testChatMessage}</span>
          )}
        </div>
      </div>

      {/* Overlay Setup */}
      <div className="account-card">
        <h2>Overlay Setup</h2>
        {connection.overlay_token ? (
          <>
            <p style={{ color: "#606060", fontSize: "14px", marginBottom: "0.75rem" }}>
              Add this URL as a <strong>browser source</strong> in OBS (recommended size: 1920×1080,
              transparent). Whenever you <code>!gs-shuffle</code>, the combo card animates onto the
              overlay for 8 seconds. Viewer shuffles stay in chat only.
            </p>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                background: "#f5f6f8",
                border: "1px solid #e2e5ea",
                borderRadius: "0.4rem",
                padding: "0.5rem 0.75rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: "13px",
                wordBreak: "break-all",
                color: "#404040",
              }}
            >
              <span style={{ flex: 1 }}>
                {`${typeof window !== "undefined" ? window.location.origin : "https://www.gameshuffle.co"}/overlay/${connection.overlay_token}`}
              </span>
            </div>
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
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
                <span style={{ fontSize: "13px", color: "#606060" }}>{regenMessage}</span>
              )}
            </div>
            <p style={{ color: "#808080", fontSize: "12px", marginTop: "0.75rem", marginBottom: 0 }}>
              Treat this URL like a password — anyone who has it can read your live shuffle activity.
              If it leaks (accidentally shown OBS sources on stream, etc.), use <em>Regenerate URL</em>{" "}
              to invalidate it immediately.
            </p>
          </>
        ) : (
          <p style={{ color: "#808080", fontSize: "14px", margin: 0 }}>
            Overlay URL will be generated automatically. Try reconnecting if this persists.
          </p>
        )}
      </div>

      {/* Channel Points */}
      <div className="account-card">
        <h2>Channel Points</h2>
        {connection.channel_points_enabled ? (
          <>
            <p style={{ color: "#606060", fontSize: "14px", marginBottom: "0.75rem" }}>
              <strong>Active.</strong> The reward <em>🎲 GameShuffle: Reroll the Streamer&rsquo;s Combo</em>{" "}
              is live in your channel. Viewers spend <strong>{connection.channel_point_cost ?? cpCost}</strong>{" "}
              points to force <em>your</em> combo to reroll — bot posts the new combo in chat,
              overlay animates, and <code> !gs-mycombo</code> returns the fresh roll.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: "13px", color: "#606060" }}>Cost:</label>
              <input
                type="number"
                min={1}
                max={1000000}
                value={cpCost}
                onChange={(e) => setCpCost(Math.max(1, parseInt(e.target.value || "1", 10)))}
                style={{ padding: "0.4rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #d0d0d0", width: "120px", fontSize: "14px" }}
              />
              <Button
                variant="secondary"
                onClick={() => handleChannelPoints("update_cost")}
                disabled={cpWorking || cpCost === connection.channel_point_cost}
              >
                {cpWorking ? "Working…" : "Update cost"}
              </Button>
              <Button variant="danger" onClick={() => handleChannelPoints("disable")} disabled={cpWorking}>
                Disable
              </Button>
              {cpMessage && <span style={{ fontSize: "13px", color: "#606060" }}>{cpMessage}</span>}
            </div>
            <p style={{ fontSize: "12px", color: "#808080", marginTop: "0.75rem", marginBottom: 0 }}>
              Updating the cost re-creates the reward (Twitch limitation). Existing redemptions
              still in the queue will be refunded; new ones will use the new cost.
            </p>
          </>
        ) : (
          <>
            <p style={{ color: "#606060", fontSize: "14px", marginBottom: "0.75rem" }}>
              Let viewers spend channel points to <strong>reroll your combo</strong>. We&rsquo;ll
              create a <em>🎲 GameShuffle: Reroll the Streamer&rsquo;s Combo</em> reward in your
              channel and listen for redemptions. Each redeem randomizes <em>your</em> loadout
              (not the viewer&rsquo;s) — combo goes to chat, overlay updates, and the viewer gets
              credit in the message. Points refund automatically if you&rsquo;re between supported
              games.
            </p>
            <p style={{ color: "#808080", fontSize: "13px", marginBottom: "0.75rem" }}>
              Viewers who want their own combos keep using <code>!gs-join</code> +{" "}
              <code>!gs-shuffle</code> — those stay free.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: "13px", color: "#606060" }}>Cost (points):</label>
              <input
                type="number"
                min={1}
                max={1000000}
                value={cpCost}
                onChange={(e) => setCpCost(Math.max(1, parseInt(e.target.value || "1", 10)))}
                style={{ padding: "0.4rem 0.6rem", borderRadius: "0.4rem", border: "1px solid #d0d0d0", width: "120px", fontSize: "14px" }}
              />
              <Button variant="primary" onClick={() => handleChannelPoints("enable")} disabled={cpWorking}>
                {cpWorking ? "Enabling…" : "Enable channel points"}
              </Button>
              {cpMessage && <span style={{ fontSize: "13px", color: "#9a2f2c" }}>{cpMessage}</span>}
            </div>
            <p style={{ fontSize: "12px", color: "#808080", marginTop: "0.75rem", marginBottom: 0 }}>
              Requires Twitch Affiliate or Partner status.
            </p>
          </>
        )}
      </div>

      {/* Randomizers */}
      <div className="account-card">
        <h2>Randomizers</h2>
        <p style={{ color: "#606060", fontSize: "14px", marginBottom: "0.75rem" }}>
          Active for any session in <strong>Mario Kart 8 Deluxe</strong> (lobby cap 12)
          or <strong>Mario Kart World</strong> (lobby cap 24). Viewers join via{" "}
          <code>!gs-join</code> and shuffle with <code>!gs-shuffle</code>.
        </p>
        <p style={{ color: "#808080", fontSize: "13px", margin: 0 }}>
          Per-streamer config (channel points, cooldown overrides, access levels) and the
          live overlay are coming in Phases 4–5.
        </p>
      </div>

    </>
  );
}
