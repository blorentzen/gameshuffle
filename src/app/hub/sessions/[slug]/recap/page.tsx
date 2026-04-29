/**
 * /hub/sessions/[slug]/recap — public, auth-free recap page.
 *
 * Per gs-pro-v1-phase-4b-spec.md §6. Renders for any session in `ended`
 * or `cancelled` status — pre-ended states render a placeholder.
 *
 * Public artifact, private editing surface (same model as YouTube
 * video URLs). Streamers will share this in stream descriptions, Discord
 * servers, social media — OG metadata renders rich previews.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Container } from "@empac/cascadeds";
import { createServiceClient } from "@/lib/supabase/admin";
import { getSessionBySlug } from "@/lib/sessions/service";
import { listSessionEvents, listActiveParticipants } from "@/lib/sessions/queries";
import type { ParticipantRow, SessionEventRow } from "@/lib/sessions/queries";
import { formatDuration } from "@/lib/time/relative";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const session = await getSessionBySlug(slug);
  if (!session) return { title: "Recap not found" };

  const summary = await loadRecapSummary(session.id);
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://www.gameshuffle.co";
  const canonical = `${base}/hub/sessions/${slug}/recap`;
  const platformLabel = describePlatform(session.platforms);
  const description =
    summary.shuffleCount > 0
      ? `Streamed${platformLabel ? ` on ${platformLabel}` : ""}. ${summary.shuffleCount} shuffles, ${formatDuration(summary.durationSeconds ?? 0)}.`
      : `Streamed${platformLabel ? ` on ${platformLabel}` : ""}. ${summary.durationSeconds !== null ? formatDuration(summary.durationSeconds) : ""}`.trim();

  return {
    title: `${session.name} — GameShuffle Recap`,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      title: `${session.name} — GameShuffle Recap`,
      description,
      siteName: "GameShuffle",
    },
    twitter: {
      card: "summary_large_image",
      title: `${session.name} — GameShuffle Recap`,
      description,
    },
  };
}

export default async function RecapPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await getSessionBySlug(slug);
  if (!session) notFound();

  const isFinal = session.status === "ended" || session.status === "cancelled";
  if (!isFinal) {
    return (
      <Container>
        <div className="recap-page">
          <header className="recap-page__header">
            <p className="recap-page__eyebrow">GameShuffle • Recap</p>
            <h1 className="recap-page__title">{session.name}</h1>
          </header>
          <section className="recap-page__section">
            <p className="recap-page__placeholder">
              Recap is not available yet — this session is still in{" "}
              <strong>{session.status}</strong> status. Recaps publish after a
              session ends.
            </p>
          </section>
        </div>
      </Container>
    );
  }

  const [participants, events, streamerInfo] = await Promise.all([
    listActiveParticipants(session.id),
    listSessionEvents(session.id, { limit: 200 }),
    loadStreamerInfo(session.owner_user_id),
  ]);

  // Activity helpers also exclude left participants — but we want the
  // full final lineup including those who left voluntarily. Re-query
  // including-left-rows directly for the recap-specific list.
  const allParticipants = await loadAllParticipantsForRecap(session.id);

  const shuffleEvents = events
    .filter((e) => e.event_type === "shuffle")
    .reverse(); // chronological for the log

  const durationSeconds =
    session.activated_at && session.ended_at
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(session.ended_at) - Date.parse(session.activated_at)) /
              1000
          )
        )
      : null;

  const platformLabel = describePlatform(session.platforms);

  return (
    <Container>
      <div className="recap-page">
        <header className="recap-page__header">
          <p className="recap-page__eyebrow">GameShuffle • Recap</p>
          <h1 className="recap-page__title">{session.name}</h1>
          <p className="recap-page__subtitle">
            Streamed by{" "}
            <strong>
              {streamerInfo.displayName ?? streamerInfo.username ?? "a streamer"}
            </strong>
            {platformLabel ? <> on {platformLabel}</> : null}
            {session.ended_at ? (
              <>
                {" "}· {new Date(session.ended_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </>
            ) : null}
            {durationSeconds !== null ? <> · {formatDuration(durationSeconds)}</> : null}
          </p>
        </header>

        <section className="recap-page__section">
          <h2 className="recap-page__section-title">Final combos</h2>
          {allParticipants.length === 0 ? (
            <p className="recap-page__placeholder">No participants in this session.</p>
          ) : (
            <ul className="recap-page__participants">
              {allParticipants.map((p) => (
                <li key={p.id} className="recap-page__participant-row">
                  <span className="recap-page__participant-name">
                    {p.display_name ?? p.platform_user_id}
                    {p.is_broadcaster && (
                      <Badge variant="info" size="small">host</Badge>
                    )}
                  </span>
                  <span className="recap-page__participant-combo">
                    {formatComboParts(p.current_combo) || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="recap-page__section">
          <h2 className="recap-page__section-title">Shuffle log</h2>
          {shuffleEvents.length === 0 ? (
            <p className="recap-page__placeholder">No shuffles in this session.</p>
          ) : (
            <ul className="recap-page__shuffle-log">
              {shuffleEvents.map((event) => {
                const p = event.payload ?? {};
                const name =
                  (p.twitch_display_name as string) ??
                  (p.display_name as string) ??
                  "viewer";
                const combo = p.combo as
                  | { character?: { name: string }; vehicle?: { name: string }; wheels?: { name: string }; glider?: { name: string } }
                  | undefined;
                const parts = [
                  combo?.character?.name,
                  combo?.vehicle?.name,
                  combo?.wheels?.name,
                  combo?.glider?.name,
                ].filter((s): s is string => !!s && s !== "N/A");
                return (
                  <li key={event.id} className="recap-page__shuffle-entry">
                    <span className="recap-page__shuffle-time">
                      {new Date(event.created_at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="recap-page__shuffle-actor">{name}</span>
                    <span className="recap-page__shuffle-combo">
                      {parts.join(" · ") || "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="recap-page__footer">
          {streamerInfo.twitchLogin && (
            <p>
              Watch the stream:{" "}
              <a
                href={`https://www.twitch.tv/${streamerInfo.twitchLogin}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                twitch.tv/{streamerInfo.twitchLogin}
              </a>
            </p>
          )}
          <p className="recap-page__brand">
            Built by <Link href="/">GameShuffle</Link> · gameshuffle.co
          </p>
        </footer>
      </div>
    </Container>
  );
}

interface RecapSummary {
  shuffleCount: number;
  durationSeconds: number | null;
}

async function loadRecapSummary(sessionId: string): Promise<RecapSummary> {
  const admin = createServiceClient();
  const [{ data: session }, { count: shuffleCount }] = await Promise.all([
    admin
      .from("gs_sessions")
      .select("activated_at, ended_at")
      .eq("id", sessionId)
      .maybeSingle(),
    admin
      .from("session_events")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("event_type", "shuffle"),
  ]);
  const activated = (session?.activated_at as string | null) ?? null;
  const ended = (session?.ended_at as string | null) ?? null;
  const durationSeconds =
    activated && ended
      ? Math.max(
          0,
          Math.floor((Date.parse(ended) - Date.parse(activated)) / 1000)
        )
      : null;
  return { shuffleCount: shuffleCount ?? 0, durationSeconds };
}

interface StreamerInfo {
  username: string | null;
  displayName: string | null;
  twitchLogin: string | null;
}

async function loadStreamerInfo(ownerUserId: string): Promise<StreamerInfo> {
  const admin = createServiceClient();
  const [{ data: userRow }, { data: connection }] = await Promise.all([
    admin
      .from("users")
      .select("display_name, username")
      .eq("id", ownerUserId)
      .maybeSingle(),
    admin
      .from("twitch_connections")
      .select("twitch_login, twitch_display_name")
      .eq("user_id", ownerUserId)
      .maybeSingle(),
  ]);
  return {
    username: (userRow?.username as string | null) ?? null,
    displayName:
      (connection?.twitch_display_name as string | null) ??
      (userRow?.display_name as string | null) ??
      null,
    twitchLogin: (connection?.twitch_login as string | null) ?? null,
  };
}

async function loadAllParticipantsForRecap(
  sessionId: string
): Promise<ParticipantRow[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("session_participants")
    .select(
      "id, session_id, platform, platform_user_id, display_name, is_broadcaster, joined_at, left_at, current_combo"
    )
    .eq("session_id", sessionId)
    .order("is_broadcaster", { ascending: false })
    .order("joined_at", { ascending: true });
  return (data ?? []) as unknown as ParticipantRow[];
}

function describePlatform(
  platforms: { streaming?: { type?: string } | null } | null | undefined
): string | null {
  const t = platforms?.streaming?.type;
  if (t === "twitch") return "Twitch";
  if (t === "youtube") return "YouTube";
  if (t === "kick") return "Kick";
  return null;
}

function formatComboParts(
  combo: Record<string, unknown> | null | undefined
): string {
  if (!combo) return "";
  const c = combo as {
    character?: { name?: string };
    vehicle?: { name?: string };
    wheels?: { name?: string };
    glider?: { name?: string };
  };
  return [c.character?.name, c.vehicle?.name, c.wheels?.name, c.glider?.name]
    .filter((s): s is string => !!s && s !== "N/A")
    .join(" / ");
}
