"use client";

/**
 * Tournaments — the ones a player organizes + the ones they've joined.
 * Self-loading so it can live in the account "My Stuff" section page.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getGameName } from "@/data/game-registry";

interface TournamentEntry {
  id: string;
  title: string;
  game_slug: string;
  mode: string;
  status: string;
  date_time: string | null;
  role: "organizer" | "participant";
  participant_status?: string;
}

export function TournamentsTab() {
  const { user } = useAuth();
  const supabase = createClient();
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      const [organizedRes, participatingRes] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id, title, game_slug, mode, status, date_time")
          .eq("organizer_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("tournament_participants")
          .select(
            "tournament_id, status, tournaments(id, title, game_slug, mode, status, date_time)",
          )
          .eq("user_id", user.id)
          .order("joined_at", { ascending: false }),
      ]);
      if (!active) return;
      const entries: TournamentEntry[] = [];
      if (organizedRes.data)
        organizedRes.data.forEach((t: Record<string, unknown>) =>
          entries.push({ ...(t as unknown as TournamentEntry), role: "organizer" }),
        );
      if (participatingRes.data) {
        participatingRes.data.forEach((p: Record<string, unknown>) => {
          const t = p.tournaments as TournamentEntry | undefined;
          if (t && !entries.find((e) => e.id === t.id))
            entries.push({
              ...t,
              role: "participant",
              participant_status: p.status as string,
            });
        });
      }
      entries.sort((a, b) => {
        const order: Record<string, number> = {
          in_progress: 0,
          open: 1,
          draft: 2,
          complete: 3,
          cancelled: 4,
        };
        return (order[a.status] || 5) - (order[b.status] || 5);
      });
      setTournaments(entries);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [user, supabase]);

  const organizing = tournaments.filter((t) => t.role === "organizer");
  const participating = tournaments.filter((t) => t.role === "participant");

  if (loading) {
    return (
      <div className="account-card">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <>
      <div className="account-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--spacing-24)",
          }}
        >
          <h2>My Tournaments</h2>
          <Link href="/tournament/create"><Button variant="primary" size="small">Create Tournament</Button></Link>
        </div>
        {organizing.length === 0 ? (
          <p
            style={{
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-14)",
            }}
          >
            You haven&apos;t created any tournaments yet.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-8)",
            }}
          >
            {organizing.map((t) => (
              <div key={t.id} className="manage-participant-row">
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontWeight: "var(--font-weight-semibold)",
                      fontSize: "var(--font-size-14)",
                    }}
                  >
                    {t.title}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-size-12)",
                      color: "var(--primary-600)",
                      marginLeft: "var(--spacing-8)",
                    }}
                  >
                    {getGameName(t.game_slug)}
                  </span>
                  {t.date_time && (
                    <span
                      style={{
                        fontSize: "var(--font-size-12)",
                        color: "var(--text-tertiary)",
                        marginLeft: "var(--spacing-8)",
                      }}
                    >
                      {new Date(t.date_time).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-8)",
                  }}
                >
                  <span
                    className={`lounge-status lounge-status--${t.status}`}
                    style={{ fontSize: "var(--font-size-12)" }}
                  >
                    {t.status}
                  </span>
                  <Link href={`/tournament/${t.id}/manage`}><Button variant="secondary" size="small">Manage</Button></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="account-card">
        <h2 style={{ marginBottom: "var(--spacing-24)" }}>
          Tournaments I&apos;m In
        </h2>
        {participating.length === 0 ? (
          <p
            style={{
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-14)",
            }}
          >
            You haven&apos;t joined any tournaments yet.{" "}
            <Link
              href="/tournament"
              style={{
                color: "var(--primary-600)",
                fontWeight: "var(--font-weight-semibold)",
              }}
            >
              Browse tournaments
            </Link>
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-8)",
            }}
          >
            {participating.map((t) => (
              <div key={t.id} className="manage-participant-row">
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontWeight: "var(--font-weight-semibold)",
                      fontSize: "var(--font-size-14)",
                    }}
                  >
                    {t.title}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-size-12)",
                      color: "var(--primary-600)",
                      marginLeft: "var(--spacing-8)",
                    }}
                  >
                    {getGameName(t.game_slug)}
                  </span>
                  {t.date_time && (
                    <span
                      style={{
                        fontSize: "var(--font-size-12)",
                        color: "var(--text-tertiary)",
                        marginLeft: "var(--spacing-8)",
                      }}
                    >
                      {new Date(t.date_time).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-8)",
                  }}
                >
                  <span
                    className={`lounge-status lounge-status--${t.status}`}
                    style={{ fontSize: "var(--font-size-12)" }}
                  >
                    {t.status}
                  </span>
                  {t.participant_status && (
                    <span
                      style={{
                        fontSize: "var(--font-size-12)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {t.participant_status}
                    </span>
                  )}
                  <Link href={`/tournament/${t.id}`}><Button variant="secondary" size="small">View</Button></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
