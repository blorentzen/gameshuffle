"use client";

import { useEffect, useState } from "react";
import { Container, Button, Tabs } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getGameName } from "@/data/game-registry";
import { BetaBanner } from "@/components/BetaBanner";
import { isEmailVerified } from "@/lib/auth-utils";
import { useViewerTimezone } from "@/hooks/useViewerTimezone";
import { formatEventTime } from "@/lib/time/format";

interface TournamentListing {
  id: string;
  title: string;
  game_slug: string;
  mode: string;
  status: string;
  date_time: string | null;
  max_participants: number | null;
  created_at: string;
  organizer_id: string;
  users: { display_name: string } | null;
  participant_count: number;
}

export default function TournamentBrowsePage() {
  const { user } = useAuth();
  const viewerTz = useViewerTimezone();
  const [tournaments, setTournaments] = useState<TournamentListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");

  useEffect(() => {
    loadTournaments();
  }, [filter]);

  const loadTournaments = async () => {
    const supabase = createClient();
    let query = supabase
      .from("tournaments")
      .select("id, title, game_slug, mode, status, date_time, max_participants, created_at, organizer_id, users!tournaments_organizer_id_fkey(display_name), tournament_participants(count)")
      .order("date_time", { ascending: true, nullsFirst: false });

    if (filter === "open") {
      query = query.in("status", ["open"]);
    } else if (filter === "active") {
      query = query.in("status", ["open", "in_progress"]);
    } else if (filter === "past") {
      query = query.in("status", ["complete"]);
    }

    const { data } = await query;

    // Participant counts come back embedded (single query, no N+1) as
    // `tournament_participants: [{ count }]`.
    if (data) {
      const withCounts = (data as any[]).map((t) => ({
        ...t,
        participant_count: t.tournament_participants?.[0]?.count ?? 0,
      }));
      setTournaments(withCounts);
    }
    setLoading(false);
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <BetaBanner />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ fontSize: "2.4rem", fontWeight: 700 }}>Tournaments & Championships</h1>
            <p style={{ color: "var(--text-tertiary)", marginTop: "0.35rem", maxWidth: 560 }}>
              Run a one-off tournament — brackets, points, or the Heat → Mains ladder — or a championship series where points carry across events into a season table.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <a href="/tournament/sandbox">
              <Button variant="secondary">Try the demo</Button>
            </a>
            {user && isEmailVerified(user) && (
              <a href="/tournament/create">
                <Button variant="primary">Create Tournament</Button>
              </a>
            )}
          </div>
        </div>

        <div style={{ marginBottom: "2rem" }}>
          <Tabs
            variant="pills"
            size="medium"
            tabs={[
              { id: "open", label: "Open", content: <></> },
              { id: "active", label: "All Active", content: <></> },
              { id: "past", label: "Past", content: <></> },
            ]}
            activeTab={filter}
            onChange={(id) => setFilter(id)}
          />
        </div>

        {loading ? (
          <div className="comp-card"><p>Loading tournaments...</p></div>
        ) : tournaments.length === 0 ? (
          <div className="comp-card" style={{ textAlign: "center", padding: "3rem" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>No tournaments found</h2>
            <p style={{ color: "var(--text-tertiary)" }}>
              {filter === "open" ? "No open tournaments right now." : "No tournaments match this filter."}
            </p>
            {user && isEmailVerified(user) && (
              <a href="/tournament/create" style={{ marginTop: "1rem", display: "inline-block" }}>
                <Button variant="primary">Create one now</Button>
              </a>
            )}
          </div>
        ) : (
          <div className="tournament-grid">
            {tournaments.map((t) => (
              <a key={t.id} href={`/tournament/${t.id}`} className="tournament-browse-card">
                <div className="tournament-browse-card__header">
                  <span className={`lounge-status lounge-status--${t.status}`}>{t.status}</span>
                  <span className="tournament-browse-card__mode">{t.mode.toUpperCase()}</span>
                </div>
                <h3 className="tournament-browse-card__title">{t.title}</h3>
                <span className="tournament-browse-card__game">{getGameName(t.game_slug)}</span>
                <div className="tournament-browse-card__meta">
                  <span>{t.date_time ? formatEventTime(t.date_time, viewerTz) : "TBD"}</span>
                  <span>{t.participant_count}{t.max_participants ? `/${t.max_participants}` : ""} players</span>
                </div>
                <span className="tournament-browse-card__organizer">
                  by {(t.users as any)?.display_name || "Unknown"}
                </span>
              </a>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
