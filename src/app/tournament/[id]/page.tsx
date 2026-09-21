"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Container, Button, ToastContainer, type ToastProps } from "@empac/cascadeds";
import { ShareToFeedButton } from "@/components/social/ShareToFeedButton";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getImagePath } from "@/lib/images";
import { getGameName } from "@/data/game-registry";
import { DEFAULT_TOURNAMENT_HERO } from "@/data/tournament";
import { getTournamentGameData } from "@/lib/tournaments/gameData";
import { computeStandings, DEFAULT_SCORING_TABLE, type TournamentRace } from "@/lib/tournaments/scoring";
import { computeCrewStandings } from "@/lib/tournaments/crewStandings";
import { bracketChampion, type Bracket } from "@/lib/tournaments/bracket";
import { heatMainsChampion, type HeatMains } from "@/lib/tournaments/heatMains";
import { groupChampion, type GroupBracket } from "@/lib/tournaments/groups";
import { getBrandTheme, brandCssVars } from "@/lib/theme/brand";
import { resolveAccent, resolveAccentOn } from "@/lib/profile/accents";
import { BracketView } from "@/components/tournament/BracketView";
import { HeatMainsView } from "@/components/tournament/HeatMainsView";
import { GroupBracketView } from "@/components/tournament/GroupBracketView";
import { FlightsView } from "@/components/tournament/FlightsView";
import type { FlightsState } from "@/lib/tournaments/flights";
import { GuestJoinCard } from "./GuestJoinCard";
import { isEmailVerified } from "@/lib/auth-utils";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { UserIdentity } from "@/components/profile/UserIdentity";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useViewerTimezone } from "@/hooks/useViewerTimezone";
import { formatEventTime } from "@/lib/time/format";
import { currentRace } from "@/lib/tournaments/races";
import { TournamentRounds } from "@/components/tournament/TournamentRounds";
import { RandomizerNowRacing } from "@/components/tournament/RandomizerNowRacing";
import type { GeneratedRound, LivePointer } from "@/lib/tournaments/randomizer";

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
  scoring_table?: number[] | null;
  format?: string | null;
  bracket?: Bracket | null;
  heat_mains?: HeatMains | null;
  group_bracket?: GroupBracket | null;
  flights?: FlightsState | null;
  header_image_url?: string | null;
  brand_theme?: string | null;
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
  community_id?: string | null;
  users?: { email_verified: boolean } | null;
}

export default function TournamentPage() {
  const params = useParams();
  const tournamentId = params.id as string;
  const { user } = useAuth();
  const supabase = createClient();
  const { trackEvent } = useAnalytics();
  const viewerTz = useViewerTimezone();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [host, setHost] = useState<{ display_name: string | null; username: string | null } | null>(null);
  const [organizerAccent, setOrganizerAccent] = useState<string | null>(null);
  const [presentingCommunity, setPresentingCommunity] = useState<{ slug: string; display_name: string | null } | null>(null);
  const [coHosts, setCoHosts] = useState<{ userId: string; displayName: string; username: string | null }[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [results, setResults] = useState<{ participant_id: string; placement: number | null; points: number | null }[]>([]);
  const [races, setRaces] = useState<TournamentRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  // Multi-crew tournaments — the viewer's crew communities (rep options), which
  // one they're repping here, and names for every community represented (so the
  // crew-standings roll-up can label rows). All guarded so it no-ops pre-migration.
  const [crewOptions, setCrewOptions] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [myRep, setMyRep] = useState<string | null>(null);
  const [communityMeta, setCommunityMeta] = useState<Record<string, { slug: string; name: string }>>({});
  const [savingRep, setSavingRep] = useState(false);
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const dismissToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const pushToast = useCallback((t: Omit<ToastProps, "onClose">) => {
    setToasts((prev) => [...prev.filter((p) => p.id !== t.id), { ...t, onClose: dismissToast }]);
  }, [dismissToast]);

  const loadData = useCallback(async () => {
    const [tRes, pRes, rRes, raceRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
      supabase.from("tournament_participants").select("*, users(email_verified)").eq("tournament_id", tournamentId).order("joined_at"),
      supabase.from("tournament_results").select("participant_id, placement, points").eq("tournament_id", tournamentId),
      supabase.from("tournament_races").select("id, race_number, placements").eq("tournament_id", tournamentId).order("race_number"),
    ]);
    if (tRes.data) setTournament(tRes.data as Tournament);
    // Presenting community (community-organized events). Guarded — community_id
    // is absent pre-migration, so this simply no-ops.
    if ((tRes.data as { community_id?: string | null } | null)?.community_id) {
      const { data: c } = await supabase
        .from("gs_communities")
        .select("slug, display_name")
        .eq("id", (tRes.data as { community_id: string }).community_id)
        .maybeSingle();
      setPresentingCommunity((c as { slug: string; display_name: string | null } | null) ?? null);
    }
    // Host indicator — who's running it (links to their public profile).
    if (tRes.data?.organizer_id) {
      const { data: h } = await supabase.from("users").select("display_name, username, profile_accent").eq("id", tRes.data.organizer_id).maybeSingle();
      setHost((h as { display_name: string | null; username: string | null } | null) ?? null);
      setOrganizerAccent((h as { profile_accent?: string | null } | null)?.profile_accent ?? null);
    }
    // Co-organizers who help run it (public read).
    fetch(`/api/tournament/${tournamentId}/organizers`)
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j.organizers)) setCoHosts(j.organizers.map((o: { userId: string; displayName: string; username: string | null }) => ({ userId: o.userId, displayName: o.displayName, username: o.username }))); })
      .catch(() => {});
    if (pRes.data) setParticipants(pRes.data as Participant[]);
    if (rRes.data) setResults(rRes.data as { participant_id: string; placement: number | null; points: number | null }[]);
    if (raceRes.data) setRaces(raceRes.data as TournamentRace[]);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_races", filter: `tournament_id=eq.${tournamentId}` },
        () => { supabase.from("tournament_races").select("id, race_number, placements").eq("tournament_id", tournamentId).order("race_number").then(({ data }) => { if (data) setRaces(data as TournamentRace[]); }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, loadData]);

  // Claim a guest spot after signup: the soft-signup link lands here with
  // ?claim=<token> once the new user is authenticated → link the guest row to them.
  useEffect(() => {
    if (!user) return;
    const token = new URLSearchParams(window.location.search).get("claim");
    if (!token) return;
    fetch(`/api/tournament/${tournamentId}/claim`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    }).finally(() => {
      // Drop the param + refresh the roster so "You're signed up" reflects.
      const url = new URL(window.location.href);
      url.searchParams.delete("claim");
      window.history.replaceState({}, "", url.toString());
      loadData();
    });
  }, [user, tournamentId, loadData]);

  // The viewer's crew communities + current rep for this tournament (rep picker).
  useEffect(() => {
    // Picker only renders while signed in + participating, so no need to clear
    // on sign-out (avoids a synchronous setState in the effect body).
    if (!user) return;
    fetch(`/api/tournament/${tournamentId}/represent`)
      .then((r) => r.json())
      .then((j) => {
        setCrewOptions(Array.isArray(j.communities) ? j.communities : []);
        setMyRep(j.current ?? null);
      })
      .catch(() => {});
  }, [user, tournamentId]);

  // Names for every community represented among participants (for standings labels).
  useEffect(() => {
    const ids = [...new Set(participants.map((p) => p.community_id).filter((x): x is string => !!x))];
    const missing = ids.filter((id) => !communityMeta[id]);
    if (missing.length === 0) return;
    supabase
      .from("gs_communities")
      .select("id, slug, display_name")
      .in("id", missing)
      .then(({ data }) => {
        if (!data) return;
        setCommunityMeta((prev) => {
          const next = { ...prev };
          for (const c of data as Array<{ id: string; slug: string; display_name: string | null }>) {
            next[c.id] = { slug: c.slug, name: c.display_name || `@${c.slug}` };
          }
          return next;
        });
      });
  }, [participants, communityMeta, supabase]);

  const setRep = async (communityId: string | null) => {
    setSavingRep(true);
    const prev = myRep;
    setMyRep(communityId); // optimistic
    const res = await fetch(`/api/tournament/${tournamentId}/represent`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ communityId }),
    }).catch(() => null);
    setSavingRep(false);
    if (!res || !res.ok) {
      setMyRep(prev); // revert
      pushToast({ id: "rep", variant: "error", title: "Couldn't update", message: "Please try again." });
      return;
    }
    loadData();
    pushToast({
      id: "rep",
      variant: "success",
      title: communityId ? "Representing your crew 🏁" : "Repping solo",
      message: communityId
        ? "Your results count toward your crew's standings."
        : "You're no longer representing a crew here.",
    });
  };

  if (loading) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Loading...</p></div></Container></main>;
  if (!tournament) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Tournament not found.</p></div></Container></main>;

  // Per-game data so character/item art + build tags resolve for MK8DX + MKW.
  const gd = getTournamentGameData(tournament.game_slug);

  const isOrganizer = user?.id === tournament.organizer_id;
  const isCoOrganizer = !!user?.id && coHosts.some((c) => c.userId === user.id);
  const canManage = isOrganizer || isCoOrganizer;
  const myParticipation = participants.find((p) => p.user_id === user?.id);
  const isAccepted = myParticipation?.status === "confirmed" || myParticipation?.status === "checked_in";
  // Organizers + co-organizers always see lobby details (to verify + share).
  const canSeePrivate = canManage || isAccepted || (myParticipation && tournament.acceptance_mode === "auto");
  const isFull = tournament.max_participants ? participants.length >= tournament.max_participants : false;

  const handleJoin = async () => {
    if (!user) return;
    setJoining(true);
    // Pull display name, friend code, and discord from user profile
    const { data: profile } = await supabase
      .from("users")
      .select("display_name, gamertags, gamertag_visibility")
      .eq("id", user.id)
      .single();
    const gamertags = (profile?.gamertags as { nso?: string; discord?: string }) || {};
    // A tournament roster is a shared-with-participants context, so only copy the
    // player's friend code / Discord if their gamertag visibility permits it here.
    // `streamer_only` / `private` withhold them (there's no host-only surface on
    // the public tournament page); `public` / `session_participants` share.
    const vis = (profile?.gamertag_visibility as string) ?? "session_participants";
    const shareTags = vis === "public" || vis === "session_participants";
    const status = tournament.acceptance_mode === "auto" ? "confirmed" : "registered";
    const { error } = await supabase.from("tournament_participants").insert({
      tournament_id: tournamentId,
      user_id: user.id,
      display_name: profile?.display_name || user.user_metadata?.display_name || "Player",
      friend_code: shareTags ? (gamertags.nso || null) : null,
      discord_username: shareTags ? (gamertags.discord || null) : null,
      status,
    });
    setJoining(false);
    if (error) {
      pushToast({
        id: "join",
        variant: "error",
        title: "Couldn't join",
        message: error.message.includes("duplicate")
          ? "You're already signed up for this tournament."
          : "Something went wrong. Please try again.",
      });
      return;
    }
    trackEvent("Tournament Joined");
    pushToast({
      id: "join",
      variant: "success",
      title: tournament.acceptance_mode === "auto" ? "You're in! 🏁" : "Request sent 🏁",
      message:
        tournament.acceptance_mode === "auto"
          ? "You're signed up for this tournament."
          : "Your request to join was sent. You'll get lobby details once the organizer accepts you.",
    });
  };

  const TEAM_HEX = ["#0E75C1", "#C11A10", "#17A710", "#F59E0B", "#8B5CF6", "#EC4899"];
  const isTeamMode = tournament.mode !== "ffa";

  // Standings. Prefer finalized tournament_results; otherwise compute live
  // from the entered races (Phase 2 per-race scoring).
  const finalizedStandings = results
    .map((r) => ({
      participant_id: r.participant_id,
      placement: r.placement,
      points: r.points,
      name: participants.find((p) => p.id === r.participant_id)?.display_name ?? "-",
    }))
    .filter((r) => r.placement != null || r.points != null)
    .sort((a, b) => {
      if (a.placement != null && b.placement != null) return a.placement - b.placement;
      if (a.placement != null) return -1;
      if (b.placement != null) return 1;
      return (b.points ?? 0) - (a.points ?? 0);
    });

  const scoringTable =
    Array.isArray(tournament.scoring_table) && tournament.scoring_table.length
      ? tournament.scoring_table
      : DEFAULT_SCORING_TABLE;
  const liveStandings = computeStandings(
    participants.filter((p) => p.status !== "dropped").map((p) => ({ id: p.id, display_name: p.display_name, team: p.team })),
    races,
    scoringTable,
  )
    .filter((s) => s.racesPlayed > 0)
    .map((s, i) => ({ participant_id: s.participantId, placement: i + 1, points: s.points, name: s.name }));

  const standings = finalizedStandings.length > 0 ? finalizedStandings : liveStandings;

  // Crew (community) standings — roll the individual results up per represented
  // crew. Uses the same result source the individual board does, so it stays in
  // sync. Only shows once ≥2 crews are represented (a single crew isn't a race).
  const crewResultSource = standings.map((s) => ({
    participant_id: s.participant_id,
    placement: s.placement ?? null,
    points: s.points ?? null,
  }));
  const crewStandings = computeCrewStandings(
    participants.map((p) => ({ id: p.id, community_id: p.community_id })),
    crewResultSource,
  );

  // Branding — the organizer's personal accent leads (it's THEIR event); the
  // per-event GS Circuit brand theme falls back. CTAs + the --primary ramp
  // (see .tournament-page in globals.css) follow whichever applies.
  const brand = getBrandTheme(tournament.brand_theme);
  const accentColor = resolveAccent(organizerAccent);
  const accentOn = resolveAccentOn(organizerAccent);
  const brandStyle = {
    ...brandCssVars(brand),
    ...(accentColor ? { ["--profile-accent" as string]: accentColor, ["--profile-accent-on" as string]: accentOn } : {}),
    ["--bg-primary" as string]: accentColor ?? brand.primary,
    ["--text-on-primary" as string]: accentColor ? accentOn : brand.on,
  } as React.CSSProperties;

  return (
    <main className="tournament-page" style={{ paddingTop: 0, paddingBottom: "5rem", background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", minHeight: "100vh", ...brandStyle }}>
      {/* Custom branded header if the organizer set one (GS Circuit), else the
          standard tournament hero — so the page always leads with an image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tournament.header_image_url || DEFAULT_TOURNAMENT_HERO} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block", marginBottom: "1.5rem" }} />
      <Container>
        <div>
          {/* Organizer bar — owner or a co-organizer with edit access. */}
          {canManage && (
            <div className="comp-card" style={{ marginBottom: "1rem", padding: "0.75rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "14px", fontWeight: 600 }}>{isOrganizer ? "You're the organizer" : "You're a co-organizer"}</span>
              <a href={`/tournament/${tournamentId}/manage`}><Button variant="primary" size="small">Manage Tournament</Button></a>
            </div>
          )}

          {/* Hero header — no card, sits on the tinted page */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
              <span className={`lounge-status lounge-status--${tournament.status}`}>{tournament.status.replace("_", " ")}</span>
              <span className="lounge-mode-badge">{tournament.mode.toUpperCase()}</span>
              {tournament.settings?.requireVerified && <span className="verified-badge">Verified Only</span>}
              <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{(tournament.settings?.game_label as string) || getGameName(tournament.game_slug)}</span>
            </div>
            <h1 style={{ fontSize: "2.2rem", fontWeight: 700, marginBottom: "0.6rem" }}>{tournament.title}</h1>
            <div style={{ marginBottom: "0.85rem" }}>
              <ShareToFeedButton
                entityType="tournament"
                entityId={tournament.id}
                title={tournament.title}
                url={`/tournament/${tournament.id}`}
                label="Share to feed"
              />
            </div>
            {presentingCommunity && (
              <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                Presented by{" "}
                <a href={`/c/${presentingCommunity.slug}`} style={{ color: "var(--bg-primary, var(--primary-600))", fontWeight: 700 }}>
                  {presentingCommunity.display_name || presentingCommunity.slug}
                </a>
              </p>
            )}
            {host && (host.display_name || host.username) && (
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "0.6rem" }}>
                {presentingCommunity ? "Run by" : "Hosted by"}{" "}
                {host.username ? (
                  <a href={`/u/${host.username}`} style={{ color: "var(--bg-primary, var(--primary-600))", fontWeight: 600 }}>
                    {host.display_name || host.username}
                  </a>
                ) : (
                  <strong>{host.display_name}</strong>
                )}
                {isOrganizer && <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}> · that&rsquo;s you</span>}
                {coHosts.length > 0 && (
                  <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                    {" "}with{" "}
                    {coHosts.map((c, i) => (
                      <span key={i}>
                        {i > 0 && ", "}
                        {c.username ? <a href={`/u/${c.username}`} style={{ color: "var(--bg-primary, var(--primary-600))", fontWeight: 600 }}>{c.displayName}</a> : <strong style={{ color: "var(--text-secondary)" }}>{c.displayName}</strong>}
                      </span>
                    ))}
                  </span>
                )}
              </p>
            )}
            {tournament.date_time && (
              <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                📅 {formatEventTime(tournament.date_time, viewerTz)}
              </p>
            )}
            {(() => {
              const locType = (tournament.settings?.locationType as string) ?? "online";
              const loc = tournament.settings?.location as string | null | undefined;
              return (
                <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                  {locType === "in_person" ? `📍 ${loc || "In person"}` : "🌐 Online"}
                </p>
              );
            })()}
            {tournament.description && <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "0.75rem", maxWidth: 720 }}>{tournament.description}</p>}
          </div>

          {/* Two-column body — all the content on the left, a sticky sign-up /
              lobby sidebar on the right. */}
          <div className="tournament-layout">
            <div className="tournament-layout__main">

          {/* Details — the shape of the event at a glance so players know what
              they're signing up for. */}
          {(() => {
            const FORMAT_LABEL: Record<string, string> = {
              ffa_points: "Free-for-all · points",
              single_elim: "Single elimination",
              double_elim: "Double elimination",
              heat_mains: "Heat → Mains",
            };
            const fmt = tournament.format ? FORMAT_LABEL[tournament.format] ?? null : null;
            const lobbySize = Number(tournament.settings?.lobbySize ?? 0);
            const advance = Number(tournament.settings?.advance ?? 0);
            const structure = lobbySize > 2 ? `Lobbies of ${lobbySize}${advance ? `, top ${advance} advance` : ""}` : null;
            const spots = tournament.max_participants ? `${participants.length} / ${tournament.max_participants} spots` : `${participants.length} signed up`;
            const reg = tournament.acceptance_mode === "auto" ? "Open · join instantly" : "Approval required";
            const items: { label: string; value: string }[] = [
              ...(fmt ? [{ label: "Format", value: fmt }] : []),
              { label: "Team mode", value: tournament.mode.toUpperCase() },
              ...(structure ? [{ label: "Structure", value: structure }] : []),
              { label: "Registration", value: reg },
              { label: "Spots", value: spots },
            ];
            return (
              <div className="comp-card" style={{ marginBottom: "2rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem" }}>
                  {items.map((it) => (
                    <div key={it.label}>
                      <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: "0.2rem" }}>{it.label}</div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{it.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Randomized rounds — live "Now racing" pointer + the shared per-round
              directive. Reveals + advances push live via the realtime sub above. */}
          {tournament.settings?.randomizer?.enabled && Array.isArray(tournament.settings?.rounds) && (
            <>
              <RandomizerNowRacing
                rounds={tournament.settings.rounds as GeneratedRound[]}
                live={(tournament.settings.randomizerLive ?? null) as LivePointer | null}
              />
              <TournamentRounds rounds={tournament.settings.rounds as GeneratedRound[]} />
            </>
          )}

          {/* Live "Now racing" — the tournament's own real-time board (works with
              or without a stream; rides the existing tournaments realtime sub). */}
          {tournament.status === "in_progress" && (() => {
            const live = currentRace(tournament);
            if (!live.race) return null;
            return (
              <div className="tournament-nowracing">
                {live.race.img ? (
                  <img src={getImagePath(live.race.img)} alt="" className="tournament-nowracing__img" />
                ) : null}
                <div className="tournament-nowracing__body">
                  <span className="tournament-nowracing__eyebrow">🏁 Now racing · {live.index + 1} / {live.total}</span>
                  <span className="tournament-nowracing__name">{live.race.sublabel || live.race.label}</span>
                </div>
                <span className="tournament-nowracing__live">● LIVE</span>
              </div>
            );
          })()}

          {/* Bracket (single elimination) */}
          {tournament.bracket && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "1.2rem" }}>Bracket</h2>
                {bracketChampion(tournament.bracket!) && (
                  <span style={{ fontWeight: 700, fontSize: "15px" }}>
                    🏆 {participants.find((p) => p.id === bracketChampion(tournament.bracket!))?.display_name ?? "Champion"}
                  </span>
                )}
              </div>
              <BracketView
                bracket={tournament.bracket!}
                nameOf={(id) => (id ? participants.find((p) => p.id === id)?.display_name ?? "Unknown" : "TBD")}
              />
            </div>
          )}

          {/* Heat → Mains ladder (read-only) */}
          {tournament.heat_mains && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "1.2rem" }}>Heat → Mains</h2>
                {heatMainsChampion(tournament.heat_mains!) && (
                  <span style={{ fontWeight: 700, fontSize: "15px" }}>
                    🏆 {participants.find((p) => p.id === heatMainsChampion(tournament.heat_mains!))?.display_name ?? "Champion"}
                  </span>
                )}
              </div>
              <HeatMainsView
                hm={tournament.heat_mains!}
                nameOf={(id) => (id ? participants.find((p) => p.id === id)?.display_name ?? "Unknown" : "TBD")}
              />
            </div>
          )}

          {/* Group Knockout ladder (read-only) */}
          {tournament.group_bracket && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "1.2rem" }}>Group Knockout</h2>
                {groupChampion(tournament.group_bracket!) && (
                  <span style={{ fontWeight: 700, fontSize: "15px" }}>
                    🏆 {participants.find((p) => p.id === groupChampion(tournament.group_bracket!))?.display_name ?? "Champion"}
                  </span>
                )}
              </div>
              <GroupBracketView
                gb={tournament.group_bracket!}
                nameOf={(id) => (id ? participants.find((p) => p.id === id)?.display_name ?? "Unknown" : "TBD")}
                readOnly
              />
            </div>
          )}

          {/* Flights board (read-only) */}
          {tournament.flights && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Flights</h2>
              <FlightsView
                state={tournament.flights!}
                nameOf={(id) => (id ? participants.find((p) => p.id === id)?.display_name ?? "Unknown" : "TBD")}
                readOnly
              />
            </div>
          )}

          {/* Final Standings */}
          {standings.length > 0 && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "1.4rem" }}>
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

          {/* Crew Standings — per-community roll-up (multi-crew tournaments) */}
          {crewStandings.length >= 2 && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.4rem" }}>
                <h2 style={{ fontSize: "1.2rem" }}>Crew Standings</h2>
                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Points rolled up per crew</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {crewStandings.map((c, i) => {
                  const rank = i + 1;
                  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                  const meta = communityMeta[c.communityId];
                  return (
                    <div
                      key={c.communityId}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.75rem",
                        padding: "0.5rem 0.75rem", borderRadius: "0.4rem",
                        background: rank <= 3 ? "var(--surface-raised, var(--surface-default))" : "transparent",
                        border: "1px solid var(--border-subtle, var(--border-default))",
                      }}
                    >
                      <span style={{ width: 32, textAlign: "center", fontWeight: 800, fontSize: "15px" }}>{medal ?? rank}</span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: "14px" }}>
                        {meta?.slug ? (
                          <a href={`/c/${meta.slug}`} style={{ color: "var(--bg-primary, var(--primary-600))" }}>{meta.name}</a>
                        ) : (meta?.name ?? "Crew")}
                        <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}> · {c.memberCount} {c.memberCount === 1 ? "player" : "players"}</span>
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-secondary)" }}>{c.points} pts</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Race Settings */}
          {tournament.settings && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "1.4rem" }}>Race Settings</h2>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1.75rem" }}>
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
                <div style={{ marginBottom: "1.75rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.85rem" }}>Active Items</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {tournament.settings.customItems.map((name: string) => {
                      const item = gd?.items.find((i: any) => i.name === name);
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
                <div style={{ marginBottom: "1.75rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.85rem" }}>Track List</span>
                  <div className="tournament-schedule">
                    {tournament.settings.tracks.map((t: any, i: number) => {
                      const isCurrent = tournament.status === "in_progress" && String(i) === (tournament.settings?.currentRaceKey ?? null);
                      return (
                        <div key={i} className={`tournament-schedule__item${isCurrent ? " tournament-schedule__item--current" : ""}`}>
                          <span className="tournament-schedule__num">{isCurrent ? "▶" : i + 1}</span>
                          <img src={getImagePath(t.img)} alt="" className="tournament-schedule__img" />
                          <span className="tournament-schedule__name">{t.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {tournament.settings.trackMode === "open" && (
                <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Tracks will be decided on tournament day.</p>
              )}

              {/* Characters — the full roster so players can see exactly who's in
                  and who's banned, even when everything is opened up. */}
              {gd && gd.characters.length > 0 && (() => {
                const banned = new Set<string>((tournament.settings.bannedCharacters as string[] | undefined) ?? []);
                const allowList = (tournament.settings.allowedCharacters as string[] | undefined) ?? [];
                const allowSet = new Set(allowList);
                const hasAllow = allowList.length > 0;
                const isBanned = (name: string) => banned.has(name) || (hasAllow && !allowSet.has(name));
                const restricted = banned.size > 0 || hasAllow;
                const allowedCount = gd.characters.filter((c) => !isBanned(c.name)).length;
                return (
                  <div style={{ marginBottom: "1.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
                      <span className="account-card__label">Characters</span>
                      <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                        {restricted ? `${allowedCount} of ${gd.characters.length} allowed · faded = banned` : "All characters allowed"}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      {gd.characters.map((c) => {
                        const bannedC = isBanned(c.name);
                        return (
                          <div
                            key={c.name}
                            title={bannedC ? `${c.name} — banned` : c.name}
                            style={{
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 60, padding: "0.35rem 0.25rem",
                              borderRadius: "0.4rem",
                              background: bannedC ? "var(--surface-error, var(--background-secondary))" : "var(--background-secondary)",
                              border: `1px solid ${bannedC ? "var(--error-500, var(--border-default))" : "var(--border-subtle, var(--border-default))"}`,
                              opacity: bannedC ? 0.55 : 1,
                            }}
                          >
                            <img src={getImagePath(c.img)} alt={c.name} style={{ height: 34, width: "auto", filter: bannedC ? "grayscale(1)" : "none" }} />
                            <span style={{ fontSize: "10px", fontWeight: 600, textAlign: "center", lineHeight: 1.15, color: bannedC ? "var(--error-700, var(--text-tertiary))" : "var(--text-secondary)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Build restrictions — call out an open ruleset explicitly too. */}
              {gd
                && !(tournament.settings.allowedWeights && !tournament.settings.allowedWeights.includes("Any"))
                && !(tournament.settings.allowedDrift && !tournament.settings.allowedDrift.includes("Any"))
                && !(tournament.settings.allowedVehicleTypes && !tournament.settings.allowedVehicleTypes.includes("Any"))
                && (
                <div style={{ marginBottom: "1.75rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.35rem" }}>Builds</span>
                  <span className="config-tag">Any build allowed</span>
                </div>
              )}

              {/* Build Notes */}
              {tournament.settings.buildNotes && (
                <div>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.25rem" }}>Build Notes</span>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{tournament.settings.buildNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Rules */}
          {tournament.rules && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "1.4rem" }}>Rules</h2>
              <p style={{ fontSize: "14px", whiteSpace: "pre-wrap", color: "var(--text-secondary)" }}>{tournament.rules}</p>
            </div>
          )}

          {/* Participants */}
          <div className="comp-card" style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.2rem" }}>Participants ({participants.length}{tournament.max_participants ? `/${tournament.max_participants}` : ""})</h2>
            </div>
            {participants.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-tertiary)" }}>
                <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🏁</div>
                <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-secondary)" }}>No users have signed up yet.</p>
                <p style={{ fontSize: "13px" }}>Be the first one to join!</p>
              </div>
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
                            <span className={`lounge-status lounge-status--${p.status === "confirmed" ? "in_progress" : p.status === "checked_in" ? "complete" : "waiting"}`} style={{ fontSize: "10px" }}>{p.status.replace("_", " ")}</span>
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
                          <span className={`lounge-status lounge-status--waiting`} style={{ fontSize: "10px" }}>{p.status.replace("_", " ")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {participants.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.7rem 0.9rem", background: "var(--background-secondary)", borderRadius: "0.25rem" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>{p.user_id ? <UserIdentity userId={p.user_id} name={p.display_name} /> : p.display_name}{p.users?.email_verified && <VerifiedBadge />}</span>
                    <span className={`lounge-status lounge-status--${p.status === "confirmed" ? "in_progress" : p.status === "checked_in" ? "complete" : "waiting"}`} style={{ fontSize: "10px" }}>{p.status.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

            </div>{/* /tournament-layout__main */}

            <aside className="tournament-layout__aside">
          {/* Registration status — always tells the viewer where things stand so
              the sign-up area is never blank (draft / full / in progress / ended). */}
          {tournament.status !== "open" || (isFull && !myParticipation) ? (
            <div className="comp-card" style={{ borderLeft: `4px solid ${tournament.status === "cancelled" ? "var(--error-500)" : "var(--primary-500)"}` }}>
              {tournament.status === "draft" && (
                <>
                  <p style={{ fontSize: "15px", fontWeight: 700, marginBottom: "0.35rem" }}>Registration isn&rsquo;t open yet</p>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    {canManage ? "Move this tournament to “Open for Registration” from Manage to let players sign up." : "Check back soon, or follow the host to hear when sign-ups open."}
                  </p>
                </>
              )}
              {tournament.status === "open" && isFull && !myParticipation && (
                <>
                  <p style={{ fontSize: "15px", fontWeight: 700, marginBottom: "0.35rem" }}>This tournament is full</p>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>All {tournament.max_participants} spots are taken.</p>
                </>
              )}
              {tournament.status === "in_progress" && (
                <>
                  <p style={{ fontSize: "15px", fontWeight: 700, marginBottom: "0.35rem" }}>Registration is closed</p>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>The tournament is underway.</p>
                </>
              )}
              {tournament.status === "complete" && (
                <p style={{ fontSize: "15px", fontWeight: 700 }}>This tournament has ended.</p>
              )}
              {tournament.status === "cancelled" && (
                <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--error-700)" }}>This tournament was cancelled.</p>
              )}
            </div>
          ) : null}

          {/* Join / Already Joined */}
          {user && myParticipation && (
            <div className="comp-card">
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)" }}>You&apos;re signed up for this tournament!</p>
            </div>
          )}

          {/* Rep a crew — signed-in participants who are on a crew pick which
              community they represent; their results roll into its standings. */}
          {user && myParticipation && crewOptions.length > 0 && (
            <div className="comp-card">
              <p style={{ fontSize: "14px", fontWeight: 700, marginBottom: "0.35rem" }}>Representing</p>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                Play for one of your crews and your results count toward its standings.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "13px", cursor: "pointer" }}>
                  <input type="radio" name="crew-rep" checked={!myRep} disabled={savingRep} onChange={() => setRep(null)} />
                  Solo (no crew)
                </label>
                {crewOptions.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "13px", cursor: "pointer" }}>
                    <input type="radio" name="crew-rep" checked={myRep === c.id} disabled={savingRep} onChange={() => setRep(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {user && !myParticipation && tournament.status === "open" && !isFull && (
            // Verification is only required when the organizer opted into
            // "verified only" — otherwise any signed-in player can join
            // (low-friction). Creating a tournament still requires verification.
            tournament.settings?.requireVerified && !isEmailVerified(user) ? (
              <div className="comp-card">
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--warning-700)", marginBottom: "0.5rem" }}>This tournament is verified-players only</p>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "1rem" }}>Verify your email to join. Check your inbox for a confirmation link.</p>
                <Button variant="secondary" size="small" onClick={async () => {
                  const supabase = createClient();
                  await supabase.auth.resend({ type: "signup", email: user.email! });
                }}>Resend Verification Email</Button>
              </div>
            ) : (
              <div className="comp-card">
                <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "1rem" }}>Your display name, friend code, and Discord will be pulled from your profile.</p>
                <Button variant="primary" onClick={handleJoin} disabled={joining}>
                  {joining ? "Joining..." : tournament.acceptance_mode === "auto" ? "Join Tournament" : "Request to Join"}
                </Button>
              </div>
            )
          )}

          {!user && tournament.status === "open" && (
            <GuestJoinCard tournamentId={tournamentId} acceptanceMode={tournament.acceptance_mode} />
          )}

          {/* Pending message */}
          {myParticipation && myParticipation.status === "registered" && tournament.acceptance_mode === "manual" && (
            <div className="comp-card" style={{ borderLeft: "4px solid var(--warning-500)", background: "var(--surface-warning)" }}>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--warning-800)" }}>Your registration is pending approval. You&apos;ll see lobby details once the organizer accepts you.</p>
            </div>
          )}

          {/* Lobby Details (accepted participants + organizer only) */}
          {(() => {
            const lobbyCodes = ((tournament.settings?.lobbyCodes as { label: string; code: string }[] | undefined) ?? []).filter((c) => c.code?.trim());
            if (!canSeePrivate || !(tournament.community_link || tournament.room_code || lobbyCodes.length > 0 || (tournament.friend_codes && tournament.friend_codes.length > 0))) return null;
            return (
            <div className="comp-card" style={{ borderLeft: "4px solid var(--primary-500)" }}>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Lobby Details</h2>
              {tournament.room_code && (
                <div style={{ marginBottom: "1.75rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.25rem" }}>{(tournament.settings?.roomCodeLabel as string | undefined)?.trim() || "Room Code"}</span>
                  <span className="lobby-room-code">{tournament.room_code}</span>
                </div>
              )}
              {lobbyCodes.length > 0 && (
                <div style={{ marginBottom: "1.75rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Lobby codes</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {lobbyCodes.map((c, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.4rem 0.6rem", borderRadius: "0.4rem", background: "var(--background-secondary)" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>{c.label?.trim() || `Lobby ${i + 1}`}</span>
                        <span className="lobby-room-code" style={{ fontSize: "16px" }}>{c.code}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tournament.community_link && (
                <div style={{ marginBottom: "1.75rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.25rem" }}>{tournament.community_name || "Community"}</span>
                  <a href={tournament.community_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary-500)", fontWeight: 600, wordBreak: "break-all" }}>{tournament.community_link}</a>
                </div>
              )}
              {tournament.friend_codes && tournament.friend_codes.length > 0 && (
                <div>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.85rem" }}>Friend Codes</span>
                  {tournament.friend_codes.map((fc, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0", borderBottom: "1px solid var(--background-tertiary)" }}>
                      <span style={{ fontSize: "14px" }}>{fc.name}</span>
                      <span style={{ fontSize: "14px", fontWeight: 600, fontFamily: "monospace" }}>{fc.code}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })()}
            </aside>
          </div>{/* /tournament-layout */}

        </div>
      </Container>
      <ToastContainer toasts={toasts} />
    </main>
  );
}
