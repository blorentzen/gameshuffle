"use client";

/**
 * Public lobby viewer. Designed for viewers who follow the !gs-lobby
 * overflow link in chat — should look at home in a regular browser
 * tab (full chrome, not the OBS overlay's transparent canvas).
 *
 * Adaptive polling: 10s when a session is active (responsive roster),
 * 60s when idle (no active session). Caches the active session id and
 * passes it back to the API so the route skips the
 * `findTwitchSessionForUser` query on the hot path. This pairs with the
 * same optimization on the OBS overlay route — both endpoints share the
 * `gs_sessions(owner_user_id) WHERE status IN ('active','ending')`
 * query that was hammering the DB.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { RollSlotArt } from "@/components/twitch/RollSlotArt";
import { rollSlots } from "@/lib/twitch/chatRoll";
import "@/styles/twitch-lobby.css";
import { LoadingLines } from "@/components/loading/LoadingLines";

const ACTIVE_POLL_MS = 10000;
const IDLE_POLL_MS = 60000;

interface ParticipantPayload {
  twitchUserId: string;
  login: string;
  displayName: string;
  joinedAt: string;
  isBroadcaster: boolean;
  /** A chat roll for any game (or an older bare Mario Kart combo); read with rollSlots. */
  combo: Record<string, unknown> | null;
  comboAt: string | null;
}

interface SessionPayload {
  id: string;
  randomizerSlug: string | null;
  gameTitle: string | null;
  lobbyCap: number | null;
  status: "active" | "test";
  startedAt: string;
}

interface BroadcasterPayload {
  twitchUserId: string;
  login: string | null;
  displayName: string | null;
  platform?: "twitch" | "youtube";
  watchUrl?: string | null;
}

interface LobbyResponse {
  ok: true;
  broadcaster: BroadcasterPayload;
  session: SessionPayload | null;
  participants: ParticipantPayload[];
}

export function LobbyClient({ token }: { token: string }) {
  const [data, setData] = useState<LobbyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const lastIntervalRef = useRef<number>(ACTIVE_POLL_MS);
  const pollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchLobby = async (): Promise<LobbyResponse | null> => {
      try {
        const url = new URL(
          `/api/twitch/lobby/${encodeURIComponent(token)}`,
          window.location.origin
        );
        if (sessionIdRef.current) {
          url.searchParams.set("session", sessionIdRef.current);
        }
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (cancelled) return null;
        if (!res.ok) {
          setError(
            res.status === 404
              ? "Lobby not found."
              : `Couldn't load lobby (${res.status}).`
          );
          setStale(true);
          return null;
        }
        const body = (await res.json()) as LobbyResponse;
        if (cancelled) return null;
        setData(body);
        setError(null);
        setStale(false);
        return body;
      } catch {
        if (!cancelled) setStale(true);
        return null;
      }
    };

    const tick = async () => {
      if (cancelled) return;
      const body = await fetchLobby();
      if (cancelled) return;

      if (body) {
        sessionIdRef.current = body.session?.id ?? null;
      }

      // Adaptive cadence: 10s when a session is active, 60s when idle.
      // Network failures (body === null) keep the previous cadence so a
      // transient blip doesn't stretch us to 60s during a live session.
      const nextInterval = body
        ? body.session
          ? ACTIVE_POLL_MS
          : IDLE_POLL_MS
        : lastIntervalRef.current;
      lastIntervalRef.current = nextInterval;
      if (cancelled) return;
      pollTimeoutRef.current = window.setTimeout(tick, nextInterval);
    };

    void tick();

    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) window.clearTimeout(pollTimeoutRef.current);
    };
  }, [token]);

  if (error && !data) {
    return (
      <Container>
        <div className="lobby-page">
          <div className="lobby-error">{error}</div>
        </div>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container>
        <div className="lobby-page">
          <LoadingLines label="Loading lobby" />
        </div>
      </Container>
    );
  }

  const broadcasterName =
    data.broadcaster.displayName || data.broadcaster.login || "Streamer";

  if (!data.session) {
    return (
      <Container>
        <div className="lobby-page">
          <header className="lobby-header">
            <h1>{broadcasterName}&rsquo;s Shuffle</h1>
            <p className="lobby-subtitle">No active session right now.</p>
          </header>
          <p className="lobby-empty">
            When {broadcasterName} goes live in a supported game (or starts a test
            session), this page will fill up with the lobby roster.
          </p>
          {data.broadcaster.watchUrl && (
            <p className="lobby-link">
              <a
                href={data.broadcaster.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch on {data.broadcaster.platform === "youtube" ? "YouTube" : "Twitch"} →
              </a>
            </p>
          )}
        </div>
      </Container>
    );
  }

  const { session, participants } = data;
  const cap = session.lobbyCap;
  const count = participants.length;

  return (
    <Container>
      <div className="lobby-page">
        <header className="lobby-header">
          <h1>{broadcasterName}&rsquo;s Shuffle</h1>
          <p className="lobby-subtitle">
            {session.gameTitle ?? "Unsupported category"}
            {session.status === "test" && (
              <span className="lobby-pill lobby-pill--test">Test session</span>
            )}
            {session.status === "active" && (
              <span className="lobby-pill lobby-pill--live">Live</span>
            )}
          </p>
          {data.broadcaster.watchUrl && (
            <p className="lobby-link">
              <a
                href={data.broadcaster.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch on {data.broadcaster.platform === "youtube" ? "YouTube" : "Twitch"} →
              </a>
            </p>
          )}
        </header>

        <div className="lobby-meta">
          <span className="lobby-count">
            {count}
            {cap ? ` / ${cap}` : ""} in the shuffle
          </span>
          {stale && <span className="lobby-stale">Reconnecting…</span>}
        </div>

        {!session.randomizerSlug && (
          <div className="lobby-warning">
            Streamer is on a game GameShuffle doesn&rsquo;t have a randomizer for yet.
            Rolls resume when they switch to one it supports.
          </div>
        )}

        {participants.length === 0 ? (
          <p className="lobby-empty">
            Lobby&rsquo;s empty. Be the first to <code>!gs-join</code> in chat.
          </p>
        ) : (
          <ul className="lobby-grid">
            {participants.map((p) => (
              <li key={p.twitchUserId} className={`lobby-card${p.isBroadcaster ? " lobby-card--broadcaster" : ""}`}>
                <div className="lobby-card__name">
                  {p.displayName}
                  {p.isBroadcaster && <span className="lobby-pill lobby-pill--broadcaster">Streamer</span>}
                </div>
                {rollSlots(p.combo).length ? (
                  <div className="lobby-card__combo">
                    {rollSlots(p.combo).map((slot, idx) => (
                      <div key={idx} className="lobby-slot">
                        <RollSlotArt slot={slot} className="lobby-slot__img" glyphSize={36} compact />
                        <div className="lobby-slot__name">{slot.name}</div>
                        {slot.detail && <div className="lobby-slot__detail">{slot.detail}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="lobby-card__pending">
                    Hasn&rsquo;t shuffled yet. Type <code>!gs-shuffle</code>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <footer className="lobby-footer">
          <p>
            <Link href="/">GameShuffle</Link>: chat-command randomizers for streamers and their viewers.
          </p>
        </footer>
      </div>
    </Container>
  );
}
