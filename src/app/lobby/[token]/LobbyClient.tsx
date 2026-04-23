"use client";

/**
 * Public lobby viewer. Polls /api/twitch/lobby/[token] every 10 seconds
 * for fresh state. Designed for viewers who follow the !gs-lobby
 * overflow link in chat — should look at home in a regular browser
 * tab (full chrome, not the OBS overlay's transparent canvas).
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { getImagePath } from "@/lib/images";
import "@/styles/twitch-lobby.css";

const POLL_INTERVAL_MS = 10000;

interface ComboSlot {
  name: string;
  img: string;
}

interface ComboPayload {
  character?: ComboSlot;
  vehicle?: ComboSlot;
  wheels?: ComboSlot;
  glider?: ComboSlot;
}

interface ParticipantPayload {
  twitchUserId: string;
  login: string;
  displayName: string;
  joinedAt: string;
  isBroadcaster: boolean;
  combo: ComboPayload | null;
  comboAt: string | null;
}

interface SessionPayload {
  id: string;
  randomizerSlug: string | null;
  gameTitle: string | null;
  lobbyCap: number | null;
  hasWheels: boolean;
  hasGlider: boolean;
  status: "active" | "test";
  startedAt: string;
}

interface BroadcasterPayload {
  twitchUserId: string;
  login: string | null;
  displayName: string | null;
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

  useEffect(() => {
    let cancelled = false;
    const fetchLobby = async () => {
      try {
        const res = await fetch(`/api/twitch/lobby/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 404 ? "Lobby not found." : `Couldn't load lobby (${res.status}).`);
          setStale(true);
          return;
        }
        const body = (await res.json()) as LobbyResponse;
        if (cancelled) return;
        setData(body);
        setError(null);
        setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      }
    };
    fetchLobby();
    const timer = window.setInterval(fetchLobby, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
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
          <p className="lobby-loading">Loading lobby…</p>
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
          {data.broadcaster.login && (
            <p className="lobby-link">
              <a
                href={`https://twitch.tv/${data.broadcaster.login}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch on Twitch →
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
          {data.broadcaster.login && (
            <p className="lobby-link">
              <a
                href={`https://twitch.tv/${data.broadcaster.login}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch on Twitch →
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
            Streamer is on a category GameShuffle doesn&rsquo;t support yet —
            commands will resume when they switch back to a Mario Kart category.
          </div>
        )}

        {participants.length === 0 ? (
          <p className="lobby-empty">
            Lobby&rsquo;s empty — be the first to <code>!gs-join</code> in chat.
          </p>
        ) : (
          <ul className="lobby-grid">
            {participants.map((p) => (
              <li key={p.twitchUserId} className={`lobby-card${p.isBroadcaster ? " lobby-card--broadcaster" : ""}`}>
                <div className="lobby-card__name">
                  {p.displayName}
                  {p.isBroadcaster && <span className="lobby-pill lobby-pill--broadcaster">Streamer</span>}
                </div>
                {p.combo ? (
                  <div className="lobby-card__combo">
                    {[p.combo.character, p.combo.vehicle, p.combo.wheels, p.combo.glider]
                      .filter((s): s is ComboSlot => !!s && !!s.img && s.name !== "N/A")
                      .map((slot, idx) => (
                        <div key={idx} className="lobby-slot">
                          <div className="lobby-slot__img">
                            <Image
                              src={getImagePath(slot.img)}
                              alt={slot.name}
                              width={72}
                              height={72}
                              unoptimized
                            />
                          </div>
                          <div className="lobby-slot__name">{slot.name}</div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="lobby-card__pending">
                    Hasn&rsquo;t shuffled yet — <code>!gs-shuffle</code>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <footer className="lobby-footer">
          <p>
            <Link href="/">GameShuffle</Link> — chat command-driven Mario Kart randomizers for streamers.
          </p>
        </footer>
      </div>
    </Container>
  );
}
