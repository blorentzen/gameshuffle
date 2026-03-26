"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Container, Button, Input } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getImagePath } from "@/lib/images";
import mk8dxData from "@/data/mk8dx-data.json";
import { hasVariants, getVariants, hasColorVariant, TEAM_COLORS } from "@/data/mk8dx-variants";

// --- Types ---

interface ScoringRow { place: string; points: number; }

interface LoungePlayer {
  id: string;
  session_id: string;
  user_id: string;
  display_name: string;
  team: number | null;
  character: string | null;
  character_variant: string | null;
  is_ready: boolean;
  is_late: boolean;
  is_dropped: boolean;
}

interface LoungeRace {
  id: string;
  session_id: string;
  race_number: number;
  placements: Record<string, number>; // lounge_player.id -> position
}

interface TeamInfo {
  color?: string;
  colorHex?: string;
  tag?: string;
}

interface LoungeSettings {
  mode: "ffa" | "2v2" | "3v3" | "4v4" | "6v6";
  teams: number;
  perTeam: number;
  hostId?: string;
  roomCode?: string;
  teamInfo?: Record<number, TeamInfo>;
}

interface LoungeSession {
  id: string;
  game_slug: string;
  organizer_id: string;
  status: string;
  race_count: number;
  scoring_table: ScoringRow[];
  settings: LoungeSettings;
  created_at: string;
}

// --- Component ---

export default function LoungeScoringPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const sessionId = params.id as string;
  const supabase = createClient();

  const [session, setSession] = useState<LoungeSession | null>(null);
  const [players, setPlayers] = useState<LoungePlayer[]>([]);
  const [races, setRaces] = useState<LoungeRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinName, setJoinName] = useState("");
  const [joinTeam, setJoinTeam] = useState(0);
  const [currentRace, setCurrentRace] = useState<Record<string, number>>({});

  // --- Load data ---
  const loadAll = useCallback(async () => {
    const [sessionRes, playersRes, racesRes] = await Promise.all([
      supabase.from("lounge_sessions").select("*").eq("id", sessionId).single(),
      supabase.from("lounge_players").select("*").eq("session_id", sessionId).order("team").order("joined_at"),
      supabase.from("lounge_races").select("*").eq("session_id", sessionId).order("race_number"),
    ]);
    if (sessionRes.data) setSession(sessionRes.data as LoungeSession);
    if (playersRes.data) setPlayers(playersRes.data as LoungePlayer[]);
    if (racesRes.data) setRaces(racesRes.data as LoungeRace[]);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    loadAll();

    // Subscribe to all three tables
    const channel = supabase
      .channel(`lounge-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lounge_sessions", filter: `id=eq.${sessionId}` },
        (payload) => { if (payload.new) setSession(payload.new as LoungeSession); })
      .on("postgres_changes", { event: "*", schema: "public", table: "lounge_players", filter: `session_id=eq.${sessionId}` },
        () => { supabase.from("lounge_players").select("*").eq("session_id", sessionId).order("team").order("joined_at").then(({ data }) => { if (data) setPlayers(data as LoungePlayer[]); }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "lounge_races", filter: `session_id=eq.${sessionId}` },
        () => { supabase.from("lounge_races").select("*").eq("session_id", sessionId).order("race_number").then(({ data }) => { if (data) setRaces(data as LoungeRace[]); }); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, loadAll]);

  // --- Derived state ---
  const isOrganizer = user?.id === session?.organizer_id;
  const myPlayer = players.find((p) => p.user_id === user?.id);
  const isPlayer = Boolean(myPlayer);
  const currentRaceNumber = races.length + 1;
  const isComplete = session?.status === "complete";
  const isCharSelect = session?.status === "character_select";
  const isLobby = session?.status === "lobby";
  const isTeamMode = session?.settings?.mode && session.settings.mode !== "ffa";
  const needsTeamSetup = isTeamMode && session?.settings?.mode !== "6v6";
  const teamCount = session?.settings?.teams || 12;
  const perTeam = session?.settings?.perTeam || 1;
  const myTeamIdx = myPlayer?.team;
  const myTeamInfo = (myTeamIdx !== null && myTeamIdx !== undefined && session?.settings?.teamInfo?.[myTeamIdx]) || undefined;

  const TEAM_HEX = ["#0E75C1", "#C11A10", "#17A710", "#F59E0B", "#8B5CF6", "#EC4899"];
  const TEAM_NAMES = ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5", "Team 6"];

  // --- Scoring ---
  const getPlayerScore = (playerId: string): number => {
    if (!session) return 0;
    return races.reduce((total, race) => {
      const position = race.placements[playerId];
      if (!position) return total;
      const row = session.scoring_table[position - 1];
      return total + (row?.points || 0);
    }, 0);
  };

  const getSortedPlayers = () => [...players].sort((a, b) => getPlayerScore(b.id) - getPlayerScore(a.id));

  const getTeamScore = (teamIdx: number): number =>
    players.filter((p) => p.team === teamIdx).reduce((total, p) => total + getPlayerScore(p.id), 0);

  const getSortedTeams = () =>
    Array.from({ length: teamCount }, (_, i) => i).sort((a, b) => getTeamScore(b) - getTeamScore(a));

  // --- Actions ---
  const handleJoin = async () => {
    if (!user || !session) return;
    const name = joinName.trim() || user.user_metadata?.display_name || "Player";
    await supabase.from("lounge_players").insert({
      session_id: sessionId,
      user_id: user.id,
      display_name: name,
      team: isTeamMode ? joinTeam : null,
    });
  };

  const handleSelectCharacter = async (character: string, variant?: string) => {
    if (!myPlayer) return;
    await supabase.from("lounge_players").update({
      character,
      character_variant: variant || null,
    }).eq("id", myPlayer.id);
  };

  const handleToggleReady = async () => {
    if (!myPlayer) return;
    await supabase.from("lounge_players").update({ is_ready: !myPlayer.is_ready }).eq("id", myPlayer.id);
  };

  const handleMarkLate = async (playerId: string) => {
    await supabase.from("lounge_players").update({ is_late: true }).eq("id", playerId);
  };

  const handleMarkDropped = async (playerId: string) => {
    await supabase.from("lounge_players").update({ is_dropped: true, is_ready: false }).eq("id", playerId);
  };

  const handleRemovePlayer = async (playerId: string) => {
    await supabase.from("lounge_players").delete().eq("id", playerId);
  };

  const setPlacement = (playerId: string, position: number) => {
    setCurrentRace((prev) => ({ ...prev, [playerId]: position }));
  };

  const handleSubmitRace = async () => {
    if (!session) return;
    const isLastRace = currentRaceNumber >= session.race_count;
    await supabase.from("lounge_races").insert({
      session_id: sessionId,
      race_number: currentRaceNumber,
      placements: currentRace,
    });
    if (isLastRace) {
      await supabase.from("lounge_sessions").update({ status: "complete", completed_at: new Date().toISOString() }).eq("id", sessionId);
    } else if (session.status !== "in_progress") {
      await supabase.from("lounge_sessions").update({ status: "in_progress" }).eq("id", sessionId);
    }
    setCurrentRace({});
  };

  const handleUndoRace = async () => {
    if (races.length === 0) return;
    const lastRace = races[races.length - 1];
    await supabase.from("lounge_races").delete().eq("id", lastRace.id);
    if (session?.status === "complete") {
      await supabase.from("lounge_sessions").update({ status: "in_progress", completed_at: null }).eq("id", sessionId);
    }
  };

  // Session phase transitions
  const updateStatus = async (status: string) => {
    await supabase.from("lounge_sessions").update({ status }).eq("id", sessionId);
  };

  const updateSettings = async (updates: Partial<LoungeSettings>) => {
    if (!session) return;
    await supabase.from("lounge_sessions").update({ settings: { ...session.settings, ...updates } }).eq("id", sessionId);
  };

  // Team setup
  const handleSetTeamColor = async (teamIdx: number, colorName: string, colorHex: string) => {
    if (!session) return;
    const teamInfo = { ...(session.settings?.teamInfo || {}) };
    teamInfo[teamIdx] = { ...teamInfo[teamIdx], color: colorName, colorHex };
    await updateSettings({ teamInfo });
  };

  const handleSetTeamTag = async (teamIdx: number, tag: string) => {
    if (!session) return;
    const teamInfo = { ...(session.settings?.teamInfo || {}) };
    teamInfo[teamIdx] = { ...teamInfo[teamIdx], tag: tag.toUpperCase() };
    await updateSettings({ teamInfo });
  };

  // Character claim helpers
  const getClaimedCharacters = (): Set<string> => {
    const claimed = new Set<string>();
    players.forEach((p) => {
      if (p.character) {
        claimed.add(p.character_variant ? `${p.character}:${p.character_variant}` : p.character);
      }
    });
    return claimed;
  };

  const getClaimedTeamColors = (): Set<string> => {
    if (!session?.settings?.teamInfo) return new Set();
    return new Set(Object.values(session.settings.teamInfo).filter((t) => t.color).map((t) => t.color!));
  };

  const getClaimedTags = (): Set<string> => {
    if (!session?.settings?.teamInfo) return new Set();
    return new Set(Object.values(session.settings.teamInfo).filter((t) => t.tag).map((t) => t.tag!.toUpperCase()));
  };

  // --- Dev Mode ---
  const isDev = process.env.NODE_ENV === "development";

  const handleDevPopulate = async () => {
    if (!session || !user) return;
    const fakeNames = ["Luigi", "Peach", "Toad", "Bowser", "Yoshi", "DK", "Rosalina", "Waluigi", "Daisy", "Shy Guy", "Koopa"];
    const mode = session.settings?.mode || "ffa";
    const pTeam = session.settings?.perTeam || 1;

    // Delete existing fake players first
    await supabase.from("lounge_players").delete().eq("session_id", sessionId).is("user_id", null);

    // Make sure the real user is in the session
    if (!players.find((p) => p.user_id === user.id)) {
      await supabase.from("lounge_players").insert({
        session_id: sessionId,
        user_id: user.id,
        display_name: user.user_metadata?.display_name || "You",
        team: mode !== "ffa" ? 0 : null,
      });
    }

    // Insert 11 fake players with null user_id
    const fakeInserts = fakeNames.map((name, i) => ({
      session_id: sessionId,
      user_id: null,
      display_name: name,
      team: mode !== "ffa" ? Math.floor((i + 1) / pTeam) : null,
    }));

    await supabase.from("lounge_players").insert(fakeInserts);
    await updateStatus(mode === "ffa" ? "lobby" : "character_select");
  };

  const handleDevRandomRace = async () => {
    const positions = Array.from({ length: players.length }, (_, i) => i + 1);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    const placements: Record<string, number> = {};
    players.forEach((p, i) => { placements[p.id] = positions[i]; });

    const raceNum = races.length + 1;
    const isLastRace = session ? raceNum >= session.race_count : false;

    await supabase.from("lounge_races").insert({ session_id: sessionId, race_number: raceNum, placements });
    if (isLastRace) {
      await updateStatus("complete");
    } else if (session?.status !== "in_progress") {
      await updateStatus("in_progress");
    }
  };

  const handleDevAutoChars = async () => {
    if (!session) return;
    const chars = mk8dxData.characters;
    const teamColors = ["Red", "Blue", "Green", "Yellow", "Pink", "Orange"];
    const teamColorHex = ["#F44336", "#2196F3", "#4CAF50", "#FFEB3B", "#E91E63", "#FF9800"];

    if (needsTeamSetup) {
      const teamInfo: Record<number, TeamInfo> = {};
      for (let t = 0; t < teamCount; t++) {
        teamInfo[t] = { color: teamColors[t], colorHex: teamColorHex[t], tag: String.fromCharCode(65 + t).repeat(2) };
      }
      await updateSettings({ teamInfo });
    }

    for (let i = 0; i < players.length; i++) {
      const char = chars[i % chars.length];
      let variant: string | undefined;
      if (hasVariants(char.name) && needsTeamSetup && players[i].team !== null) {
        variant = teamColors[players[i].team!];
      } else if (hasVariants(char.name)) {
        const variants = getVariants(char.name);
        variant = variants[i % variants.length]?.variant;
      }
      await supabase.from("lounge_players").update({ character: char.name, character_variant: variant || null }).eq("id", players[i].id);
    }
  };

  const handleDevReset = async () => {
    if (!session) return;
    await supabase.from("lounge_races").delete().eq("session_id", sessionId);
    await supabase.from("lounge_players").delete().eq("session_id", sessionId);
    await supabase.from("lounge_sessions").update({
      status: "waiting",
      completed_at: null,
      settings: { mode: session.settings.mode, teams: session.settings.teams, perTeam: session.settings.perTeam },
    }).eq("id", sessionId);
  };

  // --- Render ---
  if (loading) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Loading session...</p></div></Container></main>;
  if (!session) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Session not found.</p></div></Container></main>;

  const allPlacementsSet = players.length > 0 && players.every((p) => currentRace[p.id]);

  return (
    <main style={{ paddingTop: "2rem", paddingBottom: "5rem" }}>
      <Container>
        {/* Header */}
        <div className="lounge-header">
          <div>
            <h1 className="lounge-header__title">
              {isComplete ? "Final Results" : `Race ${currentRaceNumber} of ${session.race_count}`}
            </h1>
            <span className={`lounge-status lounge-status--${session.status}`}>
              {session.status === "waiting" && "Waiting for players"}
              {session.status === "character_select" && "Character selection"}
              {session.status === "lobby" && "Lobby setup"}
              {session.status === "in_progress" && "In progress"}
              {session.status === "complete" && "Complete"}
            </span>
            {isTeamMode && <span className="lounge-mode-badge" style={{ marginLeft: "0.5rem" }}>{session.settings.mode.toUpperCase()}</span>}
          </div>
          <Button variant="ghost" size="small" onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy Link</Button>
        </div>

        {/* Dev Controls */}
        {isDev && (
          <div className="dev-controls">
            <span className="dev-controls__badge">DEV MODE</span>
            {session.status === "waiting" && <Button variant="ghost" size="small" onClick={handleDevPopulate}>Populate 12</Button>}
            {isCharSelect && <><Button variant="ghost" size="small" onClick={handleDevAutoChars}>Auto Characters</Button><Button variant="ghost" size="small" onClick={() => updateStatus("lobby")}>Skip to Lobby</Button><Button variant="ghost" size="small" onClick={() => updateStatus("in_progress")}>Skip to Racing</Button></>}
            {isLobby && <>
              <Button variant="ghost" size="small" onClick={async () => {
                // Fake another player hosting — use lounge player id as hostId
                const fakeHost = players.find((p) => p.user_id !== user?.id);
                if (fakeHost) {
                  await updateSettings({ hostId: fakeHost.id, roomCode: "SW-1234-5678" });
                }
                for (const p of players) { await supabase.from("lounge_players").update({ is_ready: true }).eq("id", p.id); }
              }}>Fake Other Host</Button>
              <Button variant="ghost" size="small" onClick={async () => {
                await updateSettings({ hostId: user?.id, roomCode: "ABC123" });
                for (const p of players) { await supabase.from("lounge_players").update({ is_ready: true }).eq("id", p.id); }
              }}>I Host</Button>
              <Button variant="ghost" size="small" onClick={() => updateStatus("in_progress")}>Skip to Racing</Button>
            </>}
            {session.status === "in_progress" && !isComplete && <><Button variant="ghost" size="small" onClick={handleDevRandomRace}>Sim Race {currentRaceNumber}</Button><Button variant="ghost" size="small" onClick={async () => { const remaining = session.race_count - races.length; for (let i = 0; i < remaining; i++) { await handleDevRandomRace(); await new Promise(r => setTimeout(r, 200)); } }}>Sim All</Button></>}
            {isComplete && <Button variant="ghost" size="small" onClick={handleDevReset}>Reset</Button>}
            <span style={{ fontSize: "10px", color: "#999", marginLeft: "auto" }}>{session.status} | {players.length}p | {races.length}/{session.race_count}r</span>
          </div>
        )}

        {/* Waiting */}
        {session.status === "waiting" && (
          <div className="comp-card" style={{ marginBottom: "2rem" }}>
            <div className="lounge-waiting-header">
              <h2>Players ({players.length}/12)</h2>
              {isTeamMode && <span className="lounge-mode-badge">{session.settings.mode.toUpperCase()}</span>}
            </div>
            {isTeamMode && players.length > 0 && (
              <div className="lounge-teams">
                {Array.from({ length: teamCount }, (_, teamIdx) => {
                  const teamPlayers = players.filter((p) => p.team === teamIdx);
                  return (
                    <div key={teamIdx} className="lounge-team">
                      <div className="lounge-team__header" style={{ borderColor: TEAM_HEX[teamIdx] }}>
                        <span style={{ color: TEAM_HEX[teamIdx], fontWeight: 700, fontSize: "13px" }}>{TEAM_NAMES[teamIdx]}</span>
                        <span style={{ fontSize: "12px", color: "#808080" }}>{teamPlayers.length}/{perTeam}</span>
                      </div>
                      {teamPlayers.map((p) => <div key={p.id} className="lounge-player-chip" style={{ borderColor: TEAM_HEX[teamIdx] }}>{p.display_name}</div>)}
                    </div>
                  );
                })}
              </div>
            )}
            {!isTeamMode && players.length > 0 && (
              <div className="lounge-player-list">{players.map((p) => <div key={p.id} className="lounge-player-chip">{p.display_name}</div>)}</div>
            )}
            {!isPlayer && user && (
              <div style={{ marginTop: "1.5rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: isTeamMode ? "0.75rem" : "0" }}>
                  <Input type="text" placeholder="Your name" value={joinName} onChange={(e) => setJoinName(e.target.value)} />
                  <Button variant="primary" onClick={handleJoin}>Join{isTeamMode ? ` ${TEAM_NAMES[joinTeam]}` : ""}</Button>
                </div>
                {isTeamMode && (
                  <div className="lounge-team-picker">
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#606060" }}>Select team:</span>
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      {Array.from({ length: teamCount }, (_, i) => {
                        const teamFull = players.filter((p) => p.team === i).length >= perTeam;
                        return (
                          <button key={i} className={`comp-mode-btn ${joinTeam === i ? "comp-mode-btn--active" : ""}`} style={{ padding: "0.3rem 0.75rem", ...(teamFull && { opacity: 0.3 }) }} onClick={() => !teamFull && setJoinTeam(i)} disabled={teamFull}>
                            <span className="comp-mode-btn__label" style={{ fontSize: "13px", color: TEAM_HEX[i] }}>{TEAM_NAMES[i]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!user && <p style={{ marginTop: "1rem", color: "#808080" }}><a href="/login" style={{ color: "#0E75C1", fontWeight: 600 }}>Log in</a> to join this session.</p>}
            {isOrganizer && players.length >= 2 && (
              <div style={{ marginTop: "1.5rem" }}>
                <Button variant="primary" onClick={() => updateStatus(isTeamMode ? "character_select" : "lobby")}>
                  {isTeamMode ? "Continue to Character Select" : "Continue to Lobby"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Character Select */}
        {isCharSelect && (
          <div style={{ marginBottom: "2rem" }}>
            {needsTeamSetup && (
              <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
                <h2>Team Setup</h2>
                <p style={{ color: "#606060", fontSize: "14px", marginBottom: "1.5rem" }}>Each team picks a color and tag. Variant characters auto-lock to your team&apos;s color.</p>
                <div className="team-setup-grid">
                  {Array.from({ length: teamCount }, (_, teamIdx) => {
                    const info = session.settings?.teamInfo?.[teamIdx];
                    const claimedColors = getClaimedTeamColors();
                    const claimedTags = getClaimedTags();
                    const teamPlayers = players.filter((p) => p.team === teamIdx);
                    const isMyTeam = myTeamIdx === teamIdx;
                    return (
                      <div key={teamIdx} className="team-setup-card" style={{ borderTopColor: info?.colorHex || "#d0d0d0" }}>
                        <div className="team-setup-card__header">
                          <span className="team-setup-card__name" style={{ color: info?.colorHex || "#606060" }}>{info?.tag ? `[${info.tag}]` : `Team ${teamIdx + 1}`}</span>
                          <span style={{ fontSize: "12px", color: "#808080" }}>{teamPlayers.map((p) => p.display_name).join(", ")}</span>
                        </div>
                        <div className="team-setup-card__section">
                          <span className="team-setup-card__label">Color</span>
                          <div className="team-setup-card__colors">
                            {TEAM_COLORS.map((tc) => {
                              const taken = claimedColors.has(tc.name) && info?.color !== tc.name;
                              return (
                                <button key={tc.name} className={`char-variant-dot ${info?.color === tc.name ? "char-variant-dot--selected" : ""} ${taken ? "char-variant-dot--taken" : ""}`} style={{ backgroundColor: tc.hex, width: 20, height: 20 }} title={tc.name} onClick={() => isMyTeam && !taken && handleSetTeamColor(teamIdx, tc.name, tc.hex)} disabled={taken || !isMyTeam} />
                              );
                            })}
                          </div>
                        </div>
                        <div className="team-setup-card__section">
                          <span className="team-setup-card__label">Tag</span>
                          {isMyTeam ? <input type="text" className="team-setup-card__tag-input" placeholder="e.g. AA" maxLength={4} value={info?.tag || ""} onChange={(e) => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!claimedTags.has(val) || val === (info?.tag || "")) handleSetTeamTag(teamIdx, val); }} /> : <span className="team-setup-card__tag-display">{info?.tag || "—"}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="comp-card">
              <h2>Character Selection</h2>
              <p style={{ color: "#606060", fontSize: "14px", marginBottom: "1.5rem" }}>{needsTeamSetup ? "Pick your character. Variant characters use your team's color." : "Pick your character."}</p>
              {myPlayer && (
                <div className="char-select">
                  <div className="char-select__current">
                    {myPlayer.character ? (
                      <div className="char-select__chosen">
                        <img src={getImagePath(mk8dxData.characters.find((c) => c.name === myPlayer.character)?.img || "")} alt={myPlayer.character} style={{ height: 48, width: "auto" }} />
                        <span>{myPlayer.character}{myPlayer.character_variant && ` (${myPlayer.character_variant})`}</span>
                      </div>
                    ) : <span style={{ color: "#808080" }}>No character selected</span>}
                  </div>
                  <div className="char-select__grid">
                    {mk8dxData.characters.map((char) => {
                      const claimed = getClaimedCharacters();
                      const isVariantChar = hasVariants(char.name);

                      if (needsTeamSetup && isVariantChar) {
                        const teamColor = myTeamInfo?.color;
                        const hasTeamClr = teamColor && hasColorVariant(char.name, teamColor);
                        const vKey = `${char.name}:${teamColor}`;
                        const vTaken = claimed.has(vKey) && !(myPlayer.character === char.name && myPlayer.character_variant === teamColor);
                        const isMyV = myPlayer.character === char.name && myPlayer.character_variant === teamColor;
                        return (
                          <div key={char.name} className="char-select__item-wrapper">
                            <button className={`char-select__item ${isMyV ? "char-select__item--selected" : ""} ${(!hasTeamClr || vTaken) ? "char-select__item--taken" : ""}`} onClick={() => hasTeamClr && !vTaken && teamColor && handleSelectCharacter(char.name, teamColor)} disabled={!hasTeamClr || vTaken}>
                              <img src={getImagePath(char.img)} alt={char.name} /><span>{char.name}</span>
                              {myTeamInfo?.colorHex && hasTeamClr && <span className="char-select__team-dot" style={{ backgroundColor: myTeamInfo.colorHex }} />}
                            </button>
                          </div>
                        );
                      }
                      if (isVariantChar) {
                        return (
                          <div key={char.name} className="char-select__item-wrapper">
                            <button className="char-select__item" disabled style={{ opacity: 0.6 }}><img src={getImagePath(char.img)} alt={char.name} /><span>{char.name}</span></button>
                            <div className="char-select__variants">
                              {getVariants(char.name).map((v) => {
                                const vKey = `${char.name}:${v.variant}`;
                                const vTaken = claimed.has(vKey) && !(myPlayer.character === char.name && myPlayer.character_variant === v.variant);
                                const vSel = myPlayer.character === char.name && myPlayer.character_variant === v.variant;
                                return <button key={v.variant} className={`char-variant-dot ${vSel ? "char-variant-dot--selected" : ""} ${vTaken ? "char-variant-dot--taken" : ""}`} style={{ backgroundColor: v.color }} title={`${char.name} (${v.variant})`} onClick={() => !vTaken && handleSelectCharacter(char.name, v.variant)} disabled={vTaken} />;
                              })}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={char.name} className="char-select__item-wrapper">
                          <button className={`char-select__item ${myPlayer.character === char.name && !myPlayer.character_variant ? "char-select__item--selected" : ""}`} onClick={() => handleSelectCharacter(char.name)}>
                            <img src={getImagePath(char.img)} alt={char.name} /><span>{char.name}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{ marginTop: "2rem" }}>
                <h3 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>Selections</h3>
                {isTeamMode ? (
                  <div className="team-cards-grid">
                    {Array.from({ length: teamCount }, (_, teamIdx) => {
                      const teamPlayers = players.filter((p) => p.team === teamIdx);
                      const info = session.settings?.teamInfo?.[teamIdx];
                      if (teamPlayers.length === 0) return null;
                      return (
                        <div key={teamIdx} className="team-card" style={{ borderTopColor: info?.colorHex || TEAM_HEX[teamIdx] }}>
                          <div className="team-card__header">
                            <span className="team-card__name" style={{ color: info?.colorHex || TEAM_HEX[teamIdx] }}>
                              {info?.tag ? `[${info.tag}]` : TEAM_NAMES[teamIdx]}
                            </span>
                          </div>
                          <div className="team-card__members">
                            {teamPlayers.map((p) => (
                              <div key={p.id} className="team-card__member">
                                {p.character && (
                                  <img
                                    src={getImagePath(mk8dxData.characters.find((c) => c.name === p.character)?.img || "")}
                                    alt={p.character}
                                    className="team-card__member-img"
                                  />
                                )}
                                <div className="team-card__member-info">
                                  <span className="team-card__member-name">{p.display_name}</span>
                                  {p.character ? (
                                    <span className="team-card__member-char">{p.character}{p.character_variant ? ` (${p.character_variant})` : ""}</span>
                                  ) : (
                                    <span className="team-card__member-char" style={{ color: "#b0b0b0" }}>Choosing...</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="team-cards-grid">
                    <div className="team-card">
                      <div className="team-card__header">
                        <span className="team-card__name">Players</span>
                      </div>
                      <div className="team-card__members">
                        {players.map((p) => (
                          <div key={p.id} className="team-card__member">
                            {p.character && (
                              <img
                                src={getImagePath(mk8dxData.characters.find((c) => c.name === p.character)?.img || "")}
                                alt={p.character}
                                className="team-card__member-img"
                              />
                            )}
                            <div className="team-card__member-info">
                              <span className="team-card__member-name">{p.display_name}</span>
                              {p.character ? (
                                <span className="team-card__member-char">{p.character}{p.character_variant ? ` (${p.character_variant})` : ""}</span>
                              ) : (
                                <span className="team-card__member-char" style={{ color: "#b0b0b0" }}>Choosing...</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {isOrganizer && <div style={{ marginTop: "1.5rem" }}><Button variant="primary" onClick={() => updateStatus("lobby")}>Continue to Lobby</Button></div>}
            </div>
          </div>
        )}

        {/* Lobby */}
        {isLobby && (
          <div style={{ marginBottom: "2rem" }}>
            {/* Host + Room Code */}
            <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
              <h2>Lobby</h2>
              <div className="lobby-host-row">
                <div className="lobby-host-section">
                  {session.settings?.hostId === user?.id ? (
                    <div>
                      <span className="lobby-host-badge">You are hosting</span>
                      <div style={{ marginTop: "0.75rem" }}>
                        <Input
                          type="text"
                          placeholder="Enter room code"
                          value={session.settings?.roomCode || ""}
                          onChange={(e) => updateSettings({ roomCode: e.target.value })}
                          style={{ maxWidth: "200px", textAlign: "center", fontWeight: 700, fontSize: "18px", letterSpacing: "0.1em" }}
                        />
                      </div>
                    </div>
                  ) : session.settings?.hostId ? (
                    <div>
                      <span style={{ fontSize: "14px" }}>
                        <strong>{players.find((p) => p.user_id === session.settings.hostId || p.id === session.settings.hostId)?.display_name}</strong> is hosting
                      </span>
                      {session.settings?.roomCode && (
                        <div style={{ marginTop: "0.5rem" }}>
                          <span className="lobby-room-code">{session.settings.roomCode}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span style={{ fontSize: "14px", color: "#808080" }}>No host yet — someone needs to volunteer</span>
                    </div>
                  )}
                </div>
                {session.settings?.hostId !== user?.id && user && (
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => updateSettings({ hostId: user.id, roomCode: "" })}
                  >
                    {session.settings?.hostId ? "Take Over Hosting" : "Can Host"}
                  </Button>
                )}
              </div>
            </div>

            {/* Ready Check — grouped by team */}
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.75rem" }}>Ready Check</h3>
            {isTeamMode ? (
              <div className="team-cards-grid">
                {Array.from({ length: teamCount }, (_, teamIdx) => {
                  const teamPlayers = players.filter((p) => p.team === teamIdx);
                  const info = session.settings?.teamInfo?.[teamIdx];
                  const teamColor = info?.colorHex || TEAM_HEX[teamIdx];
                  const allReady = teamPlayers.length > 0 && teamPlayers.every((p) => p.is_ready);
                  if (teamPlayers.length === 0) return null;
                  return (
                    <div key={teamIdx} className={`team-card ${allReady ? "team-card--all-ready" : ""}`} style={{ borderTopColor: teamColor }}>
                      <div className="team-card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="team-card__name" style={{ color: teamColor }}>
                          {info?.tag ? `[${info.tag}]` : TEAM_NAMES[teamIdx]}
                        </span>
                        {allReady && <span className="lobby-ready-badge">ALL READY</span>}
                      </div>
                      <div className="team-card__members">
                        {teamPlayers.map((p) => (
                          <div key={p.id} className="team-card__member">
                            {p.character && (
                              <img src={getImagePath(mk8dxData.characters.find((c) => c.name === p.character)?.img || "")} alt={p.character} className="team-card__member-img" />
                            )}
                            <div className="team-card__member-info" style={{ flex: 1 }}>
                              <span className="team-card__member-name">{p.display_name}</span>
                              {p.character && <span className="team-card__member-char">{p.character}{p.character_variant ? ` (${p.character_variant})` : ""}</span>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                              {p.is_dropped && <span className="lobby-dropped-badge">DROPPED</span>}
                              {!p.is_dropped && p.is_late && <span className="lobby-late-badge">LATE</span>}
                              {!p.is_dropped && (p.is_ready ? (
                                <span className="lobby-ready-badge">READY</span>
                              ) : (
                                <span className="lobby-not-ready">NOT READY</span>
                              ))}
                              {!p.is_dropped && p.user_id === user?.id && (
                                <Button variant={p.is_ready ? "ghost" : "primary"} size="small" onClick={handleToggleReady}>
                                  {p.is_ready ? "Unready" : "Ready Up"}
                                </Button>
                              )}
                              {isOrganizer && !p.is_dropped && !p.is_ready && p.user_id !== user?.id && (
                                <Button variant="ghost" size="small" onClick={() => handleMarkLate(p.id)}>Late</Button>
                              )}
                              {isOrganizer && !p.is_dropped && p.user_id !== user?.id && (
                                <Button variant="ghost" size="small" onClick={() => handleMarkDropped(p.id)}>Drop</Button>
                              )}
                              {isOrganizer && p.is_dropped && (
                                <Button variant="ghost" size="small" onClick={() => handleRemovePlayer(p.id)}>Remove</Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="team-cards-grid">
                <div className="team-card">
                  <div className="team-card__header">
                    <span className="team-card__name">Players</span>
                    {players.every((p) => p.is_ready) && <span className="lobby-ready-badge">ALL READY</span>}
                  </div>
                  <div className="team-card__members">
                    {players.map((p) => (
                      <div key={p.id} className="team-card__member">
                        <div className="team-card__member-info" style={{ flex: 1 }}>
                          <span className="team-card__member-name">{p.display_name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          {p.is_dropped && <span className="lobby-dropped-badge">DROPPED</span>}
                          {!p.is_dropped && p.is_late && <span className="lobby-late-badge">LATE</span>}
                          {!p.is_dropped && (p.is_ready ? <span className="lobby-ready-badge">READY</span> : <span className="lobby-not-ready">NOT READY</span>)}
                          {!p.is_dropped && p.user_id === user?.id && (
                            <Button variant={p.is_ready ? "ghost" : "primary"} size="small" onClick={handleToggleReady}>
                              {p.is_ready ? "Unready" : "Ready Up"}
                            </Button>
                          )}
                          {isOrganizer && !p.is_dropped && !p.is_ready && p.user_id !== user?.id && (
                            <Button variant="ghost" size="small" onClick={() => handleMarkLate(p.id)}>Late</Button>
                          )}
                          {isOrganizer && !p.is_dropped && p.user_id !== user?.id && (
                            <Button variant="ghost" size="small" onClick={() => handleMarkDropped(p.id)}>Drop</Button>
                          )}
                          {isOrganizer && p.is_dropped && (
                            <Button variant="ghost" size="small" onClick={() => handleRemovePlayer(p.id)}>Remove</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isOrganizer && <div style={{ marginTop: "1.5rem" }}><Button variant="primary" onClick={() => updateStatus("in_progress")}>Start Races</Button></div>}
          </div>
        )}

        {/* Scoreboard */}
        {(session.status === "in_progress" || isComplete) && (
          <div className="lounge-scoreboard">
            <table className="lounge-table">
              <thead>
                <tr>
                  <th className="lounge-table__player-col">Player</th>
                  {races.map((r) => <th key={r.race_number} className="lounge-table__race-col">R{r.race_number}</th>)}
                  {!isComplete && <th className="lounge-table__race-col lounge-table__race-col--current">R{currentRaceNumber}</th>}
                  <th className="lounge-table__total-col">Total</th>
                </tr>
              </thead>
              <tbody>
                {getSortedPlayers().map((player, rank) => (
                  <tr key={player.id} className={rank === 0 && isComplete ? "lounge-table__row--winner" : ""}>
                    <td className="lounge-table__player">
                      <span className="lounge-table__rank">{rank + 1}</span>
                      {player.display_name}
                    </td>
                    {races.map((race) => {
                      const pos = race.placements[player.id];
                      const pts = pos ? session.scoring_table[pos - 1]?.points : 0;
                      return <td key={race.race_number} className="lounge-table__cell"><span className="lounge-table__pos">P{pos || "?"}</span><span className="lounge-table__pts">{pts}</span></td>;
                    })}
                    {!isComplete && (
                      <td className="lounge-table__cell lounge-table__cell--current">
                        <div className="lounge-placement-picker">
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map((pos) => {
                            const taken = Object.entries(currentRace).some(([pid, p]) => p === pos && pid !== player.id);
                            const selected = currentRace[player.id] === pos;
                            return <button key={pos} className={`lounge-pos-btn ${selected ? "lounge-pos-btn--selected" : ""} ${taken ? "lounge-pos-btn--taken" : ""}`} onClick={() => !taken && setPlacement(player.id, pos)} disabled={taken}>{pos}</button>;
                          })}
                        </div>
                      </td>
                    )}
                    <td className="lounge-table__total">{getPlayerScore(player.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Race Controls */}
        {session.status === "in_progress" && !isComplete && (
          <div className="lounge-controls">
            <Button variant="primary" onClick={handleSubmitRace} disabled={!allPlacementsSet}>{currentRaceNumber >= session.race_count ? "Submit Final Race" : `Submit Race ${currentRaceNumber}`}</Button>
            {races.length > 0 && <Button variant="ghost" size="small" onClick={handleUndoRace}>Undo Last Race</Button>}
          </div>
        )}

        {/* Team Standings */}
        {isTeamMode && (session.status === "in_progress" || isComplete) && (
          <div className="team-cards-grid" style={{ marginTop: "1.5rem" }}>
            {getSortedTeams().map((teamIdx, rank) => {
              const info = session.settings?.teamInfo?.[teamIdx];
              const teamPlayers = players.filter((p) => p.team === teamIdx).sort((a, b) => getPlayerScore(b.id) - getPlayerScore(a.id));
              const teamColor = info?.colorHex || TEAM_HEX[teamIdx];
              return (
                <div key={teamIdx} className="team-card" style={{ borderTopColor: teamColor }}>
                  <div className="team-card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="team-card__rank">{rank + 1}</span>
                      <span className="team-card__name" style={{ color: teamColor }}>
                        {info?.tag ? `[${info.tag}]` : TEAM_NAMES[teamIdx]}
                      </span>
                    </div>
                    <span className="team-card__total">{getTeamScore(teamIdx)}</span>
                  </div>
                  <div className="team-card__members">
                    {teamPlayers.map((p) => (
                      <div key={p.id} className="team-card__member">
                        {p.character && (
                          <img
                            src={getImagePath(mk8dxData.characters.find((c) => c.name === p.character)?.img || "")}
                            alt={p.character}
                            className="team-card__member-img"
                          />
                        )}
                        <div className="team-card__member-info" style={{ flex: 1 }}>
                          <span className="team-card__member-name">{p.display_name}</span>
                          <span className="team-card__member-char">
                            {p.character ? `${p.character}${p.character_variant ? ` (${p.character_variant})` : ""}` : ""}
                          </span>
                        </div>
                        <span className="team-card__member-score">{getPlayerScore(p.id)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Complete */}
        {isComplete && (
          <div className="lounge-complete">
            <div className="comp-card">
              <h2>Match Complete</h2>
              <p>{isTeamMode ? `${session.settings?.teamInfo?.[getSortedTeams()[0]]?.tag ? `[${session.settings.teamInfo[getSortedTeams()[0]].tag}]` : TEAM_NAMES[getSortedTeams()[0]]} wins with ${getTeamScore(getSortedTeams()[0])} points!` : `${getSortedPlayers()[0]?.display_name} wins with ${getPlayerScore(getSortedPlayers()[0]?.id)} points!`}</p>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <Button variant="primary" onClick={() => navigator.clipboard.writeText(window.location.href)}>Share Results</Button>
                <Button variant="secondary" onClick={() => router.push("/competitive/mario-kart-8-deluxe")}>Back to Hub</Button>
              </div>
            </div>
          </div>
        )}
      </Container>
    </main>
  );
}
