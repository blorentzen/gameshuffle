"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Container, Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getImagePath } from "@/lib/images";
import { getGameName } from "@/data/game-registry";
import { getTournamentGameData } from "@/lib/tournaments/gameData";
import { isEmailVerified } from "@/lib/auth-utils";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { UserIdentity } from "@/components/profile/UserIdentity";
import { useAnalytics } from "@/hooks/useAnalytics";

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
  created_at: string;
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

export default function TournamentPage() {
  const params = useParams();
  const tournamentId = params.id as string;
  const { user } = useAuth();
  const supabase = createClient();
  const { trackEvent } = useAnalytics();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [results, setResults] = useState<{ participant_id: string; placement: number | null; points: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const loadData = useCallback(async () => {
    const [tRes, pRes, rRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
      supabase.from("tournament_participants").select("*, users(email_verified)").eq("tournament_id", tournamentId).order("joined_at"),
      supabase.from("tournament_results").select("participant_id, placement, points").eq("tournament_id", tournamentId),
    ]);
    if (tRes.data) setTournament(tRes.data as Tournament);
    if (pRes.data) setParticipants(pRes.data as Participant[]);
    if (rRes.data) setResults(rRes.data as { participant_id: string; placement: number | null; points: number | null }[]);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel(`tournament-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${tournamentId}` },
        (payload) => { if (payload.new) setTournament(payload.new as Tournament); })
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter: `tournament_id=eq.${tournamentId}` },
        () => { supabase.from("tournament_participants").select("*, users(email_verified)").eq("tournament_id", tournamentId).order("joined_at").then(({ data }) => { if (data) setParticipants(data as Participant[]); }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, loadData]);

  if (loading) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Loading...</p></div></Container></main>;
  if (!tournament) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Tournament not found.</p></div></Container></main>;

  // Per-game data so character/item art + build tags resolve for MK8DX + MKW.
  const gd = getTournamentGameData(tournament.game_slug);

  const isOrganizer = user?.id === tournament.organizer_id;
  const myParticipation = participants.find((p) => p.user_id === user?.id);
  const isAccepted = myParticipation?.status === "confirmed" || myParticipation?.status === "checked_in";
  const canSeePrivate = isAccepted || (myParticipation && tournament.acceptance_mode === "auto");
  const isFull = tournament.max_participants ? participants.length >= tournament.max_participants : false;

  const handleJoin = async () => {
    if (!user) return;
    setJoining(true);
    // Pull display name, friend code, and discord from user profile
    const { data: profile } = await supabase
      .from("users")
      .select("display_name, gamertags")
      .eq("id", user.id)
      .single();
    const gamertags = (profile?.gamertags as { nso?: string; discord?: string }) || {};
    const status = tournament.acceptance_mode === "auto" ? "confirmed" : "registered";
    await supabase.from("tournament_participants").insert({
      tournament_id: tournamentId,
      user_id: user.id,
      display_name: profile?.display_name || user.user_metadata?.display_name || "Player",
      friend_code: gamertags.nso || null,
      discord_username: gamertags.discord || null,
      status,
    });
    trackEvent("Tournament Joined");
    setJoining(false);
  };

  const TEAM_HEX = ["#0E75C1", "#C11A10", "#17A710", "#F59E0B", "#8B5CF6", "#EC4899"];
  const isTeamMode = tournament.mode !== "ffa";

  // Final standings — results joined to participants, ordered by placement
  // (then points). Only rows with a placement or points count.
  const standings = results
    .map((r) => ({
      ...r,
      name: participants.find((p) => p.id === r.participant_id)?.display_name ?? "—",
    }))
    .filter((r) => r.placement != null || r.points != null)
    .sort((a, b) => {
      if (a.placement != null && b.placement != null) return a.placement - b.placement;
      if (a.placement != null) return -1;
      if (b.placement != null) return 1;
      return (b.points ?? 0) - (a.points ?? 0);
    });

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {/* Organizer bar */}
          {isOrganizer && (
            <div className="comp-card" style={{ marginBottom: "1rem", padding: "0.75rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "14px", fontWeight: 600 }}>You&apos;re the organizer</span>
              <a href={`/tournament/${tournamentId}/manage`}><Button variant="primary" size="small">Manage Tournament</Button></a>
            </div>
          )}

          {/* Header */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
              <span className={`lounge-status lounge-status--${tournament.status}`}>{tournament.status}</span>
              <span className="lounge-mode-badge">{tournament.mode.toUpperCase()}</span>
              {tournament.settings?.requireVerified && <span className="verified-badge">Verified Only</span>}
              <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{getGameName(tournament.game_slug)}</span>
            </div>
            <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>{tournament.title}</h1>
            {tournament.date_time && (
              <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                {new Date(tournament.date_time).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            )}
            {tournament.description && <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "1rem" }}>{tournament.description}</p>}
          </div>

          {/* Final Standings */}
          {standings.length > 0 && (
            <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>
                {tournament.status === "complete" ? "Final Standings" : "Live Standings"}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {standings.map((s, i) => {
                  const rank = s.placement ?? i + 1;
                  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                  return (
                    <div
                      key={s.participant_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "0.4rem",
                        background: rank <= 3 ? "var(--surface-raised, var(--surface-default))" : "transparent",
                        border: "1px solid var(--border-subtle, var(--border-default))",
                      }}
                    >
                      <span style={{ width: 32, textAlign: "center", fontWeight: 800, fontSize: "15px" }}>
                        {medal ?? rank}
                      </span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: "14px" }}>{s.name}</span>
                      {s.points != null && (
                        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-secondary)" }}>{s.points} pts</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Race Settings */}
          {tournament.settings && (
            <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Race Settings</h2>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                {tournament.settings.raceCount && <span className="config-tag">{tournament.settings.raceCount} Races</span>}
                {tournament.settings.cc && <span className="config-tag">{tournament.settings.cc}</span>}
                {tournament.settings.items && <span className="config-tag">Items: {tournament.settings.items}</span>}
                {tournament.settings.cpu && <span className="config-tag">CPU: {tournament.settings.cpu}</span>}
                {tournament.settings.allowedWeights && !tournament.settings.allowedWeights.includes("Any") && (
                  <span className="config-tag">Weights: {tournament.settings.allowedWeights.join(", ")}</span>
                )}
                {tournament.settings.allowedDrift && !tournament.settings.allowedDrift.includes("Any") && (
                  <span className="config-tag">Drift: {tournament.settings.allowedDrift.join(", ")}</span>
                )}
                {tournament.settings.allowedVehicleTypes && !tournament.settings.allowedVehicleTypes.includes("Any") && (
                  <span className="config-tag">Vehicles: {tournament.settings.allowedVehicleTypes.join(", ")}</span>
                )}
              </div>

              {/* Custom Items Display */}
              {tournament.settings.items === "custom" && tournament.settings.customItems?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Active Items</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {tournament.settings.customItems.map((name: string) => {
                      const item = gd.items.find((i: any) => i.name === name);
                      return (
                        <div key={name} className="setup-expand__item" title={name}>
                          {item?.img ? <img src={getImagePath(item.img)} alt={name} className="setup-expand__item-img" /> : <span style={{ fontSize: "9px" }}>{name}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tracks Display */}
              {tournament.settings.tracks?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Track List</span>
                  <div className="tournament-track-list">
                    {tournament.settings.tracks.map((t: any, i: number) => (
                      <div key={i} className="tournament-track-item">
                        <span className="tournament-track-item__num">{i + 1}</span>
                        <img src={getImagePath(t.img)} alt={t.name} className="tournament-track-item__img" />
                        <span className="tournament-track-item__name">{t.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tournament.settings.trackMode === "open" && (
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Tracks will be decided on tournament day.</p>
              )}

              {/* Character Restrictions */}
              {tournament.settings.bannedCharacters?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Banned Characters</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {tournament.settings.bannedCharacters.map((name: string) => {
                      const char = gd.characters.find((c) => c.name === name);
                      return (
                        <div key={name} style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.25rem 0.5rem", background: "var(--surface-error)", borderRadius: "0.25rem" }}>
                          {char && <img src={getImagePath(char.img)} alt={name} style={{ height: 20, width: "auto" }} />}
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--error-700)" }}>{name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {tournament.settings.allowedCharacters?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Allowed Characters</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {tournament.settings.allowedCharacters.map((name: string) => {
                      const char = gd.characters.find((c) => c.name === name);
                      return (
                        <div key={name} style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.25rem 0.5rem", background: "var(--surface-success)", borderRadius: "0.25rem" }}>
                          {char && <img src={getImagePath(char.img)} alt={name} style={{ height: 20, width: "auto" }} />}
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--success-700)" }}>{name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Build Notes */}
              {tournament.settings.buildNotes && (
                <div>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.25rem" }}>Build Notes</span>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{tournament.settings.buildNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Rules */}
          {tournament.rules && (
            <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Rules</h2>
              <p style={{ fontSize: "14px", whiteSpace: "pre-wrap", color: "var(--text-secondary)" }}>{tournament.rules}</p>
            </div>
          )}

          {/* Private Section (accepted participants + organizer only) */}
          {canSeePrivate && (tournament.community_link || tournament.room_code || (tournament.friend_codes && tournament.friend_codes.length > 0)) && (
            <div className="comp-card" style={{ marginBottom: "1.5rem", borderLeft: "4px solid var(--primary-500)" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Lobby Details</h2>
              {tournament.room_code && (
                <div style={{ marginBottom: "1rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.25rem" }}>Room Code</span>
                  <span className="lobby-room-code">{tournament.room_code}</span>
                </div>
              )}
              {tournament.community_link && (
                <div style={{ marginBottom: "1rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.25rem" }}>{tournament.community_name || "Community"}</span>
                  <a href={tournament.community_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-500)", fontWeight: 600 }}>{tournament.community_link}</a>
                </div>
              )}
              {tournament.friend_codes && tournament.friend_codes.length > 0 && (
                <div>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Friend Codes</span>
                  {tournament.friend_codes.map((fc, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0", borderBottom: "1px solid var(--background-tertiary)" }}>
                      <span style={{ fontSize: "14px" }}>{fc.name}</span>
                      <span style={{ fontSize: "14px", fontWeight: 600, fontFamily: "monospace" }}>{fc.code}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pending message */}
          {myParticipation && myParticipation.status === "registered" && tournament.acceptance_mode === "manual" && (
            <div className="comp-card" style={{ marginBottom: "1.5rem", borderLeft: "4px solid var(--warning-500)", background: "var(--surface-warning)" }}>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--warning-800)" }}>Your registration is pending approval. You&apos;ll see lobby details once the organizer accepts you.</p>
            </div>
          )}

          {/* Participants */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.2rem" }}>Participants ({participants.length}{tournament.max_participants ? `/${tournament.max_participants}` : ""})</h2>
            </div>
            {participants.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "14px" }}>No participants yet. Be the first to join!</p>
            ) : isTeamMode ? (
              <div className="team-cards-grid">
                {Array.from(new Set(participants.map((p) => p.team).filter((t) => t !== null))).sort((a, b) => a! - b!).map((teamIdx) => {
                  const teamPlayers = participants.filter((p) => p.team === teamIdx);
                  const color = TEAM_HEX[(teamIdx! - 1) % TEAM_HEX.length];
                  return (
                    <div key={teamIdx!} className="team-card" style={{ borderTopColor: color || "var(--border-default)" }}>
                      <div className="team-card__header"><span className="team-card__name" style={{ color }}>Team {teamIdx!}</span></div>
                      <div className="team-card__members">
                        {teamPlayers.map((p) => (
                          <div key={p.id} className="team-card__member">
                            <div className="team-card__member-info"><span className="team-card__member-name">{p.user_id ? <UserIdentity userId={p.user_id} name={p.display_name} /> : p.display_name}{p.users?.email_verified && <VerifiedBadge />}</span></div>
                            <span className={`lounge-status lounge-status--${p.status === "confirmed" ? "in_progress" : p.status === "checked_in" ? "complete" : "waiting"}`} style={{ fontSize: "10px" }}>{p.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {/* Unassigned */}
                {participants.filter((p) => p.team === null).length > 0 && (
                  <div className="team-card">
                    <div className="team-card__header"><span className="team-card__name">Unassigned</span></div>
                    <div className="team-card__members">
                      {participants.filter((p) => p.team === null).map((p) => (
                        <div key={p.id} className="team-card__member">
                          <div className="team-card__member-info"><span className="team-card__member-name">{p.user_id ? <UserIdentity userId={p.user_id} name={p.display_name} /> : p.display_name}{p.users?.email_verified && <VerifiedBadge />}</span></div>
                          <span className={`lounge-status lounge-status--waiting`} style={{ fontSize: "10px" }}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {participants.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.75rem", background: "var(--background-secondary)", borderRadius: "0.25rem" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>{p.user_id ? <UserIdentity userId={p.user_id} name={p.display_name} /> : p.display_name}{p.users?.email_verified && <VerifiedBadge />}</span>
                    <span className={`lounge-status lounge-status--${p.status === "confirmed" ? "in_progress" : p.status === "checked_in" ? "complete" : "waiting"}`} style={{ fontSize: "10px" }}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Join / Already Joined */}
          {user && myParticipation && (
            <div className="comp-card" style={{ textAlign: "center" }}>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)" }}>You&apos;re signed up for this tournament!</p>
            </div>
          )}
          {user && !myParticipation && tournament.status === "open" && !isFull && (
            !isEmailVerified(user) ? (
              <div className="comp-card" style={{ textAlign: "center" }}>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--warning-700)", marginBottom: "0.5rem" }}>Verify your email to join tournaments</p>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "1rem" }}>Check your inbox for a confirmation link.</p>
                <Button variant="secondary" size="small" onClick={async () => {
                  const supabase = createClient();
                  await supabase.auth.resend({ type: "signup", email: user.email! });
                }}>Resend Verification Email</Button>
              </div>
            ) : tournament.settings?.requireVerified && !isEmailVerified(user) ? (
              <div className="comp-card" style={{ textAlign: "center" }}>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--warning-700)" }}>This tournament requires a verified email to join.</p>
              </div>
            ) : (
              <div className="comp-card" style={{ textAlign: "center" }}>
                <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "1rem" }}>Your display name, friend code, and Discord will be pulled from your profile.</p>
                <Button variant="primary" onClick={handleJoin} disabled={joining}>
                  {joining ? "Joining..." : tournament.acceptance_mode === "auto" ? "Join Tournament" : "Request to Join"}
                </Button>
              </div>
            )
          )}

          {!user && tournament.status === "open" && (
            <div className="comp-card" style={{ textAlign: "center" }}>
              <p style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Join this tournament</p>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                Create a free GameShuffle account to sign up, save your friend code, and see your results on the standings. Already have one? Log in.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
                <a href={`/signup?next=/tournament/${tournamentId}`}><Button variant="primary">Create free account</Button></a>
                <a href={`/login?next=/tournament/${tournamentId}`}><Button variant="secondary">Log in</Button></a>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "0.75rem" }}>
                No account? The organizer can still add you as a guest.
              </p>
            </div>
          )}
        </div>
      </Container>
    </main>
  );
}
