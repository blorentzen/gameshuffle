"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconTrophy } from "@tabler/icons-react";
import { EventShell } from "@/components/events/EventShell";
import { createClient } from "@/lib/supabase/client";
import { listMembers, computeSeason, type Championship, type ChampionshipMember } from "@/lib/championships";
import { heatMainsChampion, heatMainsStage, type HeatMains } from "@/lib/tournaments/heatMains";
import { resolvePointsConfig } from "@/lib/tournaments/championship";
import { SeasonTable } from "@/components/tournament/HeatMainsView";

interface EventRow {
  id: string; title: string; status: string; event_number: number | null;
  dateTime: string | null;
  heat_mains: HeatMains | null; participants: { id: string; user_id: string | null }[];
}

export function ChampionshipPublicClient() {
  const championshipId = useParams().id as string;
  const supabase = createClient();
  const [champ, setChamp] = useState<Championship | null>(null);
  const [members, setMembers] = useState<ChampionshipMember[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  // OrganizerCard fetches follow state but not the name, so an unresolved
  // owner renders as "a GameShuffle member". Fetch it with the rest.
  const [owner, setOwner] = useState<{ username: string | null; displayName: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: c } = await supabase.from("championships").select("*").eq("id", championshipId).single();
    if (!c) { setLoading(false); return; }
    setChamp(c as Championship);
    setMembers(await listMembers(supabase, championshipId));
    const { data: o } = await supabase
      .from("users").select("username, display_name").eq("id", (c as Championship).owner_id).maybeSingle();
    if (o) setOwner({ username: (o.username as string | null) ?? null, displayName: (o.display_name as string | null) ?? "" });
    const { data: evs } = await supabase
      .from("tournaments")
      .select("id, title, status, event_number, date_time, heat_mains, tournament_participants(id, user_id)")
      .eq("championship_id", championshipId)
      .order("event_number", { ascending: true });
    setEvents((evs ?? []).map((e) => ({
      id: e.id as string, title: e.title as string, status: e.status as string,
      event_number: (e.event_number as number | null) ?? null,
      dateTime: (e.date_time as string | null) ?? null,
      heat_mains: (e.heat_mains as HeatMains | null) ?? null,
      participants: ((e as { tournament_participants?: { id: string; user_id: string | null }[] }).tournament_participants ?? []),
    })));
    setLoading(false);
  }, [championshipId, supabase]);

  useEffect(() => { void load(); }, [load]);

  // Live season — reload when any event in this championship changes.
  useEffect(() => {
    const channel = supabase
      .channel(`championship-public-${championshipId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `championship_id=eq.${championshipId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_members", filter: `championship_id=eq.${championshipId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [championshipId, supabase, load]);

  if (loading) {
    return <main className="event-shell"><div className="comp-card" style={{ margin: "3rem auto", maxWidth: 820 }}><p>Loading\u2026</p></div></main>;
  }
  if (!champ) {
    return <main className="event-shell"><div className="comp-card" style={{ margin: "3rem auto", maxWidth: 820 }}><h2>Championship not found</h2></div></main>;
  }

  const nameOfUser = (uid: string | null) => members.find((m) => m.user_id === uid)?.display_name ?? "Player";
  const season = computeSeason(events, resolvePointsConfig(champ.settings?.pointsPreset), champ.settings?.dropWorst ?? 0);
  const completedCount = events.filter((e) => e.heat_mains && heatMainsStage(e.heat_mains) === "complete").length;
  const joined = members.filter((m) => m.status === "joined");

  // A season spans many dates; the honest summary is the range it covers, not
  // any single one of them.
  const dated = events.map((e) => e.dateTime).filter((d): d is string => !!d).sort();
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const seasonSpan = dated.length === 0
    ? null
    : dated.length === 1
      ? fmt(dated[0])
      : `${fmt(dated[0])} \u2013 ${fmt(dated[dated.length - 1])}`;

  return (
    <EventShell
      type="tournament"
      // Puts the season on the crown-and-medals art rather than a single
      // event's trophy.
      artKind="series"
      id={champ.id}
      title={champ.name}
      summary={champ.description}
      hero={{ imageUrl: null, fallbackImageUrl: null }}
      breadcrumb={[
        { label: "Tournaments", href: "/tournament" },
        { label: champ.name },
      ]}
      badges={
        <>
          <span className={`lounge-status lounge-status--${champ.status === "complete" ? "complete" : "open"}`}>
            {champ.status === "complete" ? "Season complete" : "Season running"}
          </span>
          <span className="bg-badge bg-badge--kind">Championship series</span>
        </>
      }
      organizer={{
        userId: champ.owner_id,
        username: owner?.username ?? null,
        displayName: owner?.displayName ?? "",
      }}
      organizerRoleLabel="Run by"
      pageUrl={typeof window !== "undefined" ? window.location.href : ""}
      // No `when` or `where`: a season has neither a single date nor a venue,
      // and the shell now renders only the facts an event actually has.
      goodToKnow={[
        { label: "Events", value: String(events.length) },
        { label: "Completed", value: String(completedCount) },
        { label: "Racers", value: String(joined.length) },
        ...(seasonSpan ? [{ label: "Season", value: seasonSpan }] : []),
      ]}
      // No `action`: a visitor has no decision to make about a season. The
      // card that used to sit here restated the event counts already in Good to
      // know and linked to an unrelated page, which is filling a rail rather
      // than using one. Without it the body takes the full width.
      slots={[
        {
          id: "standings",
          label: "Standings",
          badge: season.length || undefined,
          content: (
            <div className="comp-card">
              <h2 className="bgn-event-h2">Season standings</h2>
              {season.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>No completed events yet. Standings appear after the first event wraps.</p>
              ) : (
                <SeasonTable rows={season} events={completedCount} nameOf={nameOfUser} />
              )}
            </div>
          ),
        },
        {
          id: "events",
          label: "Events",
          badge: events.length || undefined,
          content: (
            <div className="comp-card">
              <h2 className="bgn-event-h2">Events</h2>
              {events.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>No events scheduled yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {events.map((e) => {
                    const done = e.heat_mains && heatMainsStage(e.heat_mains) === "complete";
                    return (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.55rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border-default)" }}>
                        <span style={{ fontWeight: 700, fontSize: "var(--font-size-14)", minWidth: 68 }}>Event {e.event_number}</span>
                        <span style={{ flex: 1, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                          {done ? (
                            <><IconTrophy size={13} stroke={1.9} style={{ verticalAlign: "-0.15em", marginRight: "0.3em" }} />{nameOfUser(e.heat_mains ? heatMainsChampion(e.heat_mains) : null)}</>
                          ) : e.heat_mains ? "In progress" : "Not started"}
                        </span>
                        <Link href={`/tournament/${e.id}`}><Button variant="ghost" size="small">View</Button></Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ),
        },
        {
          id: "roster",
          label: "Roster",
          badge: joined.length || undefined,
          content: (
            <div className="comp-card">
              <h2 className="bgn-event-h2">Roster</h2>
              {joined.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>Nobody on the roster yet.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {joined.map((m) => (
                    <span key={m.id} style={{ padding: "0.25rem 0.6rem", borderRadius: 999, border: "1px solid var(--border-default)", fontSize: "var(--font-size-12)" }}>
                      {m.username ? <Link href={`/u/${m.username}`} style={{ color: "inherit" }}>{m.display_name}</Link> : m.display_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
