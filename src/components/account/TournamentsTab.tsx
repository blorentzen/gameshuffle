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
import { nightVisual } from "@/data/board-game-night-visuals";
import { formatEventTime } from "@/lib/time/format";
import { MYSTUFF_SECTIONS, sectionForTournamentStatus } from "@/lib/account/statusSections";

/** Human-friendly tournament/participant status label (no raw snake_case). */
function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    open: "Open",
    in_progress: "In Progress",
    complete: "Complete",
    cancelled: "Cancelled",
    registered: "Registered",
    confirmed: "Confirmed",
    dropped: "Dropped",
  };
  return map[s] ?? s.replace(/_/g, " ");
}

interface TournamentEntry {
  id: string;
  title: string;
  game_slug: string;
  mode: string;
  status: string;
  date_time: string | null;
  header_image_url?: string | null;
  role: "organizer" | "participant";
  participant_status?: string;
}

/** One card, Game-Nights treatment — hero cover (or a branded gradient) + title
 *  + game/date, a role tag (Organizing / Playing), and RSVP status. */
function TournamentCard({ t }: { t: TournamentEntry }) {
  const v = nightVisual(t.id);
  const organizer = t.role === "organizer";
  const href = organizer ? `/tournament/${t.id}/manage` : `/tournament/${t.id}`;
  const emoji = t.status === "complete" ? "🏆" : "🏁";
  return (
    <Link href={href} className="bgn-card">
      <span className={`bgn-card__hero${t.header_image_url ? " bgn-card__hero--img" : ""}`} style={t.header_image_url ? undefined : { background: v.gradient }}>
        {t.header_image_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={t.header_image_url} alt="" className="bgn-card__hero-photo" />
          : <span className="bgn-card__hero-emoji" aria-hidden>{emoji}</span>}
        <span className="bgn-card__hero-count">{organizer ? "Manage →" : "View →"}</span>
      </span>
      <span className="bgn-card__body">
        <span className="bgn-card__when">
          {getGameName(t.game_slug)}
          {t.date_time ? ` · ${formatEventTime(t.date_time)}` : ""}
        </span>
        <span className="bgn-card__title">{t.title}</span>
        <span className="mystuff-card__tags">
          <span className={`mystuff-role mystuff-role--${organizer ? "host" : "attend"}`}>{organizer ? "Organizing" : "Playing"}</span>
          {!organizer && t.participant_status && (
            <span className="mystuff-card__place">{statusLabel(t.participant_status)}</span>
          )}
        </span>
      </span>
    </Link>
  );
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
          .select("id, title, game_slug, mode, status, date_time, header_image_url")
          .eq("organizer_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("tournament_participants")
          .select(
            "tournament_id, status, tournaments(id, title, game_slug, mode, status, date_time, header_image_url)",
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

  if (loading) {
    return (
      <div className="account-card">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="account-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--spacing-16)",
          flexWrap: "wrap",
          marginBottom: "var(--spacing-20)",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Tournaments</h2>
          <p style={{ color: "var(--text-tertiary)", margin: "var(--spacing-4) 0 0", fontSize: "var(--font-size-14)" }}>
            The ones you organize and the ones you&rsquo;re in, grouped by where they are in their run.
          </p>
        </div>
        <Link href="/tournament/create" style={{ textDecoration: "none" }}><Button variant="primary">Create Tournament</Button></Link>
      </div>

      {tournaments.length === 0 ? (
        <div className="bgn-empty">
          <p>You haven&rsquo;t created or joined a tournament yet.</p>
          <Link href="/tournament" style={{ textDecoration: "none" }}>
            <Button variant="secondary">Browse tournaments</Button>
          </Link>
        </div>
      ) : (
        MYSTUFF_SECTIONS.map((section) => {
          const inSection = tournaments.filter((t) => sectionForTournamentStatus(t.status) === section.key);
          if (inSection.length === 0) return null;
          return (
            <div key={section.key} style={{ marginBottom: "var(--spacing-32)" }}>
              <h3 className="bgn-side__heading" style={{ marginTop: 0 }}>{section.label}</h3>
              <div className="bgn-grid">
                {inSection.map((t) => <TournamentCard key={t.id} t={t} />)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
