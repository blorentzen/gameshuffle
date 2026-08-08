"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Container, Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import { listMembers, computeSeason, type Championship, type ChampionshipMember } from "@/lib/championships";
import { heatMainsChampion, heatMainsStage, type HeatMains } from "@/lib/tournaments/heatMains";
import { resolvePointsConfig } from "@/lib/tournaments/championship";
import { SeasonTable } from "@/components/tournament/HeatMainsView";

interface EventRow {
  id: string; title: string; status: string; event_number: number | null;
  heat_mains: HeatMains | null; participants: { id: string; user_id: string | null }[];
}

export function ChampionshipPublicClient() {
  const championshipId = useParams().id as string;
  const supabase = createClient();
  const [champ, setChamp] = useState<Championship | null>(null);
  const [members, setMembers] = useState<ChampionshipMember[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: c } = await supabase.from("championships").select("*").eq("id", championshipId).single();
    if (!c) { setLoading(false); return; }
    setChamp(c as Championship);
    setMembers(await listMembers(supabase, championshipId));
    const { data: evs } = await supabase
      .from("tournaments")
      .select("id, title, status, event_number, heat_mains, tournament_participants(id, user_id)")
      .eq("championship_id", championshipId)
      .order("event_number", { ascending: true });
    setEvents((evs ?? []).map((e) => ({
      id: e.id as string, title: e.title as string, status: e.status as string,
      event_number: (e.event_number as number | null) ?? null,
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

  if (loading) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Loading…</p></div></Container></main>;
  if (!champ) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><h2>Championship not found</h2></div></Container></main>;

  const nameOfUser = (uid: string | null) => members.find((m) => m.user_id === uid)?.display_name ?? "Player";
  const season = computeSeason(events, resolvePointsConfig(champ.settings?.pointsPreset), champ.settings?.dropWorst ?? 0);
  const completedCount = events.filter((e) => e.heat_mains && heatMainsStage(e.heat_mains) === "complete").length;
  const joined = members.filter((m) => m.status === "joined");

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <span className="marketing-eyebrow">🏆 Championship series</span>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 700, margin: "0.35rem 0 0.5rem" }}>{champ.name}</h1>
          {champ.description && <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>{champ.description}</p>}

          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.5rem" }}>Season standings</h2>
            {season.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>No completed events yet — standings appear after the first event wraps.</p>
            ) : (
              <SeasonTable rows={season} events={completedCount} nameOf={nameOfUser} />
            )}
          </div>

          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.5rem" }}>Events</h2>
            {events.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>No events scheduled yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {events.map((e) => {
                  const done = e.heat_mains && heatMainsStage(e.heat_mains) === "complete";
                  return (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.55rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border-default)" }}>
                      <span style={{ fontWeight: 700, fontSize: "14px", minWidth: 68 }}>Event {e.event_number}</span>
                      <span style={{ flex: 1, fontSize: "13px", color: "var(--text-tertiary)" }}>{done ? <>🏆 {nameOfUser(e.heat_mains ? heatMainsChampion(e.heat_mains) : null)}</> : e.heat_mains ? "In progress" : "Not started"}</span>
                      <Link href={`/tournament/${e.id}`}><Button variant="ghost" size="small">View</Button></Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="comp-card">
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.5rem" }}>Roster ({joined.length})</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {joined.map((m) => (
                <span key={m.id} style={{ padding: "0.25rem 0.6rem", borderRadius: 999, border: "1px solid var(--border-default)", fontSize: "13px" }}>
                  {m.username ? <Link href={`/u/${m.username}`} style={{ color: "inherit" }}>{m.display_name}</Link> : m.display_name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
