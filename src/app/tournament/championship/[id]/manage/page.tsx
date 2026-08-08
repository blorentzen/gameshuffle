"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Container, Button, Input } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { generateShareToken } from "@/lib/tournaments";
import { listMembers, createNextEvent, computeSeason, type Championship, type ChampionshipMember } from "@/lib/championships";
import { heatMainsChampion, heatMainsStage, type HeatMains } from "@/lib/tournaments/heatMains";
import { POINTS_PRESETS, resolvePointsConfig, type PointsPreset } from "@/lib/tournaments/championship";
import { SeasonTable } from "@/components/tournament/HeatMainsView";

interface EventRow {
  id: string;
  title: string;
  status: string;
  event_number: number | null;
  heat_mains: HeatMains | null;
  participants: { id: string; user_id: string | null }[];
}

export default function ChampionshipManagePage() {
  const params = useParams();
  const router = useRouter();
  const championshipId = params.id as string;
  const { user } = useAuth();
  const supabase = createClient();

  const [champ, setChamp] = useState<Championship | null>(null);
  const [members, setMembers] = useState<ChampionshipMember[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notOwner, setNotOwner] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; username: string | null; display_name: string }[]>([]);
  const [email, setEmail] = useState("");
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setEvents(
      (evs ?? []).map((e) => ({
        id: e.id as string,
        title: e.title as string,
        status: e.status as string,
        event_number: (e.event_number as number | null) ?? null,
        heat_mains: (e.heat_mains as HeatMains | null) ?? null,
        participants: ((e as { tournament_participants?: { id: string; user_id: string | null }[] }).tournament_participants ?? []),
      })),
    );
    setLoading(false);
  }, [championshipId, supabase]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (champ && user && champ.owner_id !== user.id) setNotOwner(true); }, [champ, user]);

  // Realtime — reload when an event's results change, or the roster shifts, so
  // the season table + event list stay live while an event is being run.
  useEffect(() => {
    const channel = supabase
      .channel(`championship-${championshipId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `championship_id=eq.${championshipId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_members", filter: `championship_id=eq.${championshipId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [championshipId, supabase, load]);

  const setPreset = async (preset: PointsPreset) => {
    if (!champ) return;
    const settings = { ...champ.settings, pointsPreset: preset };
    setChamp({ ...champ, settings });
    await supabase.from("championships").update({ settings }).eq("id", championshipId);
  };

  // Debounced platform-player search.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/championship/${championshipId}/search?q=${encodeURIComponent(query.trim())}`);
      const j = await res.json();
      setResults(j.results ?? []);
    }, 250);
  }, [query, championshipId]);

  const invitePlayer = async (u: { id: string }) => {
    await fetch(`/api/championship/${championshipId}/invite`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", userId: u.id }),
    });
    setQuery(""); setResults([]);
    setMembers(await listMembers(supabase, championshipId));
  };

  const inviteEmail = async () => {
    if (!email.includes("@")) return;
    const res = await fetch(`/api/championship/${championshipId}/invite`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email", email }),
    });
    const j = await res.json();
    setEmailNote(j.ok ? `Invite sent to ${email}.` : (j.error || "Failed to send invite."));
    setEmail("");
  };

  const removeMember = async (memberId: string) => {
    await supabase.from("championship_members").delete().eq("id", memberId);
    setMembers((m) => m.filter((x) => x.id !== memberId));
  };

  const startNextEvent = async () => {
    if (!champ) return;
    const tid = await createNextEvent(supabase, champ, members, generateShareToken());
    if (tid) router.push(`/tournament/${tid}/manage`);
  };

  if (loading) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Loading…</p></div></Container></main>;
  if (!champ) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><h2>Championship not found</h2></div></Container></main>;
  if (notOwner) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><h2>You don&apos;t manage this championship.</h2></div></Container></main>;

  const joined = members.filter((m) => m.status === "joined");
  const pending = members.filter((m) => m.status !== "joined");
  const nameOfUser = (uid: string | null) => members.find((m) => m.user_id === uid)?.display_name ?? "Player";
  const activePreset = (champ.settings?.pointsPreset as PointsPreset) ?? "tiered";
  const season = computeSeason(events, resolvePointsConfig(activePreset), champ.settings?.dropWorst ?? 0);
  const completedCount = events.filter((e) => e.heat_mains && heatMainsStage(e.heat_mains) === "complete").length;

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <span className="marketing-eyebrow">🏆 Championship series</span>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 700, margin: "0.35rem 0 0.5rem" }}>{champ.name}</h1>
          {champ.description && <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>{champ.description}</p>}

          {/* Roster */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>League roster</h2>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
              Accounts only — invite existing GameShuffle players, or email an invite so they create a free account and join. {joined.length} in the league{pending.length ? `, ${pending.length} pending` : ""}.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Invite a GameShuffle player</label>
                <Input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search @handle or name…" />
                {results.length > 0 && (
                  <div style={{ marginTop: "0.5rem", border: "1px solid var(--border-default)", borderRadius: "0.5rem", overflow: "hidden" }}>
                    {results.map((u) => (
                      <button key={u.id} type="button" onClick={() => invitePlayer(u)} style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", textAlign: "left", cursor: "pointer", padding: "0.45rem 0.6rem", border: "none", background: "transparent", color: "var(--text-primary)" }}>
                        <span style={{ flex: 1 }}><strong style={{ fontSize: "14px" }}>{u.display_name}</strong> {u.username && <span style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>@{u.username}</span>}</span>
                        <span style={{ color: "var(--bg-primary, var(--primary-500))", fontWeight: 700, fontSize: "12px" }}>Add →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Invite by email</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailNote(null); }} onKeyDown={(e) => { if (e.key === "Enter") inviteEmail(); }} placeholder="player@email.com" style={{ flex: 1 }} />
                  <Button variant="secondary" size="small" onClick={inviteEmail}>Send</Button>
                </div>
                {emailNote && <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>{emailNote}</p>}
              </div>
            </div>

            {members.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>No players yet — invite some above.</p>
            ) : (
              <div style={{ border: "1px solid var(--border-default)", borderRadius: "0.5rem", overflow: "hidden" }}>
                {members.map((m, i) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                      <strong style={{ fontSize: "14px" }}>{m.display_name}</strong>
                      {m.username && <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>@{m.username}</span>}
                      <span style={{ fontSize: "12px", fontWeight: 600, padding: "0.05rem 0.4rem", borderRadius: 999, color: m.status === "joined" ? "var(--success-700, #17a710)" : "var(--warning-700, #b26b00)", background: "var(--surface-default)", border: "1px solid var(--border-default)" }}>
                        {m.status === "joined" ? "In league" : "Invited"}
                      </span>
                    </span>
                    <Button variant="ghost" size="small" onClick={() => removeMember(m.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Events */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <div>
                <h2 style={{ fontSize: "var(--font-size-18)" }}>Events</h2>
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{events.length} event{events.length === 1 ? "" : "s"} · {completedCount} completed. Each event runs Heat → Mains and feeds the season table.</p>
              </div>
              <Button variant="primary" size="small" disabled={joined.length < 2} onClick={startNextEvent}>+ Start event {events.length + 1}</Button>
            </div>
            {joined.length < 2 && <p style={{ fontSize: "12px", color: "var(--warning-700)", marginBottom: "0.5rem" }}>Add at least 2 joined players to start an event.</p>}
            {events.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>No events yet — start the first one above.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {events.map((e) => {
                  const champId = e.heat_mains ? heatMainsChampion(e.heat_mains) : null;
                  const done = e.heat_mains && heatMainsStage(e.heat_mains) === "complete";
                  return (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.55rem 0.75rem", borderRadius: "0.5rem", border: "1px solid var(--border-default)" }}>
                      <span style={{ fontWeight: 700, fontSize: "14px", minWidth: 68 }}>Event {e.event_number}</span>
                      <span style={{ flex: 1, fontSize: "13px", color: "var(--text-tertiary)" }}>
                        {done ? <>🏆 {nameOfUser(champId)}</> : e.heat_mains ? "In progress" : "Not started"}
                      </span>
                      <Link href={`/tournament/${e.id}/manage`}><Button variant="secondary" size="small">Run</Button></Link>
                      <Link href={`/tournament/${e.id}`}><Button variant="ghost" size="small">View</Button></Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Season standings */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.5rem" }}>🏆 Season standings</h2>

            {/* Points curve — curated presets (keeps the format opinionated). */}
            <div style={{ marginBottom: "0.85rem" }}>
              <div className="account-card__label" style={{ marginBottom: "0.4rem" }}>Points curve</div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {(Object.keys(POINTS_PRESETS) as PointsPreset[]).map((key) => (
                  <button key={key} type="button" onClick={() => setPreset(key)}
                    title={POINTS_PRESETS[key].blurb}
                    style={{ textAlign: "left", cursor: "pointer", padding: "0.45rem 0.7rem", borderRadius: "0.5rem", maxWidth: 220,
                      border: `1.5px solid ${activePreset === key ? "var(--bg-primary, var(--primary-500))" : "var(--border-default)"}`,
                      background: activePreset === key ? "color-mix(in srgb, var(--primary-500) 10%, var(--surface-default))" : "var(--surface-default)" }}>
                    <div style={{ fontWeight: 700, fontSize: "13px" }}>{POINTS_PRESETS[key].label}{activePreset === key ? " ✓" : ""}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{POINTS_PRESETS[key].blurb}</div>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>Applies to the whole season; standings recompute instantly.</p>
            </div>

            {season.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>Standings appear once an event is completed. Run and finalize an event to score the season.</p>
            ) : (
              <SeasonTable rows={season} events={completedCount} nameOf={nameOfUser} />
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}
