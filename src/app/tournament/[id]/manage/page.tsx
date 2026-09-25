"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Container, Button, Input, Accordion, Switch, Select, Modal } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getImagePath } from "@/lib/images";
import { getTournamentGameData, getGameLobbySize } from "@/lib/tournaments/gameData";
import { computeStandings, DEFAULT_SCORING_TABLE, type TournamentRace } from "@/lib/tournaments/scoring";
import { computeCrewStandings } from "@/lib/tournaments/crewStandings";
import { generateSingleElim, generateDoubleElim, reportWinner, bracketChampion, computeBracketPlacements, isPowerOf2, type Bracket } from "@/lib/tournaments/bracket";
import { generateHeatMains, reportHeatResult, reportMainResult, heatMainsStandings, heatMainsStage, heatMainsChampion, type HeatMains } from "@/lib/tournaments/heatMains";
import { generateGroupBracket, reportLobby, clearLobby, groupChampion, computeGroupPlacements, isComplete as isGroupComplete, type GroupBracket, type Bracketing } from "@/lib/tournaments/groups";
import { BracketView } from "@/components/tournament/BracketView";
import { HeatMainsView } from "@/components/tournament/HeatMainsView";
import { GroupBracketView } from "@/components/tournament/GroupBracketView";
import { FlightsView } from "@/components/tournament/FlightsView";
import { generateFlights, reportFlightRace, fillFlightRaces, clearFlightRace, setFlightPoints, flightStandings, isFlightsComplete, computeFlightPlacements, placementsWithTies, flightTies, describeFlights, type FlightsState, type RacePlacements } from "@/lib/tournaments/flights";

import { resolveOrganizerRole, canAdministerTournament } from "@/lib/tournaments/access";
import { BRAND_THEMES } from "@/lib/theme/brand";
import { BannerEditModal } from "@/components/account/BannerEditModal";
import { SortableTrackList } from "@/components/tournament/SortableTrackList";
import { TournamentRandomizerCard } from "@/components/tournament/TournamentRandomizerCard";
import type { LivePointer } from "@/lib/tournaments/randomizer";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useViewerTimezone } from "@/hooks/useViewerTimezone";
import { formatEventTime } from "@/lib/time/format";
import { listRaces, raceIndex } from "@/lib/tournaments/races";
import { AttendeeTable } from "@/components/events/AttendeeTable";
import { TicketingManager } from "@/components/events/TicketingManager";
import { PlaceMedal } from "@/components/tournament/PlaceMedal";
import { IconTrophy, IconSparkles, IconScale, IconDice5 } from "@tabler/icons-react";

/** UTC ISO → a `datetime-local` value in the organizer's local wall clock. */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  scoring_table?: number[] | null;
  format?: string | null;
  bracket?: Bracket | null;
  heat_mains?: HeatMains | null;
  group_bracket?: GroupBracket | null;
  flights?: FlightsState | null;
  header_image_url?: string | null;
  brand_theme?: string | null;
  championship_id?: string | null;
  event_number?: number | null;
}

interface CoOrganizer {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
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
  const viewerTz = useViewerTimezone();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [localRoomCode, setLocalRoomCode] = useState("");
  const [localRoomLabel, setLocalRoomLabel] = useState("");
  // Named per-lobby room codes (multi-flight / multi-lobby events).
  const [lobbyCodes, setLobbyCodes] = useState<{ label: string; code: string }[]>([]);
  const [results, setResults] = useState<Record<string, { placement: number | null; points: number | null }>>({});
  // Lobby-size "Custom" toggle + draft (committed on blur so we don't re-seed
  // on every keystroke).
  const [lobbyCustom, setLobbyCustom] = useState(false);
  const [lobbyDraft, setLobbyDraft] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMode, setInviteMode] = useState<"user" | "email">("user");
  // Once the event is running, the organizer flips between a run-focused
  // Dashboard and the full Settings, so the live view isn't cluttered.
  const [view, setView] = useState<"dashboard" | "settings">("dashboard");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<{ id: string; username: string | null; display_name: string; avatar_url: string | null }[]>([]);
  const [userSearchBusy, setUserSearchBusy] = useState(false);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  const [coOrganizers, setCoOrganizers] = useState<CoOrganizer[]>([]);
  const [coUsername, setCoUsername] = useState("");
  const [coBusy, setCoBusy] = useState(false);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [headerEditSrc, setHeaderEditSrc] = useState<string | null>(null);
  const headerFileRef = useRef<HTMLInputElement | null>(null);
  // Big-screen display customization (settings.display) — subtitle edited locally,
  // committed on blur; accent commits on click.
  const [displaySubtitle, setDisplaySubtitle] = useState("");
  const [races, setRaces] = useState<TournamentRace[]>([]);
  const [raceEntry, setRaceEntry] = useState<Record<string, string>>({});
  // Tap-to-place race entry: an ordered list of player ids (1st tapped = 1st).
  const [raceTap, setRaceTap] = useState<string[]>([]);
  const [raceInputMode, setRaceInputMode] = useState<"tap" | "type">("tap");
  const [hmSeries, setHmSeries] = useState(2);
  const [hmHeatSize, setHmHeatSize] = useState<number | "auto">("auto");
  const [guestName, setGuestName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [scheduleInput, setScheduleInput] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [raceBusy, setRaceBusy] = useState(false);
  // Multi-crew tournaments — names for the communities represented among
  // participants (for the dashboard crew-standings roll-up labels). Guarded so
  // it no-ops for regular (non-crew) tournaments + pre-migration.
  const [communityMeta, setCommunityMeta] = useState<Record<string, { slug: string; name: string }>>({});
  // Organizer crew management — search communities to add as crews + assign.
  const [crewQuery, setCrewQuery] = useState("");
  const [crewResults, setCrewResults] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [crewSearchBusy, setCrewSearchBusy] = useState(false);
  const toast = useToast();
  const roomCodeTimer = useRef<NodeJS.Timeout>(undefined);
  const savedTimer = useRef<NodeJS.Timeout>(undefined);
  const flashSaved = () => {
    setSavedFlash(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1500);
  };

  const loadRoster = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/organizers`);
    const j = await res.json().catch(() => ({}));
    if (Array.isArray(j.organizers)) setCoOrganizers(j.organizers as CoOrganizer[]);
    return (j.organizers ?? []) as CoOrganizer[];
  }, [tournamentId]);

  const loadData = useCallback(async () => {
    const [tRes, pRes, rRes, raceRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
      supabase.from("tournament_participants").select("*, users(email_verified)").eq("tournament_id", tournamentId).order("joined_at"),
      supabase.from("tournament_results").select("participant_id, placement, points").eq("tournament_id", tournamentId),
      supabase.from("tournament_races").select("*").eq("tournament_id", tournamentId).order("race_number"),
      loadRoster(),
    ]);
    if (tRes.data) {
      setTournament(tRes.data as Tournament);
      setLocalRoomCode(tRes.data.room_code || "");
      setLocalRoomLabel((tRes.data.settings?.roomCodeLabel as string | undefined) || "");
      setLobbyCodes((tRes.data.settings?.lobbyCodes as { label: string; code: string }[] | undefined) ?? []);
      setDisplaySubtitle(((tRes.data.settings?.display as { subtitle?: string } | undefined)?.subtitle) || "");
    }
    if (pRes.data) setParticipants(pRes.data as Participant[]);
    if (rRes.data) {
      const map: Record<string, { placement: number | null; points: number | null }> = {};
      for (const r of rRes.data as { participant_id: string; placement: number | null; points: number | null }[]) {
        map[r.participant_id] = { placement: r.placement, points: r.points };
      }
      setResults(map);
    }
    if (raceRes.data) setRaces(raceRes.data as TournamentRace[]);
    setLoading(false);
  }, [tournamentId, loadRoster]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel(`manage-tournament-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter: `tournament_id=eq.${tournamentId}` },
        () => { supabase.from("tournament_participants").select("*, users(email_verified)").eq("tournament_id", tournamentId).order("joined_at").then(({ data }) => { if (data) setParticipants(data as Participant[]); }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, loadData]);

  // Keep the schedule editor in sync with the stored time (also re-syncs after a
  // successful reschedule updates local state). Must stay above the early
  // returns below so hook order is stable across renders.
  useEffect(() => {
    if (tournament?.date_time) setScheduleInput(toDatetimeLocal(tournament.date_time));
  }, [tournament?.date_time]);

  // Debounced userbase search for the "Invite user" path.
  useEffect(() => {
    const q = userQuery.trim();
    if (q.length < 2) { setUserResults([]); setUserSearchBusy(false); return; }
    setUserSearchBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/tournament/${tournamentId}/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => setUserResults(Array.isArray(j.results) ? j.results : []))
        .catch(() => setUserResults([]))
        .finally(() => setUserSearchBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [userQuery, tournamentId]);

  // Names for every crew (community) represented among participants AND every
  // crew the organizer has configured (so the pick-list + roll-up label them).
  useEffect(() => {
    const configured = (tournament?.settings?.crewCommunityIds as string[] | undefined) ?? [];
    const ids = [...new Set([
      ...participants.map((p) => p.community_id).filter((x): x is string => !!x),
      ...configured,
    ])];
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
  }, [participants, communityMeta, supabase, tournament?.settings?.crewCommunityIds]);

  // Debounced community search for adding crews to a multi-crew tournament.
  useEffect(() => {
    const q = crewQuery.trim();
    if (q.length < 2) { setCrewResults([]); setCrewSearchBusy(false); return; }
    setCrewSearchBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/tournament/${tournamentId}/crews?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => setCrewResults(Array.isArray(j.results) ? j.results : []))
        .catch(() => setCrewResults([]))
        .finally(() => setCrewSearchBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [crewQuery, tournamentId]);

  // Keep the crew-standings OBS overlay live: whenever results/races change on a
  // running multi-crew tournament, recompute + rebroadcast (server-side, debounced).
  // Gated on ≥2 crews so regular tournaments never hit the endpoint.
  useEffect(() => {
    if (!user || !tournament) return;
    if (tournament.status !== "in_progress" && tournament.status !== "complete") return;
    if (new Set(participants.map((p) => p.community_id).filter(Boolean)).size < 2) return;
    const t = setTimeout(() => {
      fetch(`/api/tournament/${tournamentId}/crew-overlay`, { method: "POST" }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [user, tournament, participants, results, races, tournamentId]);

  if (loading) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Loading...</p></div></Container></main>;
  const myRole = resolveOrganizerRole({
    userId: user?.id,
    organizerId: tournament?.organizer_id,
    coOrganizerIds: coOrganizers.map((c) => c.userId),
  });
  if (!tournament || !myRole) return <main style={{ paddingTop: "3rem" }}><Container><div className="comp-card"><p>Not authorized.</p></div></Container></main>;
  const isOwner = canAdministerTournament(myRole);

  // Per-game data (tracks, characters, items, build filters) so the config
  // surface works for both MK8DX and Mario Kart World.
  const gd = getTournamentGameData(tournament.game_slug);

  // Live standings from entered races (Phase 2 scoring).
  const scoringTable =
    Array.isArray(tournament.scoring_table) && tournament.scoring_table.length
      ? tournament.scoring_table
      : DEFAULT_SCORING_TABLE;
  const liveStandings = computeStandings(
    participants.filter((p) => p.status !== "dropped"),
    races,
    scoringTable,
  );

  // Crew (community) standings — roll the run's results up per represented crew.
  // Prefer finalized results, else the live per-race board (same precedence the
  // public page + overlay use). Only meaningful once ≥2 crews are represented.
  const finalizedResults = Object.entries(results)
    .map(([participant_id, r]) => ({ participant_id, placement: r.placement, points: r.points }))
    .filter((r) => r.placement != null || r.points != null);
  const crewResultSource = finalizedResults.length > 0
    ? finalizedResults
    : liveStandings.map((s, i) => ({ participant_id: s.participantId, placement: i + 1, points: s.points }));
  const crewStandings = computeCrewStandings(
    participants.map((p) => ({ id: p.id, community_id: p.community_id })),
    crewResultSource,
  );

  const updateTournament = async (updates: Partial<Tournament>) => {
    await supabase.from("tournaments").update(updates).eq("id", tournamentId);
    setTournament((prev) => prev ? { ...prev, ...updates } as Tournament : prev);
    flashSaved();
    // Location changed → refresh coords for the events browser (best effort).
    if (updates.settings && ("location" in updates.settings || "locationType" in updates.settings)) {
      void fetch(`/api/tournament/${tournamentId}/geocode`, { method: "POST" }).catch(() => {});
    }
  };

  // Lobby codes — edit locally, commit the whole list to settings on blur / add / remove.
  const commitLobbyCodes = (next: { label: string; code: string }[]) => {
    setLobbyCodes(next);
    void updateTournament({ settings: { ...tournament.settings, lobbyCodes: next } });
  };
  const addLobbyCode = () => commitLobbyCodes([...lobbyCodes, { label: "", code: "" }]);
  const removeLobbyCode = (i: number) => commitLobbyCodes(lobbyCodes.filter((_, idx) => idx !== i));
  const editLobbyCode = (i: number, patch: Partial<{ label: string; code: string }>) =>
    setLobbyCodes((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const addCoOrganizer = async () => {
    const username = coUsername.trim().replace(/^@/, "");
    if (!username) return;
    setCoBusy(true);
    const res = await fetch(`/api/tournament/${tournamentId}/organizers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const j = await res.json().catch(() => ({}));
    setCoBusy(false);
    if (Array.isArray(j.organizers)) {
      setCoOrganizers(j.organizers as CoOrganizer[]);
      setCoUsername("");
      toast.success(`@${username} can now help manage this tournament.`, { title: "Co-organizer added" });
    } else {
      toast.error(j.error || "Could not add co-organizer.");
    }
  };

  const inviteUser = async (u: { id: string; display_name: string }) => {
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "tournament", targetId: tournamentId, targetName: tournament.title, link: `/tournament/${tournamentId}`, inviteeIds: [u.id] }),
    });
    if (res.ok) {
      setInvitedIds((prev) => [...prev, u.id]);
      toast.success(`Invited ${u.display_name}.`);
    } else {
      toast.error("Could not send invite.");
    }
  };

  const removeCoOrganizer = async (userId: string) => {
    setCoBusy(true);
    const res = await fetch(`/api/tournament/${tournamentId}/organizers?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setCoBusy(false);
    if (Array.isArray(j.organizers)) setCoOrganizers(j.organizers as CoOrganizer[]);
    else toast.error(j.error || "Could not remove co-organizer.");
  };

  // Time change + cancel go through the server so participants get emailed +
  // notified. (Other fields auto-save client-side; these have side effects.)
  const rescheduleTournament = async () => {
    if (!scheduleInput) return;
    setScheduleBusy(true);
    const res = await fetch(`/api/tournament/${tournamentId}/schedule-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reschedule", dateTime: new Date(scheduleInput).toISOString() }),
    });
    const j = await res.json().catch(() => ({}));
    setScheduleBusy(false);
    if (j.ok) {
      setTournament((prev) => prev ? { ...prev, date_time: j.dateTime } as Tournament : prev);
      toast.success(j.reached ? `${j.reached} participant${j.reached === 1 ? "" : "s"} notified.` : "Saved.", { title: "Time updated" });
    } else {
      toast.error(j.error || "Please try again.", { title: "Couldn't update time" });
    }
  };

  const cancelTournament = async () => {
    if (!window.confirm("Cancel this tournament? Everyone signed up will be emailed and notified.")) return;
    setScheduleBusy(true);
    const res = await fetch(`/api/tournament/${tournamentId}/schedule-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const j = await res.json().catch(() => ({}));
    setScheduleBusy(false);
    if (j.ok) {
      setTournament((prev) => prev ? { ...prev, status: "cancelled" } as Tournament : prev);
      toast.success(j.reached ? `${j.reached} participant${j.reached === 1 ? "" : "s"} notified.` : "Done.", { title: "Tournament cancelled" });
    } else {
      toast.error(j.error || "Please try again.", { title: "Couldn't cancel" });
    }
  };

  // Current-race pointer → broadcasts to the overlay, /live, and chat.
  const setRace = async (body: { action: "set"; key: string | null } | { action: "next" | "prev" }) => {
    setRaceBusy(true);
    const res = await fetch(`/api/tournament/${tournamentId}/current-race`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setRaceBusy(false);
    if (j.ok) {
      setTournament((prev) => prev ? { ...prev, settings: { ...prev.settings, currentRaceKey: j.key } } as Tournament : prev);
      toast.success(j.race ? `Now: ${j.race.sublabel || j.race.label}` : "Cleared.", { title: "Current race updated" });
    } else {
      toast.error(j.error || "Please try again.", { title: "Couldn't update race" });
    }
  };

  // A freed seat promotes the longest-waiting attendee (server decides; best effort).
  const promoteWaitlist = () =>
    fetch(`/api/events/tournament/${tournamentId}/attendees/promote`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.promoted) void loadData(); })
      .catch(() => {});

  const updateParticipant = async (participantId: string, updates: Partial<Participant>) => {
    await supabase.from("tournament_participants").update(updates).eq("id", participantId);
    setParticipants((prev) => prev.map((p) => p.id === participantId ? { ...p, ...updates } as Participant : p));
    if (updates.status === "dropped") void promoteWaitlist();
  };

  const removeParticipant = async (participantId: string) => {
    await supabase.from("tournament_participants").delete().eq("id", participantId);
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
    void promoteWaitlist();
  };

  // --- Multi-crew: the organizer's configured crew pick-list + assignment ---
  const crewIds = (tournament.settings?.crewCommunityIds as string[] | undefined) ?? [];

  const addCrew = async (c: { id: string; slug: string; name: string }) => {
    if (crewIds.includes(c.id)) { setCrewQuery(""); setCrewResults([]); return; }
    setCommunityMeta((prev) => ({ ...prev, [c.id]: { slug: c.slug, name: c.name } }));
    await updateTournament({ settings: { ...tournament.settings, crewCommunityIds: [...crewIds, c.id] } });
    setCrewQuery("");
    setCrewResults([]);
  };

  const removeCrew = async (communityId: string) => {
    await updateTournament({ settings: { ...tournament.settings, crewCommunityIds: crewIds.filter((x) => x !== communityId) } });
  };

  // Assign (or clear) a participant's crew. Optimistic; the server also
  // rebroadcasts the overlay scoreboard.
  const assignCrew = async (participantId: string, communityId: string | null) => {
    setParticipants((prev) => prev.map((p) => p.id === participantId ? { ...p, community_id: communityId } as Participant : p));
    await fetch(`/api/tournament/${tournamentId}/crews`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId, communityId }),
    }).catch(() => {});
  };

  // Guest entrant — organizer adds a player who has no GS account (user_id
  // null; schema + organizer RLS allow it). Pre-confirmed since the organizer
  // is vouching for them.
  const addGuest = async () => {
    const name = guestName.trim();
    if (!name) return;
    // Respect the entry cap — the same limit the public join enforces.
    const cap = tournament?.max_participants ?? null;
    if (cap) {
      const current = participants.filter((p) => p.status !== "dropped").length;
      if (current >= cap) {
        toast.error(`This tournament is capped at ${cap} ${cap === 1 ? "entry" : "entries"}. Raise the max in Settings to add more.`, { title: "Roster full" });
        return;
      }
    }
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

  // The randomized race currently live (for binding scored races to it).
  // Resolved inline from settings so we don't pull the randomizer lib's game
  // data into this bundle.
  const currentRandomizerRace = (): { round: number; race: number; track: unknown; combo: unknown; items: unknown } | null => {
    const s = (tournament?.settings ?? {}) as Record<string, any>;
    if (!s.randomizer?.enabled || !s.randomizerLive || !Array.isArray(s.rounds)) return null;
    const live = s.randomizerLive as { round: number; race: number };
    const round = (s.rounds as any[]).find((r) => r.n === live.round && r.revealed);
    if (!round) return null;
    const total = Math.max(1, round.directive?.tracks?.length ?? 1);
    const i = Math.max(0, Math.min(live.race - 1, total - 1));
    const track = round.directive?.tracks?.[i] ?? null;
    const combo = round.directive?.raceCombos?.[i] ?? round.directive?.combo ?? null;
    return { round: round.n, race: live.race, track, combo, items: round.directive?.items ?? null };
  };

  // ---- Phase 2 per-race scoring ----
  const addRace = async () => {
    const placements: Record<string, number> = {};
    if (raceInputMode === "tap") {
      raceTap.forEach((pid, i) => { placements[pid] = i + 1; });
    } else {
      for (const [pid, val] of Object.entries(raceEntry)) {
        const pos = Number(val);
        if (val !== "" && Number.isFinite(pos) && pos > 0) placements[pid] = pos;
      }
    }
    if (Object.keys(placements).length === 0) return;
    const raceNumber = (races[races.length - 1]?.race_number ?? 0) + 1;
    // If a randomized round is live, bind this scored race to it (round + a
    // directive snapshot of what was actually played).
    const cur = currentRandomizerRace();
    const base = { tournament_id: tournamentId, race_number: raceNumber, placements };
    const withBind = cur ? { ...base, round_number: cur.round, directive: { track: cur.track, combo: cur.combo, items: cur.items } } : base;
    let res = await supabase.from("tournament_races").insert(withBind).select("*").single();
    if (res.error && cur) {
      // Columns not migrated yet → fall back to the unbound insert.
      res = await supabase.from("tournament_races").insert(base).select("*").single();
    }
    if (res.data) setRaces((prev) => [...prev, res.data as TournamentRace]);
    setRaceEntry({});
    setRaceTap([]);
    flashSaved();
    // If a randomized round is live, advance the "Now racing" pointer so the
    // public page + display move to the next race automatically (one-tap flow).
    // Fire-and-forget: the tournaments realtime sub reflects the new pointer;
    // silently no-ops if not Circuit-entitled.
    if (cur) {
      fetch(`/api/tournament/${tournamentId}/randomizer`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "advance" }),
      }).catch(() => {});
    }
  };
  const toggleRaceTap = (pid: string) => {
    setRaceTap((prev) => (prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]));
  };

  const removeRace = async (id: string) => {
    await supabase.from("tournament_races").delete().eq("id", id);
    setRaces((prev) => prev.filter((r) => r.id !== id));
    flashSaved();
  };

  // Snapshot the live standings into tournament_results (the permanent record
  // the public standings + recaps read). Placement = rank, points = total.
  const finalizeStandings = async () => {
    const map: Record<string, { placement: number | null; points: number | null }> = {};
    // Tie-aware: players level on points share a placement (1, 2, 2, 4).
    const placeMap = new Map(
      placementsWithTies(liveStandings.map((s) => ({ participantId: s.participantId, points: s.points }))).map((p) => [p.participantId, p.placement]),
    );
    for (const row of liveStandings) {
      const placement = placeMap.get(row.participantId) ?? null;
      await supabase.from("tournament_results").upsert(
        {
          tournament_id: tournamentId,
          participant_id: row.participantId,
          placement,
          points: row.points,
          team: row.team,
        },
        { onConflict: "tournament_id,participant_id" },
      );
      map[row.participantId] = { placement, points: row.points };
    }
    setResults(map);
    toast.success("Standings saved");
  };

  // ---- Phase 3 bracket (single + double elim) ----
  // Elimination formats carry a lobby-size lever (settings.lobbySize): 2 = the
  // classic 1v1 bracket; > 2 runs lobbies of N through the group engine.
  const isElim = tournament.format === "single_elim" || tournament.format === "double_elim";
  const isDoubleElim = tournament.format === "double_elim";
  const elimLobbySize = Number(tournament.settings?.lobbySize) || 2;
  const elimAdvance = Number(tournament.settings?.advance) || 1;
  const useLobbies = isElim && elimLobbySize > 2;
  const isBracketFormat = isElim && !useLobbies; // classic 1v1 path
  // Points scoring (FFA/points, and legacy rows with no format) — the only path
  // that records per-race placements/points. Elim + Heat→Mains resolve results
  // from their own boards, so their scoring tables stay hidden.
  const isPoints = !isElim && tournament.format !== "heat_mains";
  // Dashboard vs Settings split — only splits once the event is running; before
  // that (draft/open) everything shows so the organizer can set it all up.
  const isRunning = tournament.status === "in_progress" || tournament.status === "complete";
  const showDashboard = !isRunning || view === "dashboard";
  const showSettings = !isRunning || view === "settings";
  const nameOf = (id: string | null) => (id ? participants.find((p) => p.id === id)?.display_name ?? "Unknown" : "TBD");
  const eligibleForBracket = participants.filter((p) => p.status === "confirmed" || p.status === "checked_in");
  // Double elim v1 requires a power-of-2 count (byes are a v2 refinement).
  const canGenerateBracket = isDoubleElim ? isPowerOf2(eligibleForBracket.length) : eligibleForBracket.length >= 2;

  const generateBracket = async (mode: "standings" | "checkin" | "random") => {
    const ordered = [...eligibleForBracket];
    if (mode === "standings") {
      const rank = new Map(liveStandings.map((s, i) => [s.participantId, i]));
      ordered.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    } else if (mode === "random") {
      ordered.sort(() => Math.random() - 0.5);
    } // "checkin" keeps joined_at order
    const ids = ordered.map((p) => p.id);
    if (!canGenerateBracket) return;
    const bracket = isDoubleElim ? generateDoubleElim(ids) : generateSingleElim(ids);
    await updateTournament({ bracket });
  };

  const reportMatchWinner = async (matchId: string, winnerId: string) => {
    if (!tournament.bracket) return;
    await updateTournament({ bracket: reportWinner(tournament.bracket, matchId, winnerId) });
  };

  // Snapshot bracket placements into tournament_results (feeds the public
  // standings + recap). Champion 1st, then by how far each player advanced.
  const finalizeBracketPlacements = async () => {
    if (!tournament.bracket || finalizing) return;
    setFinalizing(true);
    try {
      const map: Record<string, { placement: number | null; points: number | null }> = {};
      for (const { participantId, placement } of computeBracketPlacements(tournament.bracket)) {
        await supabase.from("tournament_results").upsert(
          {
            tournament_id: tournamentId,
            participant_id: participantId,
            placement,
            points: null,
            team: participants.find((p) => p.id === participantId)?.team ?? null,
          },
          { onConflict: "tournament_id,participant_id" },
        );
        map[participantId] = { placement, points: null };
      }
      setResults(map);
      toast.success("Standings saved");
    } finally {
      setFinalizing(false);
    }
  };

  // ---- Heat → Mains (consi ladder) ----
  const isHeatMains = tournament.format === "heat_mains";
  const hm = (tournament.heat_mains as HeatMains | null) ?? null;
  const seedHeatMains = async () => {
    const ids = eligibleForBracket.map((p) => p.id);
    if (ids.length < 2) return;
    await updateTournament({ heat_mains: generateHeatMains(ids, { series: hmSeries, heatSize: hmHeatSize === "auto" ? undefined : hmHeatSize }) });
  };
  const reportHeat = async (heatId: string, order: string[], dq: string[]) => {
    if (!hm) return;
    await updateTournament({ heat_mains: reportHeatResult(hm, heatId, order, dq) });
  };
  const reportMain = async (tier: number, order: string[], dq: string[]) => {
    if (!hm) return;
    await updateTournament({ heat_mains: reportMainResult(hm, tier, order, dq) });
  };
  const finalizeHeatMains = async () => {
    if (!hm || finalizing) return;
    setFinalizing(true);
    try {
      const map: Record<string, { placement: number | null; points: number | null }> = {};
      for (const { participantId, placement } of heatMainsStandings(hm)) {
        await supabase.from("tournament_results").upsert(
          { tournament_id: tournamentId, participant_id: participantId, placement, points: null, team: participants.find((p) => p.id === participantId)?.team ?? null },
          { onConflict: "tournament_id,participant_id" },
        );
        map[participantId] = { placement, points: null };
      }
      setResults(map);
      toast.success("Results saved");
    } finally {
      setFinalizing(false);
    }
  };

  // ---- Group (lobby) bracket — the elim formats when lobbySize > 2 ----
  const isGroupFormat = useLobbies;
  const gb = (tournament.group_bracket as GroupBracket | null) ?? null;
  const groupRules = {
    lobbySize: elimLobbySize,
    advance: elimAdvance,
    bracketing: (isDoubleElim ? "double" : "single") as Bracketing,
    // Default true; only meaningful for double elim.
    grandFinal: tournament.settings?.grandFinal !== false,
  } as const;
  // Lobby reporting: "advance" (tap who moves on) or "placement" (tap full order
  // everywhere, for points/standings).
  const lobbyPlacementMode = tournament.settings?.lobbyReporting === "placement";
  const seedGroup = async (mode: "standings" | "checkin" | "random") => {
    const ordered = [...eligibleForBracket];
    if (mode === "standings") {
      const rank = new Map(liveStandings.map((s, i) => [s.participantId, i]));
      ordered.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    } else if (mode === "random") {
      ordered.sort(() => Math.random() - 0.5);
    }
    const ids = ordered.map((p) => p.id);
    if (ids.length < 2) return;
    await updateTournament({ group_bracket: generateGroupBracket(ids, groupRules) });
  };
  const reportGroupLobby = async (lobbyId: string, order: string[]) => {
    if (!gb) return;
    await updateTournament({ group_bracket: reportLobby(gb, lobbyId, order) });
  };
  const clearGroupLobby = async (lobbyId: string) => {
    if (!gb) return;
    await updateTournament({ group_bracket: clearLobby(gb, lobbyId) });
  };
  const finalizeGroupPlacements = async () => {
    if (!gb || finalizing) return;
    setFinalizing(true);
    try {
      const map: Record<string, { placement: number | null; points: number | null }> = {};
      for (const { participantId, placement } of computeGroupPlacements(gb)) {
        await supabase.from("tournament_results").upsert(
          { tournament_id: tournamentId, participant_id: participantId, placement, points: null, team: participants.find((p) => p.id === participantId)?.team ?? null },
          { onConflict: "tournament_id,participant_id" },
        );
        map[participantId] = { placement, points: null };
      }
      setResults(map);
      toast.success("Standings saved");
    } finally {
      setFinalizing(false);
    }
  };

  // ---- Flights (multi-flight points for large fields) ----
  const useFlights = isPoints && tournament.settings?.useFlights === true;
  const fl = (tournament.flights as FlightsState | null) ?? null;
  const flightRules = {
    flightSize: Number(tournament.settings?.flightSize) || 12,
    rounds: Number(tournament.settings?.flightRounds) || 3,
    racesPerRound: Number(tournament.settings?.racesPerRound) || 4,
    reseed: (tournament.settings?.flightReseed === "snake" ? "snake" : "standings") as "snake" | "standings",
    scoreTable: scoringTable,
  };
  const seedFlights = async (mode: "standings" | "checkin" | "random") => {
    const ordered = [...eligibleForBracket];
    if (mode === "standings") {
      const rank = new Map(liveStandings.map((s, i) => [s.participantId, i]));
      ordered.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    } else if (mode === "random") {
      ordered.sort(() => Math.random() - 0.5);
    }
    const ids = ordered.map((p) => p.id);
    if (ids.length < 2) return;
    await updateTournament({ flights: generateFlights(ids, flightRules) });
  };
  const doReportFlightRace = async (flightId: string, placements: RacePlacements) => {
    if (!fl) return;
    await updateTournament({ flights: reportFlightRace(fl, flightId, placements) });
  };
  const doFillFlightRaces = async (flightId: string, placements: RacePlacements) => {
    if (!fl) return;
    await updateTournament({ flights: fillFlightRaces(fl, flightId, placements) });
  };
  const doClearFlightRace = async (flightId: string, raceIdx: number) => {
    if (!fl) return;
    await updateTournament({ flights: clearFlightRace(fl, flightId, raceIdx) });
  };
  const overrideFlightPoints = async (participantId: string, points: number | null) => {
    if (!fl) return;
    await updateTournament({ flights: setFlightPoints(fl, participantId, points) });
  };
  const finalizeFlights = async () => {
    if (!fl || finalizing) return;
    setFinalizing(true);
    try {
      const map: Record<string, { placement: number | null; points: number | null }> = {};
      const pts = new Map(flightStandings(fl).map((s) => [s.participantId, s.points]));
      for (const { participantId, placement } of computeFlightPlacements(fl)) {
        const points = pts.get(participantId) ?? null;
        await supabase.from("tournament_results").upsert(
          { tournament_id: tournamentId, participant_id: participantId, placement, points, team: participants.find((p) => p.id === participantId)?.team ?? null },
          { onConflict: "tournament_id,participant_id" },
        );
        map[participantId] = { placement, points };
      }
      setResults(map);
      toast.success("Standings saved");
    } finally {
      setFinalizing(false);
    }
  };

  // ---- Tournament setup editing (change type/rules without recreating) ----
  const SETUP_FORMATS: { value: string; label: string }[] = [
    { value: "ffa_points", label: "FFA / Points" },
    { value: "single_elim", label: "Single Elim" },
    { value: "double_elim", label: "Double Elim" },
    { value: "heat_mains", label: "Heat → Mains" },
  ];
  const SETUP_MODES: { value: string; label: string }[] = [
    { value: "ffa", label: "FFA" },
    { value: "2v2", label: "2v2" },
    { value: "3v3", label: "3v3" },
    { value: "4v4", label: "4v4" },
    { value: "6v6", label: "6v6" },
  ];
  const hasRunState = !!(tournament.bracket || tournament.heat_mains || tournament.group_bracket || tournament.flights);
  const setupLocked = tournament.status === "complete" || tournament.status === "cancelled";
  // Changing format tears down any generated run state so it can be re-seeded.
  const changeFormat = async (fmt: string) => {
    if (fmt === tournament.format) return;
    await updateTournament({ format: fmt, bracket: null, heat_mains: null, group_bracket: null, flights: null });
  };
  const changeMode = async (m: string) => {
    if (m !== tournament.mode) await updateTournament({ mode: m });
  };
  // ---- Page branding (GS Circuit) ----
  const uploadHeader = async (blob: Blob) => {
    setHeaderBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "header.jpg");
      const res = await fetch(`/api/tournament/${tournamentId}/header`, { method: "POST", body: fd });
      const d = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.ok && d?.url) {
        setTournament((prev) => (prev ? { ...prev, header_image_url: d.url ?? null } : prev));
        toast.success("Header image updated");
      } else toast.error(d?.error || "Couldn't upload the image.");
    } catch {
      toast.error("Couldn't upload the image.");
    } finally {
      setHeaderBusy(false);
    }
  };
  const removeHeader = async () => {
    setHeaderBusy(true);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/header`, { method: "DELETE" });
      if (res.ok) {
        setTournament((prev) => (prev ? { ...prev, header_image_url: null } : prev));
        toast.success("Header image removed");
      }
    } finally {
      setHeaderBusy(false);
    }
  };
  const sendEmailInvites = async () => {
    const emails = inviteEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    if (!emails.length) return;
    setInviteBusy(true);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/invite-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const d = (await res.json().catch(() => null)) as { sent?: number; error?: string } | null;
      if (res.ok) {
        const n = d?.sent ?? emails.length;
        toast.success(`Sent ${n} invite${n === 1 ? "" : "s"}`);
        setInviteEmails("");
      } else toast.error(d?.error || "Couldn't send invites.");
    } catch {
      toast.error("Couldn't send invites.");
    } finally {
      setInviteBusy(false);
    }
  };
  // Editing the lobby size resets the seeded bracket (it may switch engines
  // between the classic 1v1 bracket and the lobby/group bracket).
  const changeLobbyRule = async (patch: { lobbySize?: number; advance?: number }) => {
    const next = { ...tournament.settings, ...patch };
    if (next.lobbySize && next.advance) next.advance = Math.min(Number(next.advance), Number(next.lobbySize) - 1);
    if (patch.lobbySize && Number(patch.lobbySize) <= 2) next.advance = 1;
    await updateTournament({ settings: next, bracket: null, group_bracket: null });
  };

  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(tournament.status) + 1];
  const pendingCount = participants.filter((p) => p.status === "registered").length;
  const confirmedCount = participants.filter((p) => p.status === "confirmed" || p.status === "checked_in").length;
  const checkedInCount = participants.filter((p) => p.status === "checked_in").length;
  // Registration cap + spots. Field size is tier-gated (GS Circuit); until
  // billing launches everything is free, so the note is anticipatory.
  const fieldCap = tournament.max_participants ?? null;
  const spotsLeft = fieldCap != null ? Math.max(0, fieldCap - confirmedCount) : null;
  const freeCap = getGameLobbySize(tournament.game_slug); // one full lobby of this game
  const nearFreeCap = (fieldCap != null && fieldCap > freeCap) || confirmedCount >= freeCap;

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
    <main style={{ paddingTop: "2rem", paddingBottom: "5rem", minHeight: "100%", background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      <Container>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "2rem" }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: "var(--font-size-24)", fontWeight: 700, marginBottom: "0.5rem" }}>
                Manage: {tournament.title}
                {!isOwner && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--primary-ink-600)", background: "var(--primary-100)", padding: "0.15rem 0.5rem", borderRadius: "0.4rem", marginLeft: "0.6rem", verticalAlign: "middle" }}>Co-organizer</span>}
              </h1>
              {tournament.date_time && (
                <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>Starts {formatEventTime(tournament.date_time, viewerTz)}</p>
              )}
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <span className={`lounge-status lounge-status--${tournament.status}`}>{STATUS_LABELS[tournament.status]}</span>
                <span style={{ fontSize: "var(--font-size-12)", color: savedFlash ? "var(--success-700, #17A710)" : "var(--text-tertiary)", transition: "color 0.2s" }}>
                  {savedFlash ? "✓ Saved" : "· Auto-saves"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <a href={`/tournament/${tournamentId}`}><Button variant="ghost" size="small">Preview</Button></a>
              <a href={`/tournament/${tournamentId}/display`} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="small">Display mode ↗</Button></a>
              <Button
                variant="ghost"
                size="small"
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/tournament/${tournamentId}`)}
              >
                Copy Link
              </Button>
            </div>
          </div>

          {/* Dashboard / Settings switch — only while the event is running, so the
              live view stays focused on running it. */}
          {isRunning && (
            <div style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: "0.6rem", overflow: "hidden", marginBottom: "1.5rem" }}>
              {([["dashboard", "Dashboard"], ["settings", "Settings"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  style={{
                    padding: "0.5rem 1.1rem", fontSize: "var(--font-size-14)", fontWeight: 600, border: "none", cursor: "pointer",
                    background: view === v ? "var(--bg-primary, var(--primary-500))" : "transparent",
                    color: view === v ? "var(--text-on-primary, #fff)" : "var(--text-secondary)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Status + schedule */}
          <div className="comp-card" style={{ marginBottom: "1.5rem", padding: "1.4rem 1.75rem"}}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <span style={{ fontSize: "var(--font-size-14)", fontWeight: 600 }}>Status: {STATUS_LABELS[tournament.status]}</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {nextStatus && (
                  <Button variant="primary" size="small" onClick={() => updateTournament({ status: nextStatus })}>
                    Move to {STATUS_LABELS[nextStatus]}
                  </Button>
                )}
                {isOwner && tournament.status !== "cancelled" && tournament.status !== "complete" && (
                  <Button variant="danger" size="small" loading={scheduleBusy} onClick={cancelTournament}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {/* Schedule — moving the time emails + notifies everyone signed up. */}
            {tournament.status !== "cancelled" && tournament.status !== "complete" && (
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.9rem", paddingTop: "0.9rem", borderTop: "1px solid var(--border-subtle)" }}>
                <label style={{ fontSize: "var(--font-size-14)", fontWeight: 600 }}>Date &amp; time</label>
                <input
                  type="datetime-local"
                  value={scheduleInput}
                  onChange={(e) => setScheduleInput(e.target.value)}
                  style={{ height: 34, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 8px", background: "var(--surface-default)", color: "var(--text-primary)", maxWidth: "100%" }}
                />
                <Button variant="secondary" size="small" loading={scheduleBusy} onClick={rescheduleTournament} disabled={!scheduleInput}>
                  Update time &amp; notify
                </Button>
                <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", flexBasis: "100%" }}>
                  In your timezone. Participants are emailed and notified of any change.
                </span>
              </div>
            )}

            {/* Where — online or a physical venue/address. */}
            <div style={{ marginTop: "0.9rem", paddingTop: "0.9rem", borderTop: "1px solid var(--border-subtle)" }}>
              <label style={{ fontSize: "var(--font-size-14)", fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>Where</label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                {(["online", "in_person"] as const).map((val) => (
                  <Button
                    key={val}
                    variant={(tournament.settings?.locationType ?? "online") === val ? "primary" : "secondary"}
                    size="small"
                    onClick={() => updateTournament({ settings: { ...tournament.settings, locationType: val, ...(val === "online" ? { location: null } : {}) } })}
                  >
                    {val === "online" ? "Online" : "In person"}
                  </Button>
                ))}
                {(tournament.settings?.locationType ?? "online") === "in_person" && (
                  <input
                    type="text"
                    defaultValue={tournament.settings?.location ?? ""}
                    onBlur={(e) => updateTournament({ settings: { ...tournament.settings, location: e.target.value.trim() || null } })}
                    placeholder="Venue or address"
                    style={{ flex: "1 1 260px", height: 34, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 8px", background: "var(--surface-default)", color: "var(--text-primary)" }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Registration — the at-a-glance numbers, the who-can-join rule, and
              the invite paths, all together at the top. */}
          <div className="comp-card" hidden={!showSettings} style={{ marginBottom: "1.5rem", padding: "1.4rem 1.75rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "1rem" }}>Registration</h2>

            {/* Stat cards. Pending is clickable to review. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "var(--spacing-12, 0.75rem)", marginBottom: "1.25rem" }}>
              {[
                { key: "total", label: "Total", value: participants.length },
                { key: "pending", label: "Pending", value: pendingCount, pending: true },
                { key: "confirmed", label: "Confirmed", value: confirmedCount },
                { key: "spots", label: fieldCap != null ? "Spots left" : "Spots", value: spotsLeft != null ? spotsLeft : "∞" },
                { key: "checkedin", label: "Checked In", value: checkedInCount },
              ].map((s) => {
                const clickable = !!s.pending && pendingCount > 0;
                return (
                  <div
                    key={s.key}
                    onClick={clickable ? () => setShowPending(true) : undefined}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") setShowPending(true); } : undefined}
                    style={{
                      padding: "0.85rem 0.75rem",
                      textAlign: "center",
                      cursor: clickable ? "pointer" : "default",
                      borderRadius: "0.6rem",
                      background: "var(--background-secondary)",
                      border: `1px solid ${clickable ? "var(--primary-500)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div style={{ fontSize: "var(--font-size-24)", fontWeight: 700, lineHeight: 1.1 }}>{s.value}</div>
                    <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "0.25rem" }}>{s.label}</div>
                    {clickable && (
                      <div style={{ fontSize: "var(--font-size-12)", color: "var(--bg-primary, var(--primary-500))", fontWeight: 600, marginTop: "0.2rem" }}>Review →</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Field-size / GS Circuit upgrade note — free while billing's off. */}
            {nearFreeCap && (
              <div style={{ marginBottom: "1.25rem", padding: "0.75rem 1rem", borderRadius: "0.6rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", background: "var(--background-secondary)", border: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                  <IconSparkles size={14} stroke={1.9} aria-hidden /> Fields over {freeCap} players will be part of{" "}<strong>GameShuffle Circuit</strong>{" "}at launch. Free while it&rsquo;s in preview, so run it as big as you like for now.
                </span>
                <Link href="/gs-circuit" style={{ textDecoration: "none" }}>
                  <Button variant="secondary" size="small">About GS Circuit</Button>
                </Link>
              </div>
            )}

            {/* Who can join. */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
              <div>
                <span style={{ fontSize: "var(--font-size-14)", fontWeight: 600 }}>Require verified email</span>
                <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.15rem" }}>Only players with a verified email can join.</p>
              </div>
              <Switch
                checked={!!tournament.settings?.requireVerified}
                onChange={() => updateTournament({ settings: { ...tournament.settings, requireVerified: !tournament.settings?.requireVerified } })}
              />
            </div>

            {/* Invite players — one section, toggle between an existing GS account
                and an email invite for people not on GameShuffle yet. */}
            <div style={{ paddingTop: "1rem", marginTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "var(--font-size-14)", fontWeight: 600 }}>Invite players</span>
                <div style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: "0.5rem", overflow: "hidden" }}>
                  {([["user", "Invite user"], ["email", "Invite by email"]] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setInviteMode(mode)}
                      style={{
                        padding: "0.35rem 0.85rem",
                        fontSize: "var(--font-size-12)",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        background: inviteMode === mode ? "var(--bg-primary, var(--primary-500))" : "transparent",
                        color: inviteMode === mode ? "var(--text-on-primary, #fff)" : "var(--text-secondary)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {inviteMode === "user" ? (
                <div>
                  <input
                    type="text"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search players by username or name…"
                    style={{ width: "100%", maxWidth: 420, height: 34, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 8px", background: "var(--surface-default)", color: "var(--text-primary)" }}
                  />
                  {userQuery.trim().length >= 2 && (
                    <div style={{ marginTop: "0.5rem", maxWidth: 420, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                      {userSearchBusy && userResults.length === 0 && (
                        <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Searching…</p>
                      )}
                      {!userSearchBusy && userResults.length === 0 && (
                        <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>No players found.</p>
                      )}
                      {userResults.map((u) => {
                        const invited = invitedIds.includes(u.id);
                        return (
                          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem 0.6rem", borderRadius: "0.5rem", background: "var(--background-secondary)", border: "1px solid var(--border-subtle)" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {u.avatar_url
                              ? <img src={u.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                              : <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary-100)", color: "var(--primary-ink-600)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{u.display_name.charAt(0).toUpperCase()}</span>}
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: "var(--font-size-12)", fontWeight: 600, color: "var(--text-primary)" }}>{u.display_name}</span>
                              {u.username && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginLeft: 6 }}>@{u.username}</span>}
                            </span>
                            <Button variant={invited ? "ghost" : "secondary"} size="small" disabled={invited} onClick={() => inviteUser(u)}>
                              {invited ? "Invited ✓" : "Invite"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>
                    Find anyone on GameShuffle by username or name. They get an in-app notification with a link to join.
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    <input type="text" value={inviteEmails} onChange={(e) => setInviteEmails(e.target.value)} placeholder="email@example.com, another@example.com…"
                      style={{ flex: "1 1 260px", height: 34, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 8px", background: "var(--surface-default)", color: "var(--text-primary)" }} />
                    <Button variant="primary" size="small" loading={inviteBusy} disabled={!inviteEmails.trim()} onClick={sendEmailInvites}>Send invites</Button>
                  </div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>
                    For players who aren&rsquo;t on GameShuffle yet — they&rsquo;ll get an email with a link to join.
                  </p>
                </div>
              )}

              {/* Add a walk-in guest (no account) — a roster add, kept with the
                  other ways to bring players in. */}
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.35rem" }}>Add a guest</label>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addGuest(); }}
                    placeholder="Guest player name…"
                    style={{ flex: "1 1 260px", height: 34, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 8px", background: "var(--surface-default)", color: "var(--text-primary)" }}
                  />
                  <Button variant="secondary" size="small" onClick={addGuest} disabled={!guestName.trim()}>Add guest</Button>
                </div>
                <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>
                  A walk-in without a GameShuffle account. They&rsquo;ll appear in the participants list right away.
                </p>
              </div>
            </div>
          </div>

          {/* Crews — organizer buckets players into crews (communities). Standings
              roll up per crew (card above) and show live on the OBS overlay. */}
          <div className="comp-card" hidden={!showDashboard} style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>Crews <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}>multi-crew tournament</span></h2>
            <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
              Add the communities battling here, then assign each player to a crew below. Players on a crew can also self-assign from the public page.
            </p>

            {/* Configured crews */}
            {crewIds.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
                {crewIds.map((cid) => {
                  const meta = communityMeta[cid];
                  const count = participants.filter((p) => p.community_id === cid).length;
                  return (
                    <span key={cid} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.6rem", borderRadius: "999px", background: "var(--background-secondary)", border: "1px solid var(--border-subtle)", fontSize: "var(--font-size-12)" }}>
                      <strong style={{ fontWeight: 600 }}>{meta?.name ?? "Crew"}</strong>
                      <span style={{ color: "var(--text-tertiary)" }}>{count}</span>
                      <button onClick={() => removeCrew(cid)} aria-label={`Remove ${meta?.name ?? "crew"}`} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Add-crew search */}
            <div style={{ position: "relative", maxWidth: 440 }}>
              <Input value={crewQuery} onChange={(e) => setCrewQuery(e.target.value)} placeholder="Search communities by name or @handle" />
              {crewQuery.trim().length >= 2 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10, background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: "0.5rem", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                  {crewSearchBusy && <div style={{ padding: "0.6rem 0.8rem", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Searching…</div>}
                  {!crewSearchBusy && crewResults.length === 0 && <div style={{ padding: "0.6rem 0.8rem", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>No communities found.</div>}
                  {crewResults.map((c) => (
                    <button key={c.id} onClick={() => addCrew(c)} disabled={crewIds.includes(c.id)} style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", padding: "0.55rem 0.8rem", border: "none", background: "none", cursor: crewIds.includes(c.id) ? "default" : "pointer", textAlign: "left", fontSize: "var(--font-size-12)", color: "var(--text-primary)", opacity: crewIds.includes(c.id) ? 0.5 : 1 }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span style={{ color: "var(--text-tertiary)" }}>{crewIds.includes(c.id) ? "Added" : `@${c.slug}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tickets + payouts (free tournaments simply have no tiers). */}
          <div className="comp-card" hidden={!showDashboard} style={{ marginBottom: "1.5rem" }}>
            <TicketingManager type="tournament" eventId={tournamentId} />
          </div>

          {/* Attendee tools — check-in, waitlist, message, export. The roster
              below keeps the tournament-specific controls (accept, teams, drop). */}
          <div className="comp-card" hidden={!showDashboard} style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.75rem" }}>Attendees</h2>
            <AttendeeTable type="tournament" eventId={tournamentId} capacity={tournament.max_participants ?? null} checkInHref={`/tournament/${tournamentId}/manage/check-in`} compact />
          </div>

          {/* Participants — just the roster (invites live in Registration up top). */}
          <div className="comp-card" hidden={!showDashboard} style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "var(--font-size-18)" }}>Participants ({participants.length})</h2>
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

            {participants.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>No one has signed up yet. Invite players or add a guest from Registration above, or share the link.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {participants.map((p) => (
                  <div key={p.id} className="manage-participant-row">
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: "var(--font-size-14)", display: "inline-flex", alignItems: "center" }}>{p.display_name}{p.users?.email_verified && <VerifiedBadge />}</span>
                      {p.discord_username && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginLeft: "0.5rem" }}>@{p.discord_username}</span>}
                      {p.friend_code && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginLeft: "0.5rem" }}>FC: {p.friend_code}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      {crewIds.length > 0 && p.status !== "dropped" && (
                        <select
                          value={p.community_id ?? ""}
                          onChange={(e) => assignCrew(p.id, e.target.value || null)}
                          aria-label={`Crew for ${p.display_name}`}
                          style={{ height: 28, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 6px", fontSize: "var(--font-size-12)", background: "var(--surface-default)", color: "var(--text-primary)", maxWidth: 130 }}
                        >
                          <option value="">No crew</option>
                          {crewIds.map((cid) => (
                            <option key={cid} value={cid}>{communityMeta[cid]?.name ?? "Crew"}</option>
                          ))}
                        </select>
                      )}
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
                            fontSize: "var(--font-size-12)",
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
                      <span className={`lounge-status lounge-status--${p.status === "confirmed" ? "in_progress" : p.status === "checked_in" ? "complete" : p.status === "dropped" ? "complete" : "waiting"}`} style={{ fontSize: "var(--font-size-10)" }}>
                        {p.status.replace("_", " ")}
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

          {/* Team access (GS Circuit) — co-organizers who can edit alongside the
              owner. Owner-only; RLS lets them edit but not manage the roster. */}
          {showSettings && isOwner && (
            <div className="comp-card" style={{ marginBottom: "1.5rem", padding: "1.4rem 1.75rem" }}>
              <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>
                Team access <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}><IconSparkles size={12} stroke={1.9} aria-hidden /> GS Circuit · free in preview</span>
              </h2>
              <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
                Add co-organizers by GameShuffle username. They can edit this tournament and run it with you, but only you can delete it or change the team.
              </p>

              {coOrganizers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                  {coOrganizers.map((c) => (
                    <div key={c.userId} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.7rem", borderRadius: "0.5rem", background: "var(--background-secondary)", border: "1px solid var(--border-subtle)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.avatarUrl
                        ? <img src={c.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                        : <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary-100)", color: "var(--primary-ink-600)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{c.displayName.charAt(0).toUpperCase()}</span>}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: "var(--font-size-12)", fontWeight: 600, color: "var(--text-primary)" }}>{c.displayName}</span>
                        {c.username && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginLeft: 6 }}>@{c.username}</span>}
                      </span>
                      <Button variant="ghost" size="small" disabled={coBusy} onClick={() => removeCoOrganizer(c.userId)}>Remove</Button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", maxWidth: 440 }}>
                <Input value={coUsername} onChange={(e) => setCoUsername(e.target.value)} placeholder="GameShuffle username" style={{ flex: "1 1 220px" }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addCoOrganizer(); } }} />
                <Button variant="secondary" loading={coBusy} onClick={addCoOrganizer} disabled={!coUsername.trim()}>Add co-organizer</Button>
              </div>
            </div>
          )}

          {/* Page branding (GS Circuit) — custom header image + brand color
              theme that re-skins the public tournament page. */}
          {showSettings && !setupLocked && (
            <div className="comp-card" style={{ marginBottom: "1.5rem", padding: "1.4rem 1.75rem" }}>
              <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>
                Page branding <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}><IconSparkles size={12} stroke={1.9} aria-hidden /> GS Circuit · free in preview</span>
              </h2>
              <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>Make your public tournament page feel like your event.</p>

              <div style={{ marginBottom: "1.25rem" }}>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Header image</label>
                {tournament.header_image_url ? (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={tournament.header_image_url} alt="" style={{ width: "100%", maxWidth: 640, aspectRatio: "16 / 5", objectFit: "cover", borderRadius: "0.6rem", border: "1px solid var(--border-default)", display: "block" }} />
                    <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
                      <Button variant="secondary" size="small" loading={headerBusy} onClick={() => headerFileRef.current?.click()}>Replace</Button>
                      <Button variant="secondary" size="small" onClick={() => setHeaderEditSrc(tournament.header_image_url ? `/api/tournament/${tournamentId}/header/raw` : null)}>Adjust</Button>
                      <Button variant="ghost" size="small" loading={headerBusy} onClick={removeHeader}>Remove</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="secondary" size="small" loading={headerBusy} onClick={() => headerFileRef.current?.click()}>Upload header image</Button>
                )}
                <input ref={headerFileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const url = URL.createObjectURL(f); setHeaderEditSrc(url); } }} />
                <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>Shown as a banner at the top of your public page. Best at <strong>1600 × 500px</strong> (a wide 16:5 image); we&rsquo;ll let you crop and position it after you pick one.</p>
              </div>

              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Brand color theme</label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {BRAND_THEMES.map((bt) => {
                    const active = (tournament.brand_theme || "default") === bt.id;
                    return (
                      <button key={bt.id} type="button" onClick={() => updateTournament({ brand_theme: bt.id })} title={bt.name}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, border: `2px solid ${active ? "var(--primary-500)" : "var(--border-default)"}`, borderRadius: "0.6rem", padding: "0.35rem", background: "var(--surface-default)", cursor: "pointer" }}>
                        <span style={{ width: 52, height: 28, borderRadius: "0.35rem", background: bt.gradient, display: "block" }} />
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{bt.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Big-screen display customization (GS Circuit) — an accent + subtitle
              that skin the chrome-free /display board. */}
          {showSettings && !setupLocked && (() => {
            const display = (tournament.settings?.display ?? {}) as { accent?: string; subtitle?: string };
            const ACCENTS: { id: string; hex: string | null; name: string }[] = [
              { id: "none", hex: null, name: "Default" },
              { id: "indigo", hex: "#5457e5", name: "Indigo" },
              { id: "violet", hex: "#8b5cf6", name: "Violet" },
              { id: "emerald", hex: "#10b981", name: "Emerald" },
              { id: "amber", hex: "#f59e0b", name: "Amber" },
              { id: "rose", hex: "#e11d64", name: "Rose" },
              { id: "sky", hex: "#0ea5e9", name: "Sky" },
            ];
            const saveDisplay = (patch: { accent?: string | null; subtitle?: string }) => {
              const next = { ...display, ...patch };
              if (!next.accent) delete next.accent;
              if (!next.subtitle) delete next.subtitle;
              void updateTournament({ settings: { ...tournament.settings, display: next } });
            };
            return (
              <div className="comp-card" style={{ marginBottom: "1.5rem", padding: "1.4rem 1.75rem" }}>
                <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.25rem" }}>
                  Display board <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}><IconSparkles size={12} stroke={1.9} aria-hidden /> GS Circuit · free in preview</span>
                </h2>
                <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
                  Skin the big-screen <a href={`/tournament/${tournamentId}/display`} target="_blank" rel="noopener noreferrer">display board</a> for your venue or stream.
                </p>

                <div style={{ marginBottom: "1.25rem" }}>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Accent color</label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {ACCENTS.map((a) => {
                      const active = (display.accent || null) === a.hex;
                      return (
                        <button key={a.id} type="button" onClick={() => saveDisplay({ accent: a.hex })} title={a.name}
                          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, border: `2px solid ${active ? "var(--primary-500)" : "var(--border-default)"}`, borderRadius: "0.6rem", padding: "0.35rem", background: "var(--surface-default)", cursor: "pointer" }}>
                          <span style={{ width: 52, height: 28, borderRadius: "0.35rem", background: a.hex ?? "linear-gradient(135deg,#5457e5,#8b5cf6)", display: "block" }} />
                          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{a.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Subtitle <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(optional tagline under the title)</span></label>
                  <Input
                    type="text"
                    value={displaySubtitle}
                    maxLength={80}
                    placeholder="e.g. Presented by GameShuffle"
                    onChange={(e) => setDisplaySubtitle(e.target.value)}
                    onBlur={() => saveDisplay({ subtitle: displaySubtitle.trim() })}
                  />
                </div>
              </div>
            );
          })()}

          {/* Lobby codes — a main code plus optional named codes per flight/lobby. */}
          <div className="comp-card" hidden={!showDashboard} style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.35rem" }}>Lobby codes</h2>
            <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
              Only visible to confirmed participants. Running several lobbies at once? Add a code per flight or lobby and name it so everyone knows which is theirs.
            </p>

            <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Main code <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(shared to chat, overlay &amp; the live page)</span></label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Name (e.g. Main lobby)"
                value={localRoomLabel}
                onChange={(e) => setLocalRoomLabel(e.target.value)}
                onBlur={() => updateTournament({ settings: { ...tournament.settings, roomCodeLabel: localRoomLabel.trim() || null } })}
                style={{ flex: "1 1 180px", minWidth: 0, height: 40, borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 8px", boxSizing: "border-box", fontSize: "var(--font-size-14)" }}
              />
              <input
                type="text"
                placeholder="Code"
                value={localRoomCode}
                onChange={(e) => {
                  setLocalRoomCode(e.target.value);
                  if (roomCodeTimer.current) clearTimeout(roomCodeTimer.current);
                  roomCodeTimer.current = setTimeout(() => updateTournament({ room_code: e.target.value }), 3000);
                }}
                onBlur={() => { if (roomCodeTimer.current) clearTimeout(roomCodeTimer.current); updateTournament({ room_code: localRoomCode }); }}
                style={{ flex: "0 1 140px", minWidth: 0, height: 40, textAlign: "center", fontWeight: 700, fontSize: "var(--font-size-18)", letterSpacing: "0.08em", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 8px", boxSizing: "border-box" }}
              />
            </div>

            {lobbyCodes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                {lobbyCodes.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="Label (e.g. Flight 1, A Main)"
                      value={c.label}
                      onChange={(e) => editLobbyCode(i, { label: e.target.value })}
                      onBlur={() => commitLobbyCodes(lobbyCodes)}
                      style={{ flex: "1 1 180px", minWidth: 0, height: 36, borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 8px", boxSizing: "border-box", fontSize: "var(--font-size-12)" }}
                    />
                    <input
                      type="text"
                      placeholder="Code"
                      value={c.code}
                      onChange={(e) => editLobbyCode(i, { code: e.target.value })}
                      onBlur={() => commitLobbyCodes(lobbyCodes)}
                      style={{ flex: "0 1 130px", minWidth: 0, height: 36, textAlign: "center", fontWeight: 700, letterSpacing: "0.06em", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 8px", boxSizing: "border-box", fontSize: "var(--font-size-14)" }}
                    />
                    <Button variant="ghost" size="small" onClick={() => removeLobbyCode(i)}>Remove</Button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: "0.75rem" }}>
              <Button variant="secondary" size="small" onClick={addLobbyCode}>+ Add lobby code</Button>
            </div>
          </div>

          {/* Tournament setup — change the format, team mode, and rules without
              deleting and recreating. Changing the format (or group rules) resets
              any generated bracket so it can be re-seeded. */}
          {showSettings && !setupLocked && (
            <div className="comp-card" style={{ marginBottom: "1.5rem", padding: "1.4rem 1.75rem" }}>
              <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "0.5rem" }}>Tournament setup</h2>
              {hasRunState && (
                <p style={{ fontSize: "var(--font-size-12)", color: "var(--warning-ink)", marginBottom: "0.75rem" }}>
                  Heads up: changing the format or group rules will clear the bracket you&rsquo;ve already generated so it can be re-seeded.
                </p>
              )}
              <div style={{ marginBottom: "1rem" }}>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Format</label>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {SETUP_FORMATS.map((f) => (
                    <Button key={f.value} variant={tournament.format === f.value ? "primary" : "secondary"} size="small" onClick={() => changeFormat(f.value)}>{f.label}</Button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: isGroupFormat ? "1rem" : 0 }}>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Team mode</label>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {SETUP_MODES.map((m) => (
                    <Button key={m.value} variant={tournament.mode === m.value ? "primary" : "secondary"} size="small" onClick={() => changeMode(m.value)}>{m.label}</Button>
                  ))}
                </div>
              </div>

              {/* Points fields: single scoreboard vs multiple flights (large fields).
                  Changing the shape re-seeds, so it clears an existing board. */}
              {isPoints && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)" }}>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>How it runs</label>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      <Button variant={!useFlights ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, useFlights: false }, flights: null })}>One scoreboard</Button>
                      <Button variant={useFlights ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, useFlights: true }, flights: null })}>Multiple flights</Button>
                    </div>
                    <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                      {useFlights ? "For big fields — split into flights each round, re-seeded from the standings." : "Everyone scores into one running standings."}
                    </p>
                  </div>
                  {useFlights && (
                    <>
                      <div>
                        <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Players per flight</label>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          {[8, 12, 16, 24].map((n) => (
                            <Button key={n} variant={flightRules.flightSize === n ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, flightSize: n }, flights: null })}>{n}</Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Rounds</label>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          {[2, 3, 4, 5, 6].map((n) => (
                            <Button key={n} variant={flightRules.rounds === n ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, flightRounds: n }, flights: null })}>{n}</Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Races per round <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(1 = score by round)</span></label>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          {[1, 2, 3, 4, 6].map((n) => (
                            <Button key={n} variant={flightRules.racesPerRound === n ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, racesPerRound: n }, flights: null })}>{n}</Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Re-seed between rounds</label>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <Button variant={flightRules.reseed === "standings" ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, flightReseed: "standings" }, flights: null })}>Group by standings</Button>
                          <Button variant={flightRules.reseed === "snake" ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, flightReseed: "snake" }, flights: null })}>Spread across flights</Button>
                        </div>
                        <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                          {flightRules.reseed === "snake" ? "Leaders spread out so every flight is balanced." : "Leaders grouped together, so the top flight is the toughest."}
                        </p>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>When players tie on points</label>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      <Button variant={tournament.settings?.tieBreak !== "runoff" ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, tieBreak: "shared" } })}>Same placement</Button>
                      <Button variant={tournament.settings?.tieBreak === "runoff" ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, tieBreak: "runoff" } })}>Play a runoff</Button>
                    </div>
                    <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                      {tournament.settings?.tieBreak === "runoff"
                        ? "Tied players share a place until you break it — run a runoff race among them, or edit points."
                        : "Tied players officially share the placement (both 2nd, same medal)."}
                    </p>
                  </div>
                </div>
              )}

              {isElim && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)" }}>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Players per lobby</label>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                      {[2, 3, 4, 6, 8].map((n) => (
                        <Button key={n} variant={!lobbyCustom && elimLobbySize === n ? "primary" : "secondary"} size="small" onClick={() => { setLobbyCustom(false); void changeLobbyRule({ lobbySize: n, advance: Math.max(1, Math.min(elimAdvance, n - 1)) }); }}>{n}</Button>
                      ))}
                      <Button variant={lobbyCustom ? "primary" : "secondary"} size="small" onClick={() => { setLobbyDraft(String(elimLobbySize)); setLobbyCustom(true); }}>Custom</Button>
                      {lobbyCustom && (
                        <input type="number" min={2} max={24} value={lobbyDraft} aria-label="Custom lobby size" autoFocus
                          onChange={(e) => setLobbyDraft(e.target.value)}
                          onBlur={() => { const n = Math.max(2, Math.min(24, Number(lobbyDraft) || 2)); void changeLobbyRule({ lobbySize: n, advance: Math.max(1, Math.min(elimAdvance, n - 1)) }); }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          style={{ width: 72, height: 30, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 6px", background: "var(--surface-default)", color: "var(--text-primary)" }} />
                      )}
                    </div>
                    <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                      {elimLobbySize <= 2 ? "2 = classic 1v1 bracket." : `Lobbies of ${elimLobbySize}; ${isDoubleElim ? "everyone else gets a second chance in a lower bracket." : "everyone else is knocked out."}`}
                    </p>
                  </div>
                  {elimLobbySize > 2 && (
                    <div>
                      <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>How many move on from each lobby</label>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        {Array.from({ length: elimLobbySize - 1 }, (_, i) => i + 1).map((n) => (
                          <Button key={n} variant={elimAdvance === n ? "primary" : "secondary"} size="small" onClick={() => changeLobbyRule({ advance: n })}>{n}</Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grand final vs separate brackets (double + lobbies). Changing
                      the shape re-seeds, so it clears an existing board. */}
                  {isDoubleElim && useLobbies && (
                    <div>
                      <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>When both brackets finish</label>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <Button variant={tournament.settings?.grandFinal !== false ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, grandFinal: true }, bracket: null, group_bracket: null })}>Grand final</Button>
                        <Button variant={tournament.settings?.grandFinal === false ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, grandFinal: false }, bracket: null, group_bracket: null })}>Separate brackets</Button>
                      </div>
                      <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                        {tournament.settings?.grandFinal !== false
                          ? "Winners champion and losers champion meet in a grand final for 1st/2nd."
                          : "No grand final: the winners champion takes 1st and the losers bracket fills the rest, so the two can run at the same time."}
                      </p>
                    </div>
                  )}

                  {/* Lobby reporting mode (any lobby format). Doesn't change the
                      board, only how you tap, so no re-seed needed. */}
                  {useLobbies && (
                    <div>
                      <label className="account-card__label" style={{ display: "block", marginBottom: "0.4rem" }}>Reporting each lobby</label>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <Button variant={tournament.settings?.lobbyReporting !== "placement" ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, lobbyReporting: "advance" } })}>Tap who advances</Button>
                        <Button variant={tournament.settings?.lobbyReporting === "placement" ? "primary" : "secondary"} size="small" onClick={() => updateTournament({ settings: { ...tournament.settings, lobbyReporting: "placement" } })}>Tap full placement</Button>
                      </div>
                      <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                        {tournament.settings?.lobbyReporting === "placement"
                          ? "Tap every player in finishing order in each lobby — best when you're tracking points or full standings."
                          : "Just tap who moves on; the final lobby is tapped in order for the podium."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Pending registrations modal */}
          <Modal isOpen={showPending} onClose={() => setShowPending(false)} title="Pending registrations" size="small">
            {participants.filter((p) => p.status === "registered").length === 0 ? (
              <p style={{ color: "var(--text-tertiary)" }}>No pending registrations right now.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {participants.filter((p) => p.status === "registered").map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", padding: "0.5rem 0.25rem", borderBottom: "1px solid var(--border-subtle, var(--border-default))" }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--font-size-14)", minWidth: 0 }}>
                      {p.display_name}{p.users?.email_verified && <VerifiedBadge />}
                      {p.discord_username && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginLeft: "0.5rem" }}>@{p.discord_username}</span>}
                      {p.friend_code && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginLeft: "0.5rem" }}>FC: {p.friend_code}</span>}
                    </span>
                    <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                      <Button variant="primary" size="small" onClick={() => updateParticipant(p.id, { status: "confirmed" })}>Accept</Button>
                      <Button variant="ghost" size="small" onClick={() => removeParticipant(p.id)}>Decline</Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  size="small"
                  style={{ marginTop: "0.75rem" }}
                  onClick={async () => {
                    for (const p of participants.filter((x) => x.status === "registered")) {
                      await updateParticipant(p.id, { status: "confirmed" });
                    }
                  }}
                >
                  Accept all ({pendingCount})
                </Button>
              </div>
            )}
          </Modal>

          {/* Header image crop / position editor (banner branding). */}
          {headerEditSrc && (
            <BannerEditModal
              imageSrc={headerEditSrc}
              aspect={16 / 5}
              outW={1600}
              outH={500}
              title="Position your banner"
              onCancel={() => { if (headerEditSrc.startsWith("blob:")) URL.revokeObjectURL(headerEditSrc); setHeaderEditSrc(null); }}
              onConfirm={async (blob) => {
                await uploadHeader(blob);
                if (headerEditSrc.startsWith("blob:")) URL.revokeObjectURL(headerEditSrc);
                setHeaderEditSrc(null);
              }}
            />
          )}

          {/* MK-specific config (race / tracks / build restrictions). Only for
              games that carry rich data; other games run bracket/points/heat→mains
              on named participants without a track/build layer. */}
          {showSettings && gd && (
          <>
          {/* Race Settings */}
          <div className="comp-card" style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "1.5rem" }}>Race Settings</h2>
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
                  options={["all", "normal", "shells", "bananas", "mushrooms", "bob-ombs", "none", "custom"].map((i) => ({ value: i, label: i.charAt(0).toUpperCase() + i.slice(1) }))}
                />
              </div>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>CPU</label>
                <Select
                  value={tournament.settings?.cpu || "hard"}
                  onChange={(v) => updateTournament({ settings: { ...tournament.settings, cpu: v } })}
                  options={["easy", "normal", "hard", "no cpu"].map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
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
          <div className="comp-card" style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "1rem" }}>Tracks</h2>

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
                <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                  {tournament.settings?.noDuplicateTracks ? "Tracks can only be selected once" : "Tracks can be repeated"}
                </span>
              </div>
            )}

            {/* FFA mode */}
            {(tournament.settings?.trackMode === "ffa" || !tournament.settings?.trackMode) && (
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>Tracks will be decided on tournament day. No pre-selection needed.</p>
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

              // A "random" (mystery) track slot — decided on the day. Each is a
              // distinct entry (unique id), so it bypasses the no-duplicate rule
              // and can be added multiple times.
              const addRandom = () => {
                if (atLimit) return;
                updateTournament({ settings: { ...tournament.settings, tracks: [...selectedTracks, { id: `random-${Date.now()}-${selectedTracks.length}`, name: "Random", img: gd.randomTrackImg }] } });
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
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
                    {isGuided ? "Expand a cup and click tracks to add them in order." : "Expand cups and select tracks for the pool."}
                  </p>

                  {gd.randomTrackImg && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
                      <Button variant="secondary" size="small" disabled={atLimit} onClick={addRandom}>
                        + Add random track
                      </Button>
                      <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>A mystery slot. The track is decided on the day.</span>
                    </div>
                  )}

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
                            <span style={{ fontWeight: 600, fontSize: "var(--font-size-12)", flex: 1 }}>{gd.cupName(cupIdx)}</span>
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

          {/* Randomized rounds (native randomizer integration) */}
          <TournamentRandomizerCard
            tournamentId={tournamentId}
            gameSlug={tournament.game_slug}
            initialConfig={tournament.settings?.randomizer ?? null}
            initialRounds={Array.isArray(tournament.settings?.rounds) ? tournament.settings.rounds : []}
            initialLive={tournament.settings?.randomizerLive ?? null}
            syncedLive={(tournament.settings?.randomizerLive ?? null) as LivePointer | null}
          />

          {/* Build Restrictions */}
          <div className="comp-card" style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "1.5rem" }}>Build Restrictions</h2>

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
              <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
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
                      <span style={{ fontSize: "var(--font-size-10)" }}>{char.name}</span>
                    </button>
                  );
                })}
              </div>
              {((tournament.settings?.bannedCharacters || []).length > 0 || (tournament.settings?.allowedCharacters || []).length > 0) && (
                <div style={{ marginTop: "0.5rem", fontSize: "var(--font-size-12)", fontWeight: 600 }}>
                  {tournament.settings?.characterMode === "allowed"
                    ? <span style={{ color: "var(--success-ink)" }}>{tournament.settings.allowedCharacters.length} allowed</span>
                    : <span style={{ color: "var(--error-ink)" }}>{tournament.settings.bannedCharacters.length} banned</span>
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
          </>
          )}

          {/* Rules */}
          <div className="comp-card" hidden={!showSettings} style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "var(--font-size-18)", marginBottom: "1rem" }}>Rules & Notes</h2>
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

          {/* Live race control — sets the "current race" that appears on the
              overlay, the /live page, and chat. Works across every format. */}
          {showDashboard && (() => {
            // Only while the tournament is actually running — not during
            // registration (draft/open) or after it's done.
            if (tournament.status !== "in_progress") return null;
            const races = listRaces(tournament);
            if (!races.length) return null;
            const curIdx = raceIndex(races, tournament.settings?.currentRaceKey ?? null);
            return (
              <div className="comp-card" style={{ marginBottom: "1.5rem", padding: "1.4rem 1.75rem"}}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <div>
                    <h2 style={{ fontSize: "var(--font-size-16)", fontWeight: 700 }}>Live race control</h2>
                    <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                      The current race shows on your overlay, /live page, and chat. Also drive it in chat with <strong>!gs-tourney next</strong>.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button variant="secondary" size="small" loading={raceBusy} disabled={curIdx <= 0} onClick={() => setRace({ action: "prev" })}>◀ Prev</Button>
                    <Button variant="primary" size="small" loading={raceBusy} disabled={curIdx >= races.length - 1} onClick={() => setRace({ action: "next" })}>Next ▶</Button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: 260, overflowY: "auto" }}>
                  {races.map((r, i) => {
                    const active = i === curIdx;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setRace({ action: "set", key: active ? null : r.key })}
                        disabled={raceBusy}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.6rem", width: "100%", textAlign: "left",
                          padding: "0.4rem 0.6rem", borderRadius: "0.4rem", cursor: "pointer",
                          border: active ? "1px solid var(--primary-500)" : "1px solid var(--border-subtle)",
                          background: active ? "var(--surface-selected, var(--primary-100))" : "var(--background-secondary)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <span style={{ fontSize: "var(--font-size-12)", fontWeight: 700, color: active ? "var(--primary-600)" : "var(--text-tertiary)", minWidth: 44 }}>
                          {active ? "▶ LIVE" : `#${i + 1}`}
                        </span>
                        {r.img ? <img src={r.img} alt="" style={{ width: 40, height: 30, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} /> : null}
                        <span style={{ fontSize: "var(--font-size-14)", fontWeight: active ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.sublabel || r.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Bracket — single elimination (Phase 3) */}
          {showDashboard && isBracketFormat && tournament.status !== "draft" && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "var(--font-size-18)" }}>Bracket</h2>
                {tournament.bracket && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    {bracketChampion(tournament.bracket!) && (
                      <Button variant="primary" size="small" loading={finalizing} onClick={finalizeBracketPlacements}>Finalize placements →</Button>
                    )}
                    <Button variant="ghost" size="small" onClick={() => updateTournament({ bracket: null })}>Clear</Button>
                  </div>
                )}
              </div>
              {!tournament.bracket ? (
                <div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                    Generate a {isDoubleElim ? "double" : "single"}-elimination bracket from your confirmed players ({eligibleForBracket.length}). Seed by:
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Button variant="primary" size="small" disabled={!canGenerateBracket} onClick={() => generateBracket("checkin")}>Seed by check-in order</Button>
                    <Button variant="secondary" size="small" disabled={!canGenerateBracket} onClick={() => generateBracket("standings")}>Seed by standings</Button>
                    <Button variant="secondary" size="small" disabled={!canGenerateBracket} onClick={() => generateBracket("random")}>Seed randomly</Button>
                  </div>
                  <p style={{ fontSize: "var(--font-size-12)", color: canGenerateBracket ? "var(--text-tertiary)" : "var(--warning-700)", marginTop: "0.5rem" }}>
                    {isDoubleElim
                      ? canGenerateBracket
                        ? "Double elim: winners + losers bracket with a grand-final reset."
                        : `Double elim currently needs a power-of-2 player count (4, 8, 16, 32). You have ${eligibleForBracket.length}. Adjust the roster, or switch this tournament to single elim.`
                      : "Need at least 2 confirmed players. Byes are given to top seeds automatically."}
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                    Click the winner of each match to advance them.
                  </p>
                  <BracketView bracket={tournament.bracket!} nameOf={nameOf} onReport={reportMatchWinner} />
                </div>
              )}
            </div>
          )}

          {/* Group Knockout — lobby ladder (seed → report lobbies → finalize) */}
          {showDashboard && isGroupFormat && tournament.status !== "draft" && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "var(--font-size-18)" }}>Bracket · lobbies of {elimLobbySize}</h2>
                {gb && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    {isGroupComplete(gb) && (
                      <Button variant="primary" size="small" loading={finalizing} onClick={finalizeGroupPlacements}>Finalize placements →</Button>
                    )}
                    <Button variant="ghost" size="small" onClick={() => updateTournament({ group_bracket: null })}>Clear</Button>
                  </div>
                )}
              </div>
              {!gb ? (
                <div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                    Lobbies of {groupRules.lobbySize}, the top {groupRules.advance} move on, everyone else {groupRules.bracketing === "double" ? "gets a second chance in a lower bracket" : "is knocked out"}. Seed your {eligibleForBracket.length} confirmed players by:
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Button variant="primary" size="small" disabled={eligibleForBracket.length < 2} onClick={() => seedGroup("checkin")}>Seed by check-in order</Button>
                    <Button variant="secondary" size="small" disabled={eligibleForBracket.length < 2} onClick={() => seedGroup("standings")}>Seed by standings</Button>
                    <Button variant="secondary" size="small" disabled={eligibleForBracket.length < 2} onClick={() => seedGroup("random")}>Seed randomly</Button>
                  </div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
                    Need at least 2 confirmed players. Odd fields give byes to top seeds automatically.
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                    Tap who moves on in each lobby. The final lobby is tapped in finishing order for the podium. Editing a lobby recomputes everything after it.
                  </p>
                  <GroupBracketView gb={gb} nameOf={nameOf} onReport={reportGroupLobby} onClear={clearGroupLobby} placementMode={lobbyPlacementMode} />
                </div>
              )}
            </div>
          )}

          {/* Heat → Mains — consi ladder (seed → run heats/mains → finalize) */}
          {showDashboard && isHeatMains && tournament.status !== "draft" && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "var(--font-size-18)" }}>Heat → Mains</h2>
                {hm && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    {heatMainsStage(hm) === "complete" && (
                      <Button variant="primary" size="small" loading={finalizing} onClick={finalizeHeatMains}>Finalize placements →</Button>
                    )}
                    <Button variant="ghost" size="small" onClick={() => updateTournament({ heat_mains: null })}>Clear</Button>
                  </div>
                )}
              </div>
              {!hm ? (
                <div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                    Split your {eligibleForBracket.length} confirmed players into heats, then run them into the A/B mains. Win a heat to lock the A Main; the rest are seeded by points and the top finishers of each main transfer up.
                  </p>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                      Heat series
                      <select value={hmSeries} onChange={(e) => setHmSeries(Number(e.target.value))} style={{ height: 30, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 4px", background: "var(--surface-default)", color: "var(--text-primary)" }}>
                        <option value={1}>1 round</option>
                        <option value={2}>2 rounds</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                      Heat size
                      <select value={String(hmHeatSize)} onChange={(e) => setHmHeatSize(e.target.value === "auto" ? "auto" : Number(e.target.value))} style={{ height: 30, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 4px", background: "var(--surface-default)", color: "var(--text-primary)" }}>
                        <option value="auto">Auto (even)</option>
                        {[4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} / heat</option>)}
                      </select>
                    </label>
                    <Button variant="primary" size="small" disabled={eligibleForBracket.length < 2} onClick={seedHeatMains}>Generate heats</Button>
                  </div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Needs at least 2 confirmed players. You can regenerate any time before results are entered.</p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                    Call each race. Tap finishers in order. Edit a confirmed race to fix an order or DQ a driver; the mains re-seed automatically.
                  </p>
                  <HeatMainsView hm={hm} nameOf={nameOf} onReportHeat={reportHeat} onReportMain={reportMain} />
                </div>
              )}
            </div>
          )}

          {/* Flights — multi-flight rounds for large points fields. */}
          {showDashboard && useFlights && tournament.status !== "draft" && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "var(--font-size-18)" }}>Flights</h2>
                {fl && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    {isFlightsComplete(fl) && (
                      <Button variant="primary" size="small" loading={finalizing} onClick={finalizeFlights}>Finalize placements →</Button>
                    )}
                    <Button variant="ghost" size="small" onClick={() => updateTournament({ flights: null })}>Clear</Button>
                  </div>
                )}
              </div>
              {!fl ? (
                <div>
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
                    {describeFlights(flightRules, eligibleForBracket.length)} Seed your {eligibleForBracket.length} confirmed players by:
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Button variant="primary" size="small" disabled={eligibleForBracket.length < 2} onClick={() => seedFlights("checkin")}>Seed by check-in order</Button>
                    <Button variant="secondary" size="small" disabled={eligibleForBracket.length < 2} onClick={() => seedFlights("standings")}>Seed by standings</Button>
                    <Button variant="secondary" size="small" disabled={eligibleForBracket.length < 2} onClick={() => seedFlights("random")}>Seed randomly</Button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Cumulative standings — tie-aware (shared placement + medal),
                      with editable points to match the game / break a tie. */}
                  {(() => {
                    const standings = flightStandings(fl).filter((s) => s.racesPlayed > 0 || s.overridden);
                    if (!standings.length) return null;
                    const placeMap = new Map(
                      placementsWithTies(standings.map((s) => ({ participantId: s.participantId, points: s.points }))).map((p) => [p.participantId, p.placement]),
                    );
                    const ties = flightTies(fl);
                    return (
                      <div style={{ marginBottom: "1.25rem" }}>
                        <span className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Overall standings</span>
                        {ties.length > 0 && (
                          <p style={{ fontSize: "var(--font-size-12)", color: "var(--warning-ink)", marginBottom: "0.5rem" }}>
                            <IconScale size={15} stroke={1.9} aria-hidden /> {ties.length === 1 ? "A tie" : `${ties.length} ties`} on points — tied players share a placement. Break it by editing points{tournament.settings?.tieBreak === "runoff" ? " or running a runoff race (an extra race among the tied players)" : ""}.
                          </p>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          {standings.slice(0, 24).map((s) => {
                            const place = placeMap.get(s.participantId) ?? 0;
                            return (
                              <div key={s.participantId} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.3rem 0.6rem", borderRadius: "0.35rem", background: place <= 3 ? "var(--surface-raised, var(--surface-default))" : "transparent" }}>
                                <span style={{ width: 28, textAlign: "center", fontWeight: 800 }}><PlaceMedal rank={place} /></span>
                                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: "var(--font-size-14)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(s.participantId)}</span>
                                <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{s.wins}W · avg {s.avgPosition?.toFixed(1)}</span>
                                <input
                                  key={`${s.participantId}-${s.points}`}
                                  type="number"
                                  defaultValue={s.points}
                                  onBlur={(e) => { const v = e.target.value.trim(); overrideFlightPoints(s.participantId, v === "" ? null : Number(v)); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                  title={s.overridden ? "Manual override — clear to use the scored points" : "Scored points — edit to override"}
                                  style={{ width: 60, height: 30, textAlign: "center", borderRadius: 6, border: `1px solid ${s.overridden ? "var(--warning-500, var(--primary-500))" : "var(--border-default)"}`, background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 4px", boxSizing: "border-box", fontWeight: 700 }}
                                />
                                <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>pts</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  <FlightsView state={fl} nameOf={nameOf} onReportRace={doReportFlightRace} onFillRaces={doFillFlightRaces} onClearRace={doClearFlightRace} />
                </div>
              )}
            </div>
          )}

          {/* Crew Standings — per-crew (community) roll-up for multi-crew events.
              Shows for any format once ≥2 crews are represented; auto-broadcasts
              to the OBS overlay (see the crew-overlay effect above). */}
          {showDashboard && crewStandings.length >= 2 && (tournament.status === "in_progress" || tournament.status === "complete") && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "var(--font-size-18)" }}><IconTrophy size={18} stroke={1.9} aria-hidden /> Crew Standings</h2>
                <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Live on your overlay</span>
              </div>
              <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
                Points rolled up per crew as results come in. Position the board via <strong>Account → Overlay Layout → Apps → Crew Standings</strong>.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {crewStandings.map((c, i) => {
                  const meta = communityMeta[c.communityId];
                  const medal = i < 3 ? <PlaceMedal rank={i + 1} /> : null;
                  return (
                    <div key={c.communityId} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.35rem 0.6rem", borderRadius: "0.35rem", background: i < 3 ? "var(--surface-raised, var(--surface-default))" : "transparent" }}>
                      <span style={{ width: 24, textAlign: "center", fontWeight: 800 }}>{medal ?? i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>
                        {meta?.name ?? "Crew"}
                        <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}> · {c.memberCount} {c.memberCount === 1 ? "player" : "players"}</span>
                      </span>
                      <span style={{ fontWeight: 700, fontSize: "var(--font-size-14)", minWidth: 52, textAlign: "right" }}>{c.points} pts</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Race Scoring — per-race entry + live cumulative standings (points, no flights) */}
          {showDashboard && isPoints && !useFlights && (tournament.status === "in_progress" || tournament.status === "complete") && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "var(--font-size-18)" }}>Race Scoring</h2>
                {liveStandings.some((s) => s.racesPlayed > 0) && (
                  <Button variant="primary" size="small" onClick={finalizeStandings}>Finalize standings →</Button>
                )}
              </div>
              <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
                Enter each race&apos;s finishing order. Standings update live (points from the scoring table); <strong>Finalize</strong> writes them as the official results.
              </p>

              {/* Live standings */}
              {races.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <span className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
                    Live Standings · {races.length} race{races.length === 1 ? "" : "s"}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                    {liveStandings.filter((s) => s.racesPlayed > 0).map((s, i) => (
                      <div key={s.participantId} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.35rem 0.6rem", borderRadius: "0.35rem", background: i < 3 ? "var(--surface-raised, var(--surface-default))" : "transparent" }}>
                        <span style={{ width: 24, textAlign: "center", fontWeight: 800 }}>{i + 1}</span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>{s.name}</span>
                        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{s.wins}W · avg {s.avgPosition?.toFixed(1)}</span>
                        <span style={{ fontWeight: 700, fontSize: "var(--font-size-14)", minWidth: 52, textAlign: "right" }}>{s.points} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entered races */}
              {races.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.25rem" }}>
                  {races.map((r) => {
                    const rn = (r as { round_number?: number | null }).round_number;
                    return (
                      <span key={r.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0.5rem", borderRadius: "999px", background: "var(--surface-default)", border: "1px solid var(--border-default)", fontSize: "var(--font-size-12)" }}>
                        {rn ? `R${rn} · ` : ""}Race {r.race_number} ({Object.keys(r.placements || {}).length})
                        <button onClick={() => removeRace(r.id)} aria-label={`Remove race ${r.race_number}`} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-tertiary)", fontWeight: 700 }}>×</button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Add race */}
              {tournament.status === "in_progress" && (() => {
                const nextRace = (races[races.length - 1]?.race_number ?? 0) + 1;
                const active = participants.filter((p) => p.status !== "dropped");
                const canSave = raceInputMode === "tap" ? raceTap.length > 0 : Object.values(raceEntry).some((v) => v);
                return (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <span className="account-card__label">
                        Enter Race {nextRace}: {raceInputMode === "tap" ? "tap players in finishing order" : "finishing positions"}
                      </span>
                      <div style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: "0.5rem", overflow: "hidden" }}>
                        {([["tap", "Tap"], ["type", "Type"]] as const).map(([m, label]) => (
                          <button key={m} type="button" onClick={() => setRaceInputMode(m)}
                            style={{ padding: "0.25rem 0.7rem", fontSize: "var(--font-size-12)", fontWeight: 600, border: "none", cursor: "pointer",
                              background: raceInputMode === m ? "var(--bg-primary, var(--primary-500))" : "transparent",
                              color: raceInputMode === m ? "var(--text-on-primary, #fff)" : "var(--text-secondary)" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(() => {
                      const cur = currentRandomizerRace();
                      const track = cur?.track as { course?: { name?: string } } | null;
                      if (!cur) return null;
                      return (
                        <p style={{ fontSize: "var(--font-size-12)", color: "var(--bg-primary, var(--primary-600))", fontWeight: 600, margin: "0 0 0.75rem" }}>
                          <IconDice5 size={15} stroke={1.9} aria-hidden /> Scoring the live randomized race: Round {cur.round}{track?.course?.name ? ` · ${track.course.name}` : ""}. This race will be tagged with it.
                        </p>
                      );
                    })()}

                    {raceInputMode === "tap" ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.4rem", marginBottom: "0.75rem" }}>
                        {active.map((p) => {
                          const pos = raceTap.indexOf(p.id);
                          const on = pos >= 0;
                          return (
                            <button key={p.id} type="button" onClick={() => toggleRaceTap(p.id)}
                              style={{ display: "flex", alignItems: "center", gap: "0.6rem", width: "100%", textAlign: "left", minWidth: 0,
                                padding: "0.4rem 0.5rem", borderRadius: 8, cursor: "pointer",
                                border: `1px solid ${on ? "var(--primary-500)" : "var(--border-default)"}`,
                                background: on ? "var(--surface-selected, var(--primary-100))" : "var(--surface-default)", color: "var(--text-primary)" }}>
                              <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", fontSize: 12, fontWeight: 800,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: on ? "var(--primary-500)" : "var(--background-secondary)",
                                color: on ? "var(--text-on-primary, #fff)" : "var(--text-tertiary)" }}>
                                {on ? pos + 1 : ""}
                              </span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-12)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.display_name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
                        {active.map((p) => (
                          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "var(--font-size-12)", minWidth: 0 }}>
                            <input
                              type="number"
                              min={1}
                              value={raceEntry[p.id] ?? ""}
                              onChange={(e) => setRaceEntry((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              placeholder="-"
                              style={{ width: 48, flexShrink: 0, height: 32, textAlign: "center", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 4px", boxSizing: "border-box" }}
                            />
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.display_name}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    <Button variant="secondary" size="small" onClick={addRace} disabled={!canSave}>
                      Save race {nextRace}{raceInputMode === "tap" && raceTap.length > 0 ? ` (${raceTap.length} placed)` : ""}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Final Results — manual placement/points (points, no flights; elim,
              Heat→Mains + flights write their standings from their own finalize) */}
          {showDashboard && isPoints && !useFlights && (tournament.status === "in_progress" || tournament.status === "complete") && (
            <div className="comp-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "var(--font-size-18)" }}>Final Results</h2>
                <Button variant="ghost" size="small" onClick={autoPlaceByPoints}>Auto-place by points</Button>
              </div>
              <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
                Enter each player&apos;s finishing place and points. Saved live, so participants see these as standings on the public page.
              </p>
              {participants.filter((p) => p.status !== "dropped").length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>No participants to score yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[...participants]
                    .filter((p) => p.status !== "dropped")
                    .sort((a, b) => (results[a.id]?.placement ?? 999) - (results[b.id]?.placement ?? 999))
                    .map((p) => (
                      <div key={p.id} className="manage-participant-row">
                        <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>
                          {p.display_name}{p.users?.email_verified && <VerifiedBadge />}
                        </span>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", flexShrink: 0 }}>
                          Place
                          <input
                            type="number"
                            min={1}
                            value={results[p.id]?.placement != null ? String(results[p.id]?.placement) : ""}
                            onChange={(e) => upsertResult(p.id, { placement: e.target.value ? Number(e.target.value) : null })}
                            style={{ width: 56, height: 32, textAlign: "center", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 4px", boxSizing: "border-box" }}
                          />
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", flexShrink: 0 }}>
                          Points
                          <input
                            type="number"
                            value={results[p.id]?.points != null ? String(results[p.id]?.points) : ""}
                            onChange={(e) => upsertResult(p.id, { points: e.target.value ? Number(e.target.value) : null })}
                            style={{ width: 64, height: 32, textAlign: "center", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 4px", boxSizing: "border-box" }}
                          />
                        </label>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

        </div>
      </Container>
    </main>
  );
}
