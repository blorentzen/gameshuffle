"use client";

import { useEffect, useState } from "react";
import { Container, Button, Tabs } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getGameName } from "@/data/game-registry";
import { BetaBanner } from "@/components/BetaBanner";
import { isEmailVerified } from "@/lib/auth-utils";

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
      .select("id, title, game_slug, mode, status, date_time, max_participants, created_at, organizer_id, users!tournaments_organizer_id_fkey(display_name)")
      .order("date_time", { ascending: true, nullsFirst: false });

    if (filter === "open") {
      query = query.in("status", ["open"]);
    } else if (filter === "active") {
      query = query.in("status", ["open", "in_progress"]);
    } else if (filter === "past") {
      query = query.in("status", ["complete"]);
    }

    const { data } = await query;

    // Get participant counts
    if (data) {
      const withCounts = await Promise.all(
        data.map(async (t: any) => {
          const { count } = await supabase
            .from("tournament_participants")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", t.id);
          return { ...t, participant_count: count || 0 };
        })
      );
      setTournaments(withCounts);
    }
    setLoading(false);
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <BetaBanner />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 700 }}>Tournaments</h1>
          {user && isEmailVerified(user) && (
            <a href="/tournament/create">
              <Button variant="primary">Create Tournament</Button>
            </a>
          )}
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
            <p style={{ color: "#808080" }}>
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
                  <span>{t.date_time ? new Date(t.date_time).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "TBD"}</span>
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
