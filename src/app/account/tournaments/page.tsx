"use client";

import { useEffect, useState } from "react";
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

export default function AccountTournamentsPage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadTournaments();
  }, [user]);

  const loadTournaments = async () => {
    if (!user) return;
    const supabase = createClient();

    // Tournaments I organize
    const { data: organized } = await supabase
      .from("tournaments")
      .select("id, title, game_slug, mode, status, date_time")
      .eq("organizer_id", user.id)
      .order("created_at", { ascending: false });

    // Tournaments I'm participating in
    const { data: participating } = await supabase
      .from("tournament_participants")
      .select("tournament_id, status, tournaments(id, title, game_slug, mode, status, date_time)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false });

    const entries: TournamentEntry[] = [];

    if (organized) {
      organized.forEach((t) => {
        entries.push({ ...t, role: "organizer" });
      });
    }

    if (participating) {
      participating.forEach((p: any) => {
        const t = p.tournaments;
        if (t && !entries.find((e) => e.id === t.id)) {
          entries.push({ ...t, role: "participant", participant_status: p.status });
        }
      });
    }

    // Sort: active first, then upcoming, then past
    entries.sort((a, b) => {
      const order: Record<string, number> = { in_progress: 0, open: 1, draft: 2, complete: 3, cancelled: 4 };
      return (order[a.status] || 5) - (order[b.status] || 5);
    });

    setTournaments(entries);
    setLoading(false);
  };

  if (loading) return <div className="account-card"><p>Loading...</p></div>;

  const organizing = tournaments.filter((t) => t.role === "organizer");
  const participating = tournaments.filter((t) => t.role === "participant");

  return (
    <>
      <div className="account-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2>My Tournaments</h2>
          <a href="/tournament/create"><Button variant="primary" size="small">Create Tournament</Button></a>
        </div>

        {organizing.length === 0 ? (
          <p style={{ color: "#808080", fontSize: "14px" }}>You haven&apos;t created any tournaments yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {organizing.map((t) => (
              <div key={t.id} className="manage-participant-row">
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{t.title}</span>
                  <span style={{ fontSize: "12px", color: "#0E75C1", marginLeft: "0.5rem" }}>{getGameName(t.game_slug)}</span>
                  {t.date_time && <span style={{ fontSize: "12px", color: "#808080", marginLeft: "0.5rem" }}>{new Date(t.date_time).toLocaleDateString()}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className={`lounge-status lounge-status--${t.status}`} style={{ fontSize: "10px" }}>{t.status}</span>
                  <a href={`/tournament/${t.id}/manage`}><Button variant="secondary" size="small">Manage</Button></a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="account-card">
        <h2 style={{ marginBottom: "1.5rem" }}>Tournaments I&apos;m In</h2>

        {participating.length === 0 ? (
          <p style={{ color: "#808080", fontSize: "14px" }}>
            You haven&apos;t joined any tournaments yet. <a href="/tournament" style={{ color: "#0E75C1", fontWeight: 600 }}>Browse tournaments</a>
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {participating.map((t) => (
              <div key={t.id} className="manage-participant-row">
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{t.title}</span>
                  <span style={{ fontSize: "12px", color: "#0E75C1", marginLeft: "0.5rem" }}>{getGameName(t.game_slug)}</span>
                  {t.date_time && <span style={{ fontSize: "12px", color: "#808080", marginLeft: "0.5rem" }}>{new Date(t.date_time).toLocaleDateString()}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className={`lounge-status lounge-status--${t.status}`} style={{ fontSize: "10px" }}>{t.status}</span>
                  {t.participant_status && <span style={{ fontSize: "10px", color: "#808080" }}>{t.participant_status}</span>}
                  <a href={`/tournament/${t.id}`}><Button variant="secondary" size="small">View</Button></a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
