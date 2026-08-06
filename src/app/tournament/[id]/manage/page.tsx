"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Container, Button, Input, Accordion, Switch, Select } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getImagePath } from "@/lib/images";
import { getTournamentGameData } from "@/lib/tournaments/gameData";
import { SortableTrackList } from "@/components/tournament/SortableTrackList";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { InviteButton } from "@/components/social/InviteButton";

type TrackMode = "guided" | "ffa" | "randomized" | "limited";

interface Tournament {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  game_slug: string;
  mode: string;
  status: string;
  acceptance_mode: string;
  date_time: string | null;
  max_participants: number | null;
  room_code: string | null;
  community_link: string | null;
  community_name: string | null;
  friend_codes: { name: string; code: string }[];
  rules: string | null;
  settings: Record<string, any>;
}

interface Participant {
  id: string;
  user_id: string | null;
  display_name: string;
  team: number | null;
  friend_code: string | null;
  discord_username: string | null;
  status: string;
  users?: { email_verified: boolean } | null;
}

const STATUS_FLOW = ["draft", "open", "in_progress", "complete"];
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Open for Registration",
  in_progress: "In Progress",
  complete: "Complete",
  cancelled: "Cancelled",
};

export default function ManageTournamentPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.id as string;
  const { user } = useAuth();
  const supabase = createClient();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [localRoomCode, setLocalRoomCode] = useState("");
  const [results, setResults] = useState<Record<string, { placement: number | null; points: number | null }>>({});
  const [guestName, setGuestName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const roomCodeTimer = useRef<NodeJS.Timeout>(undefined);
  const savedTimer = useRef<NodeJS.Timeout>(undefined);
  const flashSaved = () => {
    setSavedFlash(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1500);
  };

  const loadData = useCallback(async () => {
    const [tRes, pRes, rRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
      supabase.from("tournament_participants").select("*, users(email_verified)").eq("tournament_id", tournamentId).order("joined_at"),
      supabase.from("tournament_results").select("participant_id, placement, points").eq("tournament_id", tournamentId),
    ]);
    if (tRes.data) {
      setTournament(tRes.data as Tournament);
      setLocalRoomCode(tRes.data.room_code || "");
    }
    if (pRes.data) setParticipants(pRes.data as Participant[]);
    if (rRes.data) {
      const map: Record<string, { placement: number | null; points: number | null }> = {};
      for (const r of rRes.data as { participant_id: string; placement: number | null; points: number | null }[]) {
        map[r.participant_id] = { placement: r.placement, points: r.points };
      }
      setResults(map);
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel(`manage-tournament-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter: `tournament_id=eq.${tournamentId}` },
        () => { supabase.from("tournament_participants").select("*, users(email_verified)").eq("tournament_id", tournamentId).order("joined_at").then(({ data }) => { if (data) setParticipants(data as Participant[]); }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, loadData]);

  if (loading) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Loading...</p></div></Container></main>;
  if (!tournament || tournament.organizer_id !== user?.id) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Not authorized.</p></div></Container></main>;

  // Per-game data (tracks, characters, items, build filters) so the config
  // surface works for both MK8DX and Mario Kart World.
  const gd = getTournamentGameData(tournament.game_slug);

  const updateTournament = async (updates: Partial<Tournament>) => {
    await supabase.from("tournaments").update(updates).eq("id", tournamentId);
    setTournament((prev) => prev ? { ...prev, ...updates } as Tournament : prev);
    flashSaved();
  };

  const updateParticipant = async (participantId: string, updates: Partial<Participant>) => {
    await supabase.from("tournament_participants").update(updates).eq("id", participantId);
    setParticipants((prev) => prev.map((p) => p.id === participantId ? { ...p, ...updates } as Participant : p));
  };

  const removeParticipant = async (participantId: string) => {
    await supabase.from("tournament_participants").delete().eq("id", participantId);
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
  };

  // Guest entrant — organizer adds a player who has no GS account (user_id
  // null; schema + organizer RLS allow it). Pre-confirmed since the organizer
  // is vouching for them.
  const addGuest = async () => {
    const name = guestName.trim();
    if (!name) return;
    const { data } = await supabase
      .from("tournament_participants")
      .insert({ tournament_id: tournamentId, user_id: null, display_name: name, status: "confirmed" })
      .select("*, users(email_verified)")
      .single();
    if (data) setParticipants((prev) => [...prev, data as Participant]);
    setGuestName("");
  };

  // Final results (wires tournament_results). Upsert per participant; shows as
  // standings on the public page.
  const upsertResult = async (
    participantId: string,
    patch: { placement?: number | null; points?: number | null },
  ) => {
    const merged = { ...(results[participantId] ?? { placement: null, points: null }), ...patch };
    setResults((prev) => ({ ...prev, [participantId]: merged }));
    await supabase.from("tournament_results").upsert(
      {
        tournament_id: tournamentId,
        participant_id: participantId,
        placement: merged.placement,
        points: merged.points,
        team: participants.find((p) => p.id === participantId)?.team ?? null,
      },
      { onConflict: "tournament_id,participant_id" },
    );
  };

  // Convenience: rank everyone 1..N by their entered points (desc). Players
  // with no points fall to the bottom keeping their current order.
  const autoPlaceByPoints = async () => {
    const ranked = [...participants]
      .filter((p) => p.status !== "dropped")
      .sort((a, b) => (results[b.id]?.points ?? -1) - (results[a.id]?.points ?? -1));
    for (let i = 0; i < ranked.length; i++) {
      await upsertResult(ranked[i].id, { placement: i + 1 });
    }
  };

  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(tournament.status) + 1];
  const pendingCount = participants.filter((p) => p.status === "registered").length;
  const confirmedCount = participants.filter((p) => p.status === "confirmed" || p.status === "checked_in").length;
  const checkedInCount = participants.filter((p) => p.status === "checked_in").length;

  const TEAM_HEX = ["#0E75C1", "#C11A10", "#17A710", "#F59E0B", "#8B5CF6", "#EC4899"];

  // Team assignment (team modes only). `mode` like "2v2" → team size 2.
  const isTeamMode = tournament.mode !== "ffa";
  const teamSize = isTeamMode ? parseInt(tournament.mode, 10) || 2 : 0;
  const activeCount = participants.filter((p) => p.status !== "dropped").length;
  const maxTeams = isTeamMode ? Math.max(2, Math.ceil(activeCount / (teamSize || 1))) : 0;

  const autoBalanceTeams = async () => {
    const active = participants.filter((p) => p.status === "confirmed" || p.status === "checked_in");
    for (let i = 0; i < active.length; i++) {
      await updateParticipant(active[i].id, { team: Math.floor(i / (teamSize || 1)) + 1 });
    }
  };

  return (
    <main style={{ paddingTop: "2rem", paddingBottom: "5rem" }}>
      <Container>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
            <div>
              <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Manage: {tournament.title}</h1>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span className={`lounge-status lounge-status--${tournament.status}`}>{STATUS_LABELS[tournament.status]}</span>
                <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{confirmedCount} confirmed · {pendingCount} pending</span>
                <span style={{ fontSize: "12px", color: savedFlash ? "var(--success-700, #17A710)" : "var(--text-tertiary)", transition: "color 0.2s" }}>
                  {savedFlash ? "✓ Saved" : "· Auto-saves"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <a href={`/tournament/${tournamentId}`}><Button variant="ghost" size="small">Preview</Button></a>
              <Button
                variant="ghost"
                size="small"
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/tournament/${tournamentId}`)}
              >
                Copy Link
              </Button>
              <InviteButton
                kind="tournament"
                targetId={tournamentId}
                targetName={tournament.title}
                link={`/tournament/${tournamentId}`}
              />
            </div>
          </div>

          {/* Status Controls */}
          <div className="comp-card" style={{ marginBottom: "1.5rem", padding: "1rem 1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <span style={{ fontSize: "14px", fontWeight: 600 }}>Status: {STATUS_LABELS[tournament.status]}</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {nextStatus && (
                  <Button variant="primary" size="small" onClick={() => updateTournament({ status: nextStatus })}>
                    Move to {STATUS_LABELS[nextStatus]}
                  </Button>
                )}
                {tournament.status !== "cancelled" && tournament.status !== "complete" && (
                  <Button variant="danger" size="small" onClick={() => updateTournament({ status: "cancelled" })}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Registration Settings */}
          <div className="comp-card" style={{ marginBottom: "1.5rem", padding: "1rem 1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>Require Verified Email</span>
                <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "0.15rem" }}>Only users with a verified email can join</p>
              </div>
              <Switch
                checked={!!tournament.settings?.requireVerified}
                onChange={() => updateTournament({ settings: { ...tournament.settings, requireVerified: !tournament.settings?.requireVerified } })}
              />
            </div>
          </div>

          {/* Room Code */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Room Code</h2>
            <Input
              type="text"
              placeholder="Enter room code when ready"
              value={localRoomCode}
              onChange={(e) => {
                setLocalRoomCode(e.target.value);
                if (roomCodeTimer.current) clearTimeout(roomCodeTimer.current);
                roomCodeTimer.current = setTimeout(() => updateTournament({ room_code: e.target.value }), 3000);
              }}
              onBlur={() => { if (roomCodeTimer.current) clearTimeout(roomCodeTimer.current); updateTournament({ room_code: localRoomCode }); }}
              style={{ maxWidth: "250px", textAlign: "center", fontWeight: 700, fontSize: "18px", letterSpacing: "0.1em" }}
            />
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>Only visible to confirmed participants.</p>
          </div>

          {/* Race Settings */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1.5rem" }}>Race Settings</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "1rem" }}>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Races</label>
                <Select
                  value={String(tournament.settings?.raceCount || 12)}
                  onChange={(v) => updateTournament({ settings: { ...tournament.settings, raceCount: Number(v) } })}
                  options={gd.raceCounts.map((n) => ({ value: String(n), label: String(n) }))}
                />
              </div>
              {gd.hasCc && (
                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>CC</label>
                  <Select
                    value={tournament.settings?.cc || "150cc"}
                    onChange={(v) => updateTournament({ settings: { ...tournament.settings, cc: v } })}
                    options={["50cc", "100cc", "150cc", "200cc", "Mirror"].map((cc) => ({ value: cc, label: cc }))}
                  />
                </div>
              )}
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Items</label>
                <Select
                  value={tournament.settings?.items || "normal"}
                  onChange={(v) => updateTournament({ settings: { ...tournament.settings, items: v } })}
                  options={["all", "normal", "shells", "bananas", "mushrooms", "bob-ombs", "none", "custom"].map((i) => ({ value: i, label: i }))}
                />
              </div>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>CPU</label>
                <Select
                  value={tournament.settings?.cpu || "hard"}
                  onChange={(v) => updateTournament({ settings: { ...tournament.settings, cpu: v } })}
                  options={["easy", "normal", "hard", "no cpu"].map((c) => ({ value: c, label: c }))}
                />
              </div>
            </div>

            {/* Custom Item Selection */}
            {tournament.settings?.items === "custom" && (
              <div style={{ marginTop: "1.5rem" }}>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.75rem" }}>Select Active Items</label>
                <div className="item-grid" style={{ margin: 0 }}>
                  {gd.items.map((item: any) => {
                    const activeItems: string[] = tournament.settings?.customItems || [];
                    const isActive = activeItems.includes(item.name);
                    return (
                      <button
                        key={item.name}
                        className={`item-card ${isActive ? "item-card--active" : ""}`}
                        onClick={() => {
                          const updated = isActive
                            ? activeItems.filter((n: string) => n !== item.name)
                            : [...activeItems, item.name];
                          updateTournament({ settings: { ...tournament.settings, customItems: updated } });
                        }}
                      >
                        <img src={getImagePath(item.img)} alt={item.name} className="item-card__img" />
                        <span className="item-card__name">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                  <Button variant="ghost" size="small" onClick={() => {
                    updateTournament({ settings: { ...tournament.settings, customItems: gd.items.map((i: any) => i.name) } });
                  }}>Select All</Button>
                  <Button variant="ghost" size="small" onClick={() => {
                    updateTournament({ settings: { ...tournament.settings, customItems: [] } });
                  }}>Clear All</Button>
                </div>
              </div>
            )}
          </div>

          {/* Track Selection */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Tracks</h2>

            {/* Mode selector */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {([
                { value: "guided", label: "Guided", desc: "Set specific order" },
                { value: "ffa", label: "Free For All", desc: "Decided day of" },
                { value: "randomized", label: "Randomized", desc: "Random order" },
                { value: "limited", label: "Limited", desc: "Pick pool, open order" },
              ] as { value: TrackMode; label: string; desc: string }[]).map((m) => (
                <button
                  key={m.value}
                  className={`comp-mode-btn ${(tournament.settings?.trackMode || "ffa") === m.value ? "comp-mode-btn--active" : ""}`}
                  onClick={() => updateTournament({ settings: { ...tournament.settings, trackMode: m.value, tracks: [] } })}
                >
                  <span className="comp-mode-btn__label">{m.label}</span>
                  <span className="comp-mode-btn__desc">{m.desc}</span>
                </button>
              ))}
            </div>

            {/* No Duplicates toggle (for guided mode) */}
            {(tournament.settings?.trackMode === "guided" || tournament.settings?.trackMode === "limited") && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                <Button
                  variant={tournament.settings?.noDuplicateTracks ? "primary" : "secondary"}
                  size="small"
                  onClick={() => updateTournament({ settings: { ...tournament.settings, noDuplicateTracks: !tournament.settings?.noDuplicateTracks } })}
                >
                  No Duplicates
                </Button>
                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                  {tournament.settings?.noDuplicateTracks ? "Tracks can only be selected once" : "Tracks can be repeated"}
                </span>
              </div>
            )}

            {/* FFA mode */}
            {(tournament.settings?.trackMode === "ffa" || !tournament.settings?.trackMode) && (
              <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>Tracks will be decided on tournament day. No pre-selection needed.</p>
            )}

            {/* Randomized mode */}
            {tournament.settings?.trackMode === "randomized" && (
              <div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
                  <Button variant="primary" size="small" onClick={() => {
                    const count = tournament.settings?.raceCount || 12;
                    const shuffled = [...gd.coursesWithIds].sort(() => Math.random() - 0.5).slice(0, count).map((c) => ({ id: c.id, name: c.name, img: c.img }));
                    updateTournament({ settings: { ...tournament.settings, tracks: shuffled } });
                  }}>Randomize {tournament.settings?.raceCount || 12} Tracks</Button>
                  {tournament.settings?.tracks?.length > 0 && (
                    <Button variant="ghost" size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, tracks: [] } })}>Clear</Button>
                  )}
                </div>
                {tournament.settings?.tracks?.length > 0 && (
                  <SortableTrackList
                    tracks={tournament.settings.tracks}
                    showNumbers={true}
                    onReorder={(tracks) => updateTournament({ settings: { ...tournament.settings, tracks } })}
                    onRemove={(i) => {
                      const updated = [...tournament.settings.tracks];
                      updated.splice(i, 1);
                      updateTournament({ settings: { ...tournament.settings, tracks: updated } });
                    }}
                  />
                )}
              </div>
            )}

            {/* Guided + Limited modes — CDS Accordion cup browser */}
            {(tournament.settings?.trackMode === "guided" || tournament.settings?.trackMode === "limited") && (() => {
              const isGuided = tournament.settings?.trackMode === "guided";
              const noDups = !!tournament.settings?.noDuplicateTracks;
              const selectedTracks: any[] = tournament.settings?.tracks || [];

              const raceCount = tournament.settings?.raceCount || 12;
              const atLimit = isGuided && selectedTracks.length >= raceCount;

              const addTrack = (courseId: string, course: any) => {
                if (atLimit) return;
                if (noDups && selectedTracks.some((t: any) => t.id === courseId)) return;
                updateTournament({ settings: { ...tournament.settings, tracks: [...selectedTracks, { id: courseId, name: course.name, img: course.img }] } });
              };

              const toggleTrack = (courseId: string, course: any) => {
                const exists = selectedTracks.some((t: any) => t.id === courseId);
                const updated = exists
                  ? selectedTracks.filter((t: any) => t.id !== courseId)
                  : [...selectedTracks, { id: courseId, name: course.name, img: course.img }];
                updateTournament({ settings: { ...tournament.settings, tracks: updated } });
              };

              return (
                <div>
                  <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
                    {isGuided ? "Expand a cup and click tracks to add them in order." : "Expand cups and select tracks for the pool."}
                  </p>

                  {/* Selected tracks display */}
                  {selectedTracks.length > 0 && (
                    <div style={{ marginBottom: "1.5rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <span className="account-card__label">
                          {isGuided ? `Selected Order (${selectedTracks.length}/${raceCount})` : `Track Pool (${selectedTracks.length})`}
                        </span>
                        <Button variant="ghost" size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, tracks: [] } })}>Clear All</Button>
                      </div>
                      <SortableTrackList
                        tracks={selectedTracks}
                        showNumbers={isGuided}
                        onReorder={(tracks) => updateTournament({ settings: { ...tournament.settings, tracks } })}
                        onRemove={(i) => {
                          const updated = [...selectedTracks];
                          updated.splice(i, 1);
                          updateTournament({ settings: { ...tournament.settings, tracks: updated } });
                        }}
                      />
                    </div>
                  )}

                  {/* CDS Accordion cup browser */}
                  <div className="cup-browser-scroll">
                  <Accordion
                    allowMultiple
                    variant="bordered"
                    items={gd.cups.map((cup: any, cupIdx: number) => {
                      const cupCourseIds = cup.courses.map((_: any, ci: number) => `c${cupIdx}-t${ci}`);
                      const cupTrackCount = cupCourseIds.filter((cid: string) => selectedTracks.some((t: any) => t.id === cid)).length;
                      return {
                        id: `cup-${cupIdx}`,
                        title: (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                            <img src={getImagePath(cup.img)} alt={gd.cupName(cupIdx)} style={{ height: 24, width: "auto" }} />
                            <span style={{ fontWeight: 600, fontSize: "13px", flex: 1 }}>{gd.cupName(cupIdx)}</span>
                            {cupTrackCount > 0 && <span className="cup-group__count">{cupTrackCount}/{cup.courses.length}</span>}
                            {!isGuided && (
                              <span
                                className="cup-group__add-all"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  const newTracks = cup.courses
                                    .map((c: any, ci: number) => ({ id: `c${cupIdx}-t${ci}`, name: c.name, img: c.img }))
                                    .filter((c: any) => !selectedTracks.some((t: any) => t.id === c.id));
                                  updateTournament({ settings: { ...tournament.settings, tracks: [...selectedTracks, ...newTracks] } });
                                }}
                              >Add Cup</span>
                            )}
                          </div>
                        ),
                        content: (
                          <div className="cup-group__tracks">
                            {cup.courses.map((course: any, courseIdx: number) => {
                              const courseId = `c${cupIdx}-t${courseIdx}`;
                              const isSelected = selectedTracks.some((t: any) => t.id === courseId);
                              const isDisabled = (noDups && isSelected && isGuided) || (atLimit && isGuided && !isSelected);
                              return (
                                <button
                                  key={courseId}
                                  className={`tournament-track-pick ${isDisabled ? "tournament-track-pick--added" : ""} ${isSelected && !isGuided ? "tournament-track-pick--in-pool" : ""}`}
                                  onClick={() => isGuided ? addTrack(courseId, course) : toggleTrack(courseId, course)}
                                  disabled={isDisabled}
                                >
                                  <img src={getImagePath(course.img)} alt={course.name} />
                                  <span>{course.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        ),
                      };
                    })}
                  />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Build Restrictions */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1.5rem" }}>Build Restrictions</h2>

            {/* Weight Class Filter */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Allowed Weight Classes</label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {[...gd.weights, "Any"].map((w) => {
                  const allowed: string[] = tournament.settings?.allowedWeights || ["Any"];
                  const isActive = allowed.includes(w);
                  return (
                    <Button key={w} variant={isActive ? "primary" : "secondary"} size="small" onClick={() => {
                      let updated: string[];
                      if (w === "Any") {
                        updated = ["Any"];
                      } else {
                        updated = isActive ? allowed.filter((x) => x !== w) : [...allowed.filter((x) => x !== "Any"), w];
                        if (updated.length === 0) updated = ["Any"];
                      }
                      updateTournament({ settings: { ...tournament.settings, allowedWeights: updated } });
                    }}>{w}</Button>
                  );
                })}
              </div>
            </div>

            {/* Drift Type Filter (MK8DX — inward/outward) */}
            {gd.hasDrift && (
              <div style={{ marginBottom: "1.25rem" }}>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Allowed Drift Types</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {[...gd.driftTypes, "Any"].map((d) => {
                    const allowed: string[] = tournament.settings?.allowedDrift || ["Any"];
                    const isActive = allowed.includes(d);
                    return (
                      <Button key={d} variant={isActive ? "primary" : "secondary"} size="small" onClick={() => {
                        let updated: string[];
                        if (d === "Any") {
                          updated = ["Any"];
                        } else {
                          updated = isActive ? allowed.filter((x) => x !== d) : [...allowed.filter((x) => x !== "Any"), d];
                          if (updated.length === 0) updated = ["Any"];
                        }
                        updateTournament({ settings: { ...tournament.settings, allowedDrift: updated } });
                      }}>{d === "Any" ? "Any Drift" : `${d} Drift`}</Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vehicle Type Filter (Mario Kart World — Kart/Bike/ATV) */}
            {!gd.hasDrift && gd.vehicleTypes.length > 0 && (
              <div style={{ marginBottom: "1.25rem" }}>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Allowed Vehicle Types</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {[...gd.vehicleTypes, "Any"].map((t) => {
                    const allowed: string[] = tournament.settings?.allowedVehicleTypes || ["Any"];
                    const isActive = allowed.includes(t);
                    return (
                      <Button key={t} variant={isActive ? "primary" : "secondary"} size="small" onClick={() => {
                        let updated: string[];
                        if (t === "Any") {
                          updated = ["Any"];
                        } else {
                          updated = isActive ? allowed.filter((x) => x !== t) : [...allowed.filter((x) => x !== "Any"), t];
                          if (updated.length === 0) updated = ["Any"];
                        }
                        updateTournament({ settings: { ...tournament.settings, allowedVehicleTypes: updated } });
                      }}>{t === "Any" ? "Any Vehicle" : t}</Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Character Restrictions */}
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <label className="account-card__label">Characters</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button
                    variant={tournament.settings?.characterMode !== "allowed" ? "primary" : "secondary"}
                    size="small"
                    onClick={() => updateTournament({ settings: { ...tournament.settings, characterMode: "banned", allowedCharacters: [], bannedCharacters: tournament.settings?.bannedCharacters || [] } })}
                  >Banned List</Button>
                  <Button
                    variant={tournament.settings?.characterMode === "allowed" ? "primary" : "secondary"}
                    size="small"
                    onClick={() => updateTournament({ settings: { ...tournament.settings, characterMode: "allowed", bannedCharacters: [], allowedCharacters: tournament.settings?.allowedCharacters || [] } })}
                  >Allowed List</Button>
                  <Button variant="ghost" size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, bannedCharacters: [], allowedCharacters: [], characterMode: "banned" } })}>
                    Reset
                  </Button>
                </div>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                {tournament.settings?.characterMode === "allowed"
                  ? "Click characters to ALLOW them. Unselected characters are restricted."
                  : "Click characters to BAN them. Unclicked characters are allowed."}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))", gap: "0.35rem" }}>
                {gd.characters.map((char) => {
                  const isAllowedMode = tournament.settings?.characterMode === "allowed";
                  const bannedList: string[] = tournament.settings?.bannedCharacters || [];
                  const allowedList: string[] = tournament.settings?.allowedCharacters || [];

                  const isSelected = isAllowedMode
                    ? allowedList.includes(char.name)
                    : bannedList.includes(char.name);

                  const dimmed = isAllowedMode
                    ? !isSelected && allowedList.length > 0
                    : isSelected;

                  return (
                    <button
                      key={char.name}
                      className={`char-select__item ${isSelected ? (isAllowedMode ? "char-select__item--selected" : "char-select__item--taken") : ""}`}
                      style={{ padding: "0.35rem", opacity: dimmed ? 0.25 : 1 }}
                      onClick={() => {
                        if (isAllowedMode) {
                          const updated = isSelected ? allowedList.filter((n) => n !== char.name) : [...allowedList, char.name];
                          updateTournament({ settings: { ...tournament.settings, allowedCharacters: updated } });
                        } else {
                          const updated = isSelected ? bannedList.filter((n) => n !== char.name) : [...bannedList, char.name];
                          updateTournament({ settings: { ...tournament.settings, bannedCharacters: updated } });
                        }
                      }}
                    >
                      <img src={getImagePath(char.img)} alt={char.name} style={{ height: 28, width: "auto" }} />
                      <span style={{ fontSize: "8px" }}>{char.name}</span>
                    </button>
                  );
                })}
              </div>
              {((tournament.settings?.bannedCharacters || []).length > 0 || (tournament.settings?.allowedCharacters || []).length > 0) && (
                <div style={{ marginTop: "0.5rem", fontSize: "12px", fontWeight: 600 }}>
                  {tournament.settings?.characterMode === "allowed"
                    ? <span style={{ color: "var(--success-700)" }}>{tournament.settings.allowedCharacters.length} allowed</span>
                    : <span style={{ color: "var(--error-700)" }}>{tournament.settings.bannedCharacters.length} banned</span>
                  }
                </div>
              )}
            </div>

            {/* Additional Notes */}
            <div>
              <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Additional Build Notes</label>
              <textarea
                className="save-setup-input"
                value={tournament.settings?.buildNotes || ""}
                onChange={(e) => setTournament((prev) => prev ? { ...prev, settings: { ...prev.settings, buildNotes: e.target.value } } : prev)}
                onBlur={(e) => updateTournament({ settings: { ...tournament.settings, buildNotes: e.target.value } })}
                placeholder="Any other build restrictions or notes..."
                rows={2}
                style={{ resize: "vertical" }}
              />
            </div>
          </div>

          {/* Rules */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Rules & Notes</h2>
            <textarea
              className="save-setup-input"
              value={tournament.rules || ""}
              onChange={(e) => setTournament((prev) => prev ? { ...prev, rules: e.target.value } : prev)}
              onBlur={(e) => updateTournament({ rules: e.target.value })}
              placeholder="Any additional rules, instructions, or notes for participants..."
              rows={5}
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Participants */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.2rem" }}>Participants ({participants.length})</h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {isTeamMode && activeCount > 0 && (
                  <Button variant="ghost" size="small" onClick={autoBalanceTeams}>Auto-balance teams</Button>
                )}
                {pendingCount > 0 && tournament.acceptance_mode === "manual" && (
                  <Button variant="primary" size="small" onClick={async () => {
                    for (const p of participants.filter((p) => p.status === "registered")) {
                      await updateParticipant(p.id, { status: "confirmed" });
                    }
                  }}>Accept All ({pendingCount})</Button>
                )}
              </div>
            </div>

            {/* Add a guest (no account needed) */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <Input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addGuest(); }}
                placeholder="Add a guest player by name…"
                style={{ flex: 1 }}
              />
              <Button variant="secondary" size="small" onClick={addGuest} disabled={!guestName.trim()}>Add guest</Button>
            </div>

            {participants.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>No participants yet — add guests above or share the link to let players join.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {participants.map((p) => (
                  <div key={p.id} className="manage-participant-row">
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: "14px" }}>{p.display_name}{p.users?.email_verified && <VerifiedBadge />}</span>
                      {p.discord_username && <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "0.5rem" }}>@{p.discord_username}</span>}
                      {p.friend_code && <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "0.5rem" }}>FC: {p.friend_code}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      {isTeamMode && p.status !== "dropped" && (
                        <select
                          value={p.team ?? ""}
                          onChange={(e) => updateParticipant(p.id, { team: e.target.value ? Number(e.target.value) : null })}
                          aria-label={`Team for ${p.display_name}`}
                          style={{
                            height: 28,
                            borderRadius: 6,
                            border: "1px solid var(--border-default)",
                            padding: "0 6px",
                            fontSize: "12px",
                            background: p.team ? `${TEAM_HEX[(p.team - 1) % TEAM_HEX.length]}22` : "var(--surface-default)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <option value="">No team</option>
                          {Array.from({ length: maxTeams }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>Team {n}</option>
                          ))}
                        </select>
                      )}
                      <span className={`lounge-status lounge-status--${p.status === "confirmed" ? "in_progress" : p.status === "checked_in" ? "complete" : p.status === "dropped" ? "complete" : "waiting"}`} style={{ fontSize: "10px" }}>
                        {p.status}
                      </span>
                      {p.status === "registered" && (
                        <>
                          <Button variant="primary" size="small" onClick={() => updateParticipant(p.id, { status: "confirmed" })}>Accept</Button>
                          <Button variant="ghost" size="small" onClick={() => removeParticipant(p.id)}>Reject</Button>
                        </>
                      )}
                      {p.status === "confirmed" && (
                        <>
                          <Button variant="primary" size="small" onClick={() => updateParticipant(p.id, { status: "checked_in" })}>Check In</Button>
                          <Button variant="ghost" size="small" onClick={() => updateParticipant(p.id, { status: "dropped" })}>Drop</Button>
                        </>
                      )}
                      {p.status === "checked_in" && (
                        <Button variant="ghost" size="small" onClick={() => updateParticipant(p.id, { status: "dropped" })}>Drop</Button>
                      )}
                      {p.status === "dropped" && (
                        <Button variant="ghost" size="small" onClick={() => removeParticipant(p.id)}>Remove</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Final Results — enter placements + points; shows as public standings */}
          {(tournament.status === "in_progress" || tournament.status === "complete") && (
            <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "1.2rem" }}>Final Results</h2>
                <Button variant="ghost" size="small" onClick={autoPlaceByPoints}>Auto-place by points</Button>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
                Enter each player&apos;s finishing place and points. Saved live — participants see these as standings on the public page.
              </p>
              {participants.filter((p) => p.status !== "dropped").length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>No participants to score yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[...participants]
                    .filter((p) => p.status !== "dropped")
                    .sort((a, b) => (results[a.id]?.placement ?? 999) - (results[b.id]?.placement ?? 999))
                    .map((p) => (
                      <div key={p.id} className="manage-participant-row">
                        <span style={{ flex: 1, fontWeight: 600, fontSize: "14px" }}>
                          {p.display_name}{p.users?.email_verified && <VerifiedBadge />}
                        </span>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "12px", color: "var(--text-tertiary)" }}>
                          Place
                          <Input
                            type="number"
                            min={1}
                            value={results[p.id]?.placement != null ? String(results[p.id]?.placement) : ""}
                            onChange={(e) => upsertResult(p.id, { placement: e.target.value ? Number(e.target.value) : null })}
                            style={{ width: 64, textAlign: "center" }}
                          />
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "12px", color: "var(--text-tertiary)" }}>
                          Points
                          <Input
                            type="number"
                            value={results[p.id]?.points != null ? String(results[p.id]?.points) : ""}
                            onChange={(e) => upsertResult(p.id, { points: e.target.value ? Number(e.target.value) : null })}
                            style={{ width: 72, textAlign: "center" }}
                          />
                        </label>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Stats */}
          <div className="comp-card">
            <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Summary</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "1rem" }}>
              <div className="saved-build-card__stat">
                <span className="saved-build-card__stat-value">{participants.length}</span>
                <span className="saved-build-card__stat-label">Total</span>
              </div>
              <div className="saved-build-card__stat">
                <span className="saved-build-card__stat-value">{pendingCount}</span>
                <span className="saved-build-card__stat-label">Pending</span>
              </div>
              <div className="saved-build-card__stat">
                <span className="saved-build-card__stat-value">{confirmedCount}</span>
                <span className="saved-build-card__stat-label">Confirmed</span>
              </div>
              <div className="saved-build-card__stat">
                <span className="saved-build-card__stat-value">{checkedInCount}</span>
                <span className="saved-build-card__stat-label">Checked In</span>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
