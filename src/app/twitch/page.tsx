"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getGameName } from "@/data/game-registry";

interface TwitchConnection {
  id: string;
  twitch_login: string | null;
  twitch_display_name: string | null;
  scopes: string[] | null;
  bot_authorized: boolean | null;
  updated_at: string | null;
}

interface EventSubSubRow {
  id: string;
  type: string;
  status: string;
}

interface SessionRow {
  id: string;
  randomizer_slug: string;
  twitch_category_id: string;
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

const TEST_SESSION_GAMES: { slug: string; label: string }[] = [
  { slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe" },
  { slug: "mario-kart-world", label: "Mario Kart World" },
];

const CONNECT_ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Twitch sent us back without a code or state — please try again.",
  state_mismatch: "Security check failed (state mismatch). Try connecting again.",
  token_exchange_failed: "Couldn't exchange the Twitch authorization code for a token.",
  db_write_failed: "Connection succeeded with Twitch, but we couldn't save it. Please retry.",
};

export default function TwitchPage() {
  return (
    <Suspense>
      <TwitchDashboard />
    </Suspense>
  );
}

function TwitchDashboard() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

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
  const [testSessionSlug, setTestSessionSlug] = useState<string>(TEST_SESSION_GAMES[0].slug);
  const [testSessionWorking, setTestSessionWorking] = useState(false);
  const [testSessionMessage, setTestSessionMessage] = useState<string | null>(null);

  const connectError = searchParams.get("connect_error");
  const justConnected = searchParams.get("connected") === "1";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const [connRes, subsRes, sessionsRes] = await Promise.all([
        supabase
          .from("twitch_connections")
          .select("id, twitch_login, twitch_display_name, scopes, bot_authorized, updated_at")
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
          .order("started_at", { ascending: false })
          .limit(1),
      ]);
      if (cancelled) return;
      setConnection((connRes.data as TwitchConnection | null) ?? null);
      setSubs((subsRes.data as EventSubSubRow[] | null) ?? []);
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
    return (
      <>
        <h1 style={{ marginBottom: "1rem" }}>Twitch Streamer Integration</h1>
        {connectError && (
          <div className="auth-page__error" style={{ marginBottom: "1rem" }}>
            {CONNECT_ERROR_MESSAGES[connectError] || `Connection failed: ${connectError}`}
          </div>
        )}
        <div className="account-card">
          <h2>Connect your Twitch account</h2>
          <p style={{ color: "#606060", marginBottom: "1.25rem" }}>
            Link your Twitch channel to GameShuffle so viewers can join your randomizer
            sessions, trigger shuffles via chat or channel points, and follow along on the
            live overlay. You&rsquo;ll be asked to grant:
          </p>
          <ul style={{ color: "#606060", marginBottom: "1.5rem", paddingLeft: "1.25rem", lineHeight: 1.7 }}>
            <li>Read your channel&rsquo;s chat (so the bot can pick up <code>!gs-*</code> commands)</li>
            <li>Send chat as the GameShuffle bot in your channel</li>
            <li>Read &amp; manage channel point rewards (for the optional &ldquo;Randomize&rdquo; reward)</li>
            <li>Detect when you go live and what game you&rsquo;re streaming</li>
          </ul>
          <a href="/api/twitch/auth/start">
            <Button variant="primary">Connect Twitch Account</Button>
          </a>
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

  const handleStartTestSession = async () => {
    setTestSessionWorking(true);
    setTestSessionMessage(null);
    try {
      const res = await fetch("/api/twitch/sessions/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", randomizerSlug: testSessionSlug }),
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
      <h1 style={{ marginBottom: "1rem" }}>Twitch Streamer Integration</h1>
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
              <span className="account-card__value">{getGameName(activeSession.randomizer_slug)}</span>
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
                {participantCount} / {LOBBY_CAPS[activeSession.randomizer_slug] ?? "—"}
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
              No active session. Go live in Mario Kart 8 Deluxe or Mario Kart World, or
              start a test session to try the bot without going live.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={testSessionSlug}
                onChange={(e) => setTestSessionSlug(e.target.value)}
                style={{ padding: "0.5rem 0.75rem", borderRadius: "0.4rem", border: "1px solid #d0d0d0", fontSize: "14px" }}
              >
                {TEST_SESSION_GAMES.map((g) => (
                  <option key={g.slug} value={g.slug}>{g.label}</option>
                ))}
              </select>
              <Button variant="secondary" onClick={handleStartTestSession} disabled={testSessionWorking}>
                {testSessionWorking ? "Starting…" : "Start test session"}
              </Button>
              {testSessionMessage && (
                <span style={{ fontSize: "13px", color: "#606060" }}>{testSessionMessage}</span>
              )}
            </div>
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

      {/* Overlay Setup (Phase 5) */}
      <div className="account-card">
        <h2>Overlay Setup</h2>
        <p style={{ color: "#808080", fontSize: "14px", margin: 0 }}>
          OBS browser-source URL and overlay configuration are coming in Phase 5.
        </p>
      </div>
    </>
  );
}
