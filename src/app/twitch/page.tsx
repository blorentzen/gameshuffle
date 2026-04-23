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

const EXPECTED_SUB_TYPES = ["channel.update", "stream.online", "stream.offline"];

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
  const [disconnecting, setDisconnecting] = useState(false);

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
          .eq("status", "active")
          .order("started_at", { ascending: false })
          .limit(1),
      ]);
      if (cancelled) return;
      setConnection((connRes.data as TwitchConnection | null) ?? null);
      setSubs((subsRes.data as EventSubSubRow[] | null) ?? []);
      setActiveSession(((sessionsRes.data as SessionRow[] | null) ?? [])[0] ?? null);
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
        <div style={{ marginTop: "1.25rem" }}>
          <Button variant="danger" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
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
              <span className="account-card__label">Started</span>
              <span className="account-card__value">
                {new Date(activeSession.started_at).toLocaleString()}
              </span>
            </div>
          </>
        ) : (
          <p style={{ color: "#808080", fontSize: "14px", margin: 0 }}>
            No active session. Go live in Mario Kart 8 Deluxe or Mario Kart World and the
            session will appear here within a few seconds.
          </p>
        )}
      </div>

      {/* Randomizers (Phase 3) */}
      <div className="account-card">
        <h2>Randomizers</h2>
        <p style={{ color: "#808080", fontSize: "14px", margin: 0 }}>
          Per-game randomizer settings (chat commands, channel points, cooldowns) are
          coming in Phase 3.
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
