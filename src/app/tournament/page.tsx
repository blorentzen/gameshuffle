"use client";

import { useEffect, useState } from "react";
import { Container, Button, Tabs } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getGameName } from "@/data/game-registry";
import { DEFAULT_TOURNAMENT_HERO } from "@/data/tournament";
import { BetaBanner } from "@/components/BetaBanner";
import { isEmailVerified } from "@/lib/auth-utils";
import { useViewerTimezone } from "@/hooks/useViewerTimezone";
import { formatEventTime } from "@/lib/time/format";
import { MYSTUFF_SECTIONS, sectionForTournamentStatus } from "@/lib/account/statusSections";

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
  users: { display_name: string | null; username: string | null } | null;
  participant_count: number;
  /** Resolved from public_user_identity so private organizers still attribute. */
  organizer_name?: string | null;
}

export default function TournamentBrowsePage() {
  const { user } = useAuth();
  const viewerTz = useViewerTimezone();
  const [tournaments, setTournaments] = useState<TournamentListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");

  useEffect(() => {
    loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadTournaments = async () => {
    const supabase = createClient();
    let query = supabase
      .from("tournaments")
      .select("id, title, game_slug, mode, status, date_time, max_participants, created_at, organizer_id, header_image_url, users!tournaments_organizer_id_fkey(display_name, username), tournament_participants(count)")
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

      // Resolve organizer names from the minimal-identity view so private
      // organizers (whose users row is RLS-hidden) still show a name. Best
      // effort — if the view isn't applied yet we fall back to the embed.
      const organizerIds = Array.from(new Set(withCounts.map((t) => t.organizer_id).filter(Boolean)));
      if (organizerIds.length) {
        const { data: ids } = await supabase
          .from("public_user_identity")
          .select("id, display_name, username")
          .in("id", organizerIds);
        if (ids) {
          const byId = new Map((ids as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u]));
          for (const t of withCounts) {
            const u = byId.get(t.organizer_id);
            t.organizer_name = u?.display_name || u?.username || null;
          }
        }
      }

      // Community-organized events: resolve the presenting community per id.
      // Guarded — if the community_id column isn't applied yet this query errors
      // and we silently fall back to individual attribution.
      const tids = withCounts.map((t) => t.id);
      if (tids.length) {
        const { data: comms } = await supabase
          .from("tournaments")
          .select("id, community_id, gs_communities:community_id(slug, display_name)")
          .in("id", tids)
          .not("community_id", "is", null);
        if (comms) {
          const byT = new Map<string, { slug: string; display_name: string | null }>();
          for (const r of comms as any[]) {
            const c = Array.isArray(r.gs_communities) ? r.gs_communities[0] : r.gs_communities;
            if (c) byT.set(r.id, c);
          }
          for (const t of withCounts) {
            const c = byT.get(t.id);
            if (c) t.organizer_name = c.display_name || c.slug;
          }
        }
      }
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
              Run a one-off tournament (brackets, points, or the Heat → Mains ladder) or a championship series where points carry across events into a season table.
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
          MYSTUFF_SECTIONS.map((section) => {
            const inSection = tournaments.filter((t) => sectionForTournamentStatus(t.status) === section.key);
            if (inSection.length === 0) return null;
            return (
              <div key={section.key} style={{ marginBottom: "2.5rem" }}>
                {/* Only label sections when the current filter spans more than one. */}
                {filter === "active" && <h2 className="tournament-browse-section">{section.label}</h2>}
                <div className="tournament-grid">
                  {inSection.map((t) => (
                    <a key={t.id} href={`/tournament/${t.id}`} className="tournament-browse-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={(t as { header_image_url?: string | null }).header_image_url || DEFAULT_TOURNAMENT_HERO}
                        alt=""
                        className="tournament-browse-card__hero"
                      />
                      <div className="tournament-browse-card__body">
                        <div className="tournament-browse-card__header">
                          <span className={`lounge-status lounge-status--${t.status}`}>{t.status.replace("_", " ")}</span>
                          <span className="tournament-browse-card__mode">{t.mode.toUpperCase()}</span>
                        </div>
                        <h3 className="tournament-browse-card__title">{t.title}</h3>
                        <span className="tournament-browse-card__game">{getGameName(t.game_slug)}</span>
                        <div className="tournament-browse-card__meta">
                          <span>{t.date_time ? formatEventTime(t.date_time, viewerTz) : "TBD"}</span>
                          <span>{t.participant_count}{t.max_participants ? `/${t.max_participants}` : ""} players</span>
                        </div>
                        <span className="tournament-browse-card__organizer">
                          by {t.organizer_name || (t.users as any)?.display_name || (t.users as any)?.username || "a GameShuffle organizer"}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </Container>
    </main>
  );
}
