"use client";

import { AiTournamentHelper } from "@/components/ai/AiTournamentHelper";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Accordion, Alert, Badge, Card, Container, Button, Input, Modal, Switch, Textarea } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { isReservedName, RESERVED_TITLE_MESSAGE, reservedNameError } from "@/lib/reservedName";
import { PlaceAutocompleteInput } from "@/components/maps/PlaceAutocompleteInput";
import { isPartyGame, PARTY_SCORING_TABLE, PARTY_TABLE_ADVANCE, PARTY_TABLE_SIZE } from "@/lib/party/tournament";
import { defaultRules as smashDefaultRules, isSmashGame, SMASH_FLIGHT_SIZE, SMASH_SCORING_TABLE } from "@/lib/smash/tournament";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { canCreateTournament, generateShareToken } from "@/lib/tournaments";
import { describeStructure } from "@/lib/tournaments/groups";
import { circuitLaunch } from "@/lib/tournaments/circuit";

/** Circuit launch wording (ORGANIZER_BILLING_LAUNCH). */
const circuitPhase = circuitLaunch();
import { getGameLobbySize } from "@/lib/tournaments/gameData";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { isEmailVerified } from "@/lib/auth-utils";
import { useAnalytics } from "@/hooks/useAnalytics";
import { detectBrowserTimeZone, currentZoneLabel } from "@/lib/time/format";
import { IconSparkles, IconTournament, IconTrophy } from "@tabler/icons-react";
import { KIRBY_PUBLIC, MARVEL_RIVALS_PUBLIC, OVERWATCH_PUBLIC, SMASH_PUBLIC, SPLATOON_PUBLIC } from "@/lib/games-visibility";
import { GameCover } from "@/components/games/GameCover";
import { LabeledCombobox } from "@/components/ui/LabeledCombobox";
import { GAME_CATALOG, catalogGame } from "@/data/game-catalog";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { SwissSettingsFields, DeckListSettingsFields } from "@/components/tournament/swiss/SwissSettingsFields";
import { defaultSwissSettings, type SwissSettings } from "@/lib/tournaments/swiss";
import { DEFAULT_DECK_LISTS, isDeckListGame, type DeckListSettings } from "@/lib/tournaments/deckLists";
import { HANDOFF_KEY, readHandoff, type Handoff } from "@/lib/brackets/tool";
import { useToast } from "@/components/toast/ToastProvider";

const ORGANIZER_TZ = typeof window !== "undefined" ? detectBrowserTimeZone() : null;

const MODES = [
  { value: "ffa", label: "FFA" },
  { value: "2v2", label: "2v2" },
  { value: "3v3", label: "3v3" },
  { value: "4v4", label: "4v4" },
  { value: "6v6", label: "6v6" },
];

const GAMES = [
  { value: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe" },
  { value: "mario-kart-world", label: "Mario Kart World" },
  { value: "super-mario-party-jamboree", label: "Mario Party Jamboree" },
  { value: "mario-party-superstars", label: "Mario Party Superstars" },
  ...(SMASH_PUBLIC ? [{ value: "super-smash-bros-ultimate", label: "Super Smash Bros. Ultimate" }] : []),
  { value: "street-fighter-6", label: "Street Fighter 6" },
  { value: "tekken-8", label: "Tekken 8" },
  ...(OVERWATCH_PUBLIC ? [{ value: "overwatch", label: "Overwatch" }] : []),
  ...(MARVEL_RIVALS_PUBLIC ? [{ value: "marvel-rivals", label: "Marvel Rivals" }] : []),
  ...(SPLATOON_PUBLIC ? [{ value: "splatoon-3", label: "Splatoon 3" }] : []),
  ...(KIRBY_PUBLIC ? [{ value: "kirby-air-riders", label: "Kirby Air Riders" }] : []),
  { value: "other", label: "Another game" },
];

/** The games with GameShuffle tools, shown as cards under the search. */
const POPULAR_GAMES = GAMES.filter((g) => g.value !== "other");
/** Every game GameShuffle knows by name, for the search: our games first, then the catalog. */
const SEARCH_OPTIONS = (() => {
  const seen = new Set<string>();
  return [...POPULAR_GAMES.map((g) => g.label), ...GAME_CATALOG.map((g) => g.name)]
    .filter((name) => { const k = name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((name) => ({ value: name, label: name }));
})();

/** Games where a racing ladder (Heat → Mains) makes no sense: one-on-one fighters and team hero shooters. */
const NO_HEAT_GAMES = new Set(["street-fighter-6", "tekken-8", "overwatch", "marvel-rivals", "splatoon-3"]);

// Mario Kart games carry rich track/build config; any other game runs the
// game-agnostic formats (brackets / points / heat→mains) on named participants.
function slugifyGame(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// Competition structure. FFA-points, round-robin, both brackets, and the
// Heat → Mains ladder run now; Swiss turns on once supabase/swiss-m1.sql has run.
const FORMATS = [
  { value: "ffa_points", label: "FFA / Points", available: true },
  { value: "single_elim", label: "Single Elim", available: true },
  { value: "double_elim", label: "Double Elim", available: true },
  { value: "heat_mains", label: "Heat → Mains ★", available: true },
  { value: "swiss", label: "Swiss", available: false },
];

export default function CreateTournamentPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { trackEvent } = useAnalytics();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What are you running?
  const [runMode, setRunMode] = useState<"single" | "championship">("single");
  // Popular games: one row until asked for the rest. The AI helper opens in a window.
  const [showAllGames, setShowAllGames] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  // AI text lands in More options, so it opens when the helper fills it.
  const [moreOpen, setMoreOpen] = useState(false);

  // Championship creation is Pro-only — read the user's effective tier for a
  // clean upsell (RLS also enforces this server-side).
  const [isPro, setIsPro] = useState(true); // optimistic until loaded (avoids a flash of the upsell)
  // Admins can host as GameShuffle (an official event; supabase/official-events-m1.sql).
  const [isAdmin, setIsAdmin] = useState(false);
  const [hostedByGs, setHostedByGs] = useState(false);
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("users").select("subscription_tier, role, circuit_tier, circuit_status").eq("id", user.id).maybeSingle();
      setIsPro(effectiveTier({ tier: normalizeTier(data?.subscription_tier), role: data?.role, circuitTier: data?.circuit_tier ?? null, circuitStatus: data?.circuit_status ?? null }) === "pro");
      setIsAdmin(data?.role === "admin");
    })();
  }, [user]);

  // Shared
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gameSlug, setGameSlug] = useState("mario-kart-8-deluxe");
  const [customGame, setCustomGame] = useState("");

  // Single tournament
  const [format, setFormat] = useState("ffa_points");
  const [mode, setMode] = useState("ffa");
  const [dateTime, setDateTime] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [locationType, setLocationType] = useState<"online" | "in_person">("online");
  const [locationText, setLocationText] = useState("");
  const [acceptanceMode, setAcceptanceMode] = useState("manual");
  /* Open is the default because most one-off nights want the friend who will
     not sign up for anything. Championship events are forced to accounts_only
     further down, and by a CHECK constraint in the database. */
  const [entryPolicy, setEntryPolicy] = useState<"open" | "accounts_only">("open");
  const [communityLink, setCommunityLink] = useState("");
  const [communityName, setCommunityName] = useState("");
  // Structured organizer: "" = individual (just me), else a community id.
  const [organizerCommunityId, setOrganizerCommunityId] = useState("");
  const [organizerCommunities, setOrganizerCommunities] = useState<{ id: string; slug: string; displayName: string | null }[]>([]);
  const [rules, setRules] = useState("");

  // Championship
  const [hmSeries, setHmSeries] = useState(2);
  const [hmHeatSize, setHmHeatSize] = useState<number | "auto">("auto");
  // Lobby levers for elimination formats. Default lobby 2 / advance 1 = the
  // classic 1v1 bracket; bump lobby size for a "group knockout" (lobbies of N,
  // top advance). `bracketing` is derived from the format, not a separate lever.
  const [gkLobby, setGkLobby] = useState(2);
  const [gkAdvance, setGkAdvance] = useState(1);
  const [lobbyCustom, setLobbyCustom] = useState(false);
  const isElim = format === "single_elim" || format === "double_elim";
  // Swiss (and tournament deck lists for Pokémon TCG) once the database has them.
  const [swissReady, setSwissReady] = useState(false);
  const [swissSettings, setSwissSettings] = useState<SwissSettings>(() => defaultSwissSettings(true));
  const [deckLists, setDeckLists] = useState<DeckListSettings>({ ...DEFAULT_DECK_LISTS, when: "join" });
  useEffect(() => {
    fetch("/api/tournaments/swiss-ready").then((r) => (r.ok ? r.json() : null)).then((d) => setSwissReady(!!d?.ready)).catch(() => {});
  }, []);
  const formats = FORMATS.map((f) => (f.value === "swiss" ? { ...f, available: swissReady } : f));
  // From the free bracket tools ("Run it live", ?from=bracket): the format and
  // name come along, and the players are added as guests once the event exists.
  const toast = useToast();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("from")) return;
    let h: Handoff | null = null;
    try { h = readHandoff(localStorage.getItem(HANDOFF_KEY)); } catch { /* storage blocked */ }
    if (!h) return;
    /* eslint-disable react-hooks/set-state-in-effect -- read once from what the bracket tool left */
    setHandoff(h);
    setRunMode("single");
    setFormat(h.format);
    if (h.title) setTitle(h.title);
    if (h.format === "swiss") {
      const rounds = h.swissRounds ?? "auto";
      setSwissSettings((s) => ({ ...s, rounds, topCut: h.from === "roundrobin" ? 0 : s.topCut }));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const dropHandoff = () => {
    setHandoff(null);
    try { localStorage.removeItem(HANDOFF_KEY); } catch { /* storage blocked */ }
  };
  const importGuests = async (tournamentId: string) => {
    if (!handoff) return;
    const res = await fetch(`/api/tournament/${tournamentId}/import-guests`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names: handoff.names }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; added?: number; left?: number; cap?: { kind: "plan" | "event"; players: number } | null } | null;
    if (!res?.ok || !j?.ok) { toast.error("Couldn't add your players. Add them on the Players tab.", { title: "Tournament made" }); return; }
    try { localStorage.removeItem(HANDOFF_KEY); } catch { /* storage blocked */ }
    const added = j.added ?? 0;
    if (j.left && j.cap) {
      toast.warning(
        j.cap.kind === "plan"
          ? `${added} players added as guests. Your plan fits ${j.cap.players} players in a tournament, so ${j.left} weren't added. GS Circuit fits 64 or 256.`
          : `${added} players added as guests. The tournament's limit is ${j.cap.players}, so ${j.left} weren't added.`,
        { title: "Tournament made" },
      );
    } else {
      toast.success(`${added} ${added === 1 ? "player" : "players"} added as guests.`, { title: "Tournament made" });
    }
  };
  const gkBracketing = format === "double_elim" ? "double" : "single";
  // GS Circuit billing (the admin switch) and this organizer's plan, for the field-size note.
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [circuitPlan, setCircuitPlan] = useState<{ plan: string | null; graceLabel: string | null }>({ plan: null, graceLabel: null });
  useEffect(() => {
    fetch("/api/tournaments/billing-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { billingEnabled?: boolean; plan?: string | null; graceUntil?: string | null } | null) => {
        if (!d) return;
        setBillingEnabled(!!d.billingEnabled);
        setCircuitPlan({
          plan: d.plan ?? null,
          graceLabel: d.graceUntil ? new Date(d.graceUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" }) : null,
        });
      })
      .catch(() => {});
  }, [user]);
  // Communities the organizer can present this event under (owner/mod).
  useEffect(() => {
    fetch("/api/communities/organizable")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.communities)) setOrganizerCommunities(d.communities); })
      .catch(() => {});
  }, []);

  if (!user) {
    return (
      <main style={{ paddingTop: "3rem" }}>
        <Container>
          <div className="comp-card" style={{ textAlign: "center", padding: "3rem" }}>
            <h2>Log in to create a tournament</h2>
            <a href="/login" style={{ marginTop: "1rem", display: "inline-block" }}>
              <Button variant="primary">Log In</Button>
            </a>
          </div>
        </Container>
      </main>
    );
  }

  if (!isEmailVerified(user)) {
    const handleResend = async () => {
      const supabase = createClient();
      await supabase.auth.resend({ type: "signup", email: user.email! });
    };
    return (
      <main style={{ paddingTop: "3rem" }}>
        <Container>
          <div className="comp-card" style={{ textAlign: "center", padding: "3rem", maxWidth: 500, margin: "0 auto" }}>
            <h2 style={{ marginBottom: "0.75rem" }}>Verify your email</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              You need to verify your email address before creating a tournament. Check your inbox for a confirmation link.
            </p>
            <Button variant="primary" onClick={handleResend}>Resend Verification Email</Button>
          </div>
        </Container>
      </main>
    );
  }

  const isOtherGame = gameSlug === "other";
  // Mario Party runs on the standard formats with tables of four and steep
  // 10-6-3-1 scoring. Heat → Mains (and so Championship series) doesn't fit it.
  const isParty = isPartyGame(gameSlug);
  // Smash runs the standard formats too: classic 1v1 brackets with best-of sets
  // and stage striking, or four-player FFA points in flights.
  const isSmash = isSmashGame(gameSlug);
  const noHeat = isParty || isSmash || NO_HEAT_GAMES.has(gameSlug);
  const selectGame = (slug: string) => {
    setGameSlug(slug);
    if (isPartyGame(slug) || isSmashGame(slug)) {
      setGkLobby(isSmashGame(slug) ? 2 : PARTY_TABLE_SIZE);
      setGkAdvance(isSmashGame(slug) ? 1 : PARTY_TABLE_ADVANCE);
      if (format === "heat_mains") setFormat(isSmashGame(slug) ? "single_elim" : "ffa_points");
      if (runMode === "championship") setRunMode("single");
    } else if (NO_HEAT_GAMES.has(slug)) {
      // One-on-one fighters and team shooters play brackets, not a racing ladder.
      if (format === "heat_mains") setFormat("single_elim");
      if (runMode === "championship") setRunMode("single");
    }
  };
  // "Another game": a catalog game keeps its catalog slug and name (so its box
  // art and name show everywhere); anything typed gets a slug from its name.
  const catalogPick = isOtherGame ? catalogGame(customGame) : null;
  const resolvedSlug = isOtherGame ? (catalogPick ? catalogPick.appSlug ?? catalogPick.slug : slugifyGame(customGame) || "custom-game") : gameSlug;
  const gameLabel = isOtherGame ? (catalogPick?.name ?? customGame.trim()) : GAMES.find((g) => g.value === gameSlug)?.label ?? gameSlug;
  // Mario Kart carries race settings (race count, cc, items); every other game
  // without its own tools records just its name. Non-Mario-Kart picks used to
  // get Mario Kart's race defaults by mistake.
  const isKart = gameSlug === "mario-kart-8-deluxe" || gameSlug === "mario-kart-world";
  /** The search: one of our games selects it (with its tools); anything else is "another game" by name. */
  const searchGame = (name: string) => {
    const typed = name.trim();
    const entry = typed ? catalogGame(typed) : null;
    const ours = POPULAR_GAMES.find((g) => g.label.toLowerCase() === typed.toLowerCase() || (entry && (g.value === entry.slug || g.value === entry.appSlug)));
    if (ours) { selectGame(ours.value); setCustomGame(""); return; }
    if (!isOtherGame) selectGame("other");
    setCustomGame(typed);
  };
  const searchValue = isOtherGame ? customGame : gameLabel;

  const handleCreateSingle = async () => {
    const supabase = createClient();
    const { allowed, reason } = await canCreateTournament(user.id);
    if (!allowed) { setError(reason || "Cannot create tournament."); setSaving(false); return; }

    const row: Record<string, unknown> = {
        organizer_id: user.id,
        // Guarded: only send community_id when a community is chosen, so
        // individual tournaments keep working before the migration lands.
        ...(organizerCommunityId ? { community_id: organizerCommunityId } : {}),
        title: title.trim(),
        description: description.trim() || null,
        game_slug: resolvedSlug,
        format,
        mode,
        acceptance_mode: acceptanceMode,
        // datetime-local is a wall-clock time in the organizer's zone; store the
        // real UTC instant so every viewer sees it converted to their own zone.
        date_time: dateTime ? new Date(dateTime).toISOString() : null,
        max_participants: maxParticipants ? Number(maxParticipants) : null,
        community_link: communityLink.trim() || null,
        community_name: communityName.trim() || null,
        rules: rules.trim() || null,
        share_token: generateShareToken(),
        status: "draft",
        ...(hostedByGs ? { hosted_by_gs: true } : {}),
        ...(isParty ? { scoring_table: PARTY_SCORING_TABLE } : isSmash ? { scoring_table: SMASH_SCORING_TABLE } : {}),
        // MK games carry race/track/build config; other games just record a
        // label. Group Knockout adds its lobby rules on top, any game.
        settings: {
          ...(!isKart && !isParty && !isSmash
            ? { game_label: gameLabel }
            : isParty
              // Points runs in flights of four: one board game per round, leaders
              // grouped together as the rounds go on.
              ? { game_label: gameLabel, partyGame: true, useFlights: true, flightSize: PARTY_TABLE_SIZE, flightRounds: 3, racesPerRound: 1, flightReseed: "standings" }
            : isSmash
              // Best-of sets, legal stages and striking live in settings.smash (organizer-editable).
              ? { game_label: gameLabel, smashGame: true, smash: smashDefaultRules(), useFlights: true, flightSize: SMASH_FLIGHT_SIZE, flightRounds: 3, racesPerRound: 1, flightReseed: "standings" }
            : gameSlug === "mario-kart-world"
              ? { raceCount: 12, items: "normal", game_label: gameLabel }
              : { raceCount: 12, cc: "150cc", items: "normal", cpu: "hard", game_label: gameLabel }),
          ...(isElim ? { lobbySize: gkLobby, advance: gkAdvance } : {}),
          ...(format === "swiss" ? { swiss: swissSettings } : {}),
          ...(isDeckListGame(resolvedSlug) && swissReady ? { deckLists } : {}),
          locationType,
          location: locationType === "in_person" ? (locationText.trim() || null) : null,
        },
    };

    /* Guarded like community_id above: `entry_policy` arrives with
       tournament-entry-policy-m1, so send it and retry without it if the column
       is not there yet. Creating a tournament must not depend on a migration. */
    let { data, error: dbError } = await supabase
      .from("tournaments").insert({ ...row, entry_policy: entryPolicy }).select("id").single();
    if (dbError && /entry_policy/i.test(dbError.message)) {
      ({ data, error: dbError } = await supabase
        .from("tournaments").insert(row).select("id").single());
    }

    if (dbError) {
      const missingColumn = /hosted_by_gs/i.test(dbError.message);
      setError(missingColumn ? "Official events need the latest database update (official-events-m1)." : reservedNameError(dbError.message) ?? dbError.message);
      setSaving(false);
      return;
    }
    if (data) {
      trackEvent("Tournament Created", { mode, game: resolvedSlug, format });
      if (handoff) await importGuests(data.id);
      router.push(`/tournament/${data.id}/manage${handoff ? "?tab=players" : ""}`);
    }
  };

  const handleCreateChampionship = async () => {
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("championships")
      .insert({
        owner_id: user.id,
        name: title.trim(),
        description: description.trim() || null,
        game_slug: resolvedSlug,
        settings: { series: hmSeries, heatSize: hmHeatSize, mode: "ffa", items: "normal", game_label: gameLabel },
        share_token: generateShareToken(),
      })
      .select("id")
      .single();

    if (dbError) { setError(dbError.message); setSaving(false); return; }
    if (data) { trackEvent("Championship Created", { game: resolvedSlug }); router.push(`/tournament/championship/${data.id}/manage`); }
  };

  const handleCreate = async () => {
    if (runMode === "championship" && !isPro) { setError("Championship series is a GS Pro feature."); return; }
    if (runMode === "championship" && noHeat) { setError(`Championship series runs Heat → Mains, which doesn't suit ${isSmash ? "Smash" : isParty ? "Mario Party" : gameLabel}. Run a single tournament instead.`); return; }
    if (!title.trim()) { setError(`${runMode === "championship" ? "Championship" : "Tournament"} name is required.`); return; }
    if (isReservedName(title) && !(runMode === "single" && hostedByGs)) { setError(RESERVED_TITLE_MESSAGE); return; }
    if (isOtherGame && !customGame.trim()) { setError("Enter the name of the game."); return; }
    setSaving(true);
    setError(null);
    if (runMode === "championship") await handleCreateChampionship();
    else await handleCreateSingle();
  };

  const runPick = (id: "single" | "championship", heading: string, blurb: string) => (
    <Card
      variant="outlined"
      padding="small"
      interactive
      selected={runMode === id}
      onClick={() => setRunMode(id)}
      className="run-pick"
    >
      <span className="run-pick__icon" aria-hidden>{id === "single" ? <IconTournament size={20} stroke={1.9} /> : <IconTrophy size={20} stroke={1.9} />}</span>
      <span className="run-pick__title">
        {heading}
        {id === "championship" && !isPro && <Badge variant="info" size="small">Pro</Badge>}
      </span>
      <span className="run-pick__text">{blurb}</span>
    </Card>
  );
  // The selected game stays in view even when it's past the first row.
  const pickedIndex = POPULAR_GAMES.findIndex((g) => g.value === gameSlug);
  const visibleGames = showAllGames || pickedIndex >= 6 ? POPULAR_GAMES : POPULAR_GAMES.slice(0, 6);

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem", minHeight: "100%", background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      <Container>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h1 style={{ fontSize: "var(--font-size-24)", fontWeight: 700, marginBottom: "1.5rem" }}>Create {runMode === "championship" ? "a Championship" : "a Tournament"}</h1>

          {error && <div className="auth-page__error" style={{ marginBottom: "1.5rem" }}>{error}</div>}

          {handoff && (
            <Alert variant="info" title="From the bracket tool" onClose={dropHandoff} className="create-handoff">
              Your {handoff.names.length} players are added as guests once the tournament is made, and they can claim their spot later.{" "}
              {handoff.from === "roundrobin" ? "A round robin runs here as Swiss, with everyone meeting once. " : ""}
              Pick the game and the details below.
            </Alert>
          )}

          {/* What are you running? */}
          <div className="comp-card create-card">
            <h2 className="create-card__title">What are you running?</h2>
            <div className="run-picks" role="group" aria-label="What are you running">
              {runPick("single", "Single tournament", "One event: brackets, points, Swiss or the Heat → Mains ladder. Play it out and share the results.")}
              {runPick("championship", "Championship series", "A season of Heat → Mains events, with points adding up into one standings table.")}
            </div>
          </div>

          {/* The event: its name and the game. */}
          <div className="comp-card create-card">
            <h2 className="create-card__title">The event</h2>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>{runMode === "championship" ? "Season / League Name" : "Tournament Name"} *</label>
                <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={runMode === "championship" ? "Friday Night League" : "Friday Night Karts"} />
              </div>
              {isAdmin && runMode === "single" && (
                <Switch
                  checked={hostedByGs}
                  onChange={(e) => setHostedByGs(e.target.checked)}
                  label="Host as GameShuffle"
                  helperText="An official event: the page shows GameShuffle as the host with an Official badge, and the GameShuffle name can be used in the title."
                />
              )}
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Game</label>
                <div className="game-pick__search">
                  {searchValue.trim() && (
                    <span className="game-pick__cover">
                      <GameCover slug={isOtherGame ? catalogPick?.slug : gameSlug} name={isOtherGame ? catalogPick?.name ?? customGame.trim() : gameLabel} />
                    </span>
                  )}
                  <LabeledCombobox
                    label="Game"
                    value={searchValue}
                    onChange={searchGame}
                    options={SEARCH_OPTIONS}
                    placeholder="Search for the game you're playing"
                    allowCreate
                    createLabel="Use"
                  />
                </div>
                <p className="game-pick__hint">
                  Brackets, points and Heat → Mains work for any game.{" "}
                  {isOtherGame && customGame.trim() && !catalogPick ? "We'll use the name as you typed it." : "Not in the list? Type the name and pick Use."}
                </p>
                <h3 className="game-pick__heading">Most popular games</h3>
                <ul className="game-pick__grid" aria-label="Most popular games">
                  {visibleGames.map((g) => (
                    <li key={g.value}>
                      <Card
                        variant="outlined"
                        padding="small"
                        interactive
                        selected={gameSlug === g.value}
                        onClick={() => { selectGame(g.value); setCustomGame(""); }}
                        className="game-pick__card"
                        aria-label={g.label}
                      >
                        <span className="game-pick__card-cover"><GameCover slug={g.value} name={g.label} /></span>
                        <span className="game-pick__card-name">{g.label}</span>
                      </Card>
                    </li>
                  ))}
                </ul>
                {visibleGames.length < POPULAR_GAMES.length && (
                  <span className="create-showall"><Button variant="ghost" size="small" onClick={() => setShowAllGames(true)}>Show all {POPULAR_GAMES.length} popular games</Button></span>
                )}
              </div>

          </div>

          {/* Format: how it's played. */}
          <div className="comp-card create-card">
            <div className="create-card__head">
              <h2 className="create-card__title">Format</h2>
              {runMode === "single" && (!isOtherGame || customGame.trim()) && (
                <Button variant="secondary" size="small" iconBefore={IconSparkles} onClick={() => setAiOpen(true)}>Draft it with AI</Button>
              )}
            </div>
            {runMode === "single" ? (
              <>
                  <div>
                    <div role="group" aria-label="Format" style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
                      {formats.filter((f) => !(noHeat && f.value === "heat_mains")).map((f) => (
                        <Button key={f.value} variant={format === f.value ? "primary" : "secondary"} size="small" disabled={!f.available} onClick={() => f.available && setFormat(f.value)}>
                          {f.label}{!f.available ? " · Soon" : ""}
                        </Button>
                      ))}
                    </div>
                    <p style={{ fontSize: "var(--font-size-12)", lineHeight: 1.4, color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
                      {format === "swiss"
                        ? "Swiss: everyone plays every round against someone on the same record, with no rematches. The best records go on to a top cut bracket."
                        : format === "heat_mains"
                        ? "Heat → Mains: race heats into A/B mains, win to lock the A Main, top finishers transfer up. Want points across a season? Pick Championship series above."
                        : isElim
                          ? `${format === "double_elim" ? "Double" : "Single"} elimination. Lobbies of 2 is a classic 1v1 bracket; make the lobbies bigger to race in groups where the top finishers move on${format === "double_elim" ? " and everyone else gets a second chance in a lower bracket" : ""}.`
                          : isParty
                            ? "Points: each board game at a table of four scores 10, 6, 3 and 1, plus any mission bonus points. Every table plays the same rolled board each round."
                          : isSmash
                            ? "Points: four-player free-for-alls in flights, scoring 10, 6, 3 and 1, plus mission bonus points. Every flight plays the same rolled stage each round."
                            : swissReady ? "FFA/Points: every race scores, and the most points wins." : "FFA/Points and Round Robin run now. Swiss is on the way."}
                    </p>
                    {format === "swiss" && (
                      <div style={{ marginTop: "0.85rem" }}>
                        <SwissSettingsFields value={swissSettings} onChange={setSwissSettings} players={Number(maxParticipants) || 0} />
                      </div>
                    )}
                    {isDeckListGame(resolvedSlug) && swissReady && (
                      <div className="swiss-decks-panel">
                        <div className="swiss-decks-panel__head"><span className="account-card__label">Deck lists</span><Badge variant="info" size="small">Pokémon TCG</Badge></div>
                        <DeckListSettingsFields value={deckLists} onChange={setDeckLists} swiss={format === "swiss"} />
                      </div>
                    )}
                    {isElim && (
                      <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <div>
                          <label className="account-card__label" style={{ display: "block", marginBottom: "0.35rem" }}>Players per lobby</label>
                          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                            {[2, 3, 4, 6, 8].map((n) => (
                              <Button key={n} variant={!lobbyCustom && gkLobby === n ? "primary" : "secondary"} size="small"
                                onClick={() => { setLobbyCustom(false); setGkLobby(n); setGkAdvance((a) => Math.min(a, n - 1)); }}>{n}</Button>
                            ))}
                            <Button variant={lobbyCustom ? "primary" : "secondary"} size="small" onClick={() => setLobbyCustom(true)}>Custom</Button>
                            {lobbyCustom && (
                              <input type="number" min={2} max={24} value={gkLobby} aria-label="Custom lobby size" autoFocus
                                onChange={(e) => { const n = Math.max(2, Math.min(24, Number(e.target.value) || 2)); setGkLobby(n); setGkAdvance((a) => Math.min(a, n - 1)); }}
                                style={{ width: 72, height: 30, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 6px", background: "var(--surface-default)", color: "var(--text-primary)" }} />
                            )}
                          </div>
                        </div>
                        {gkLobby > 2 && (
                          <div>
                            <label className="account-card__label" style={{ display: "block", marginBottom: "0.35rem" }}>How many move on from each lobby</label>
                            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                              {Array.from({ length: gkLobby - 1 }, (_, i) => i + 1).map((n) => (
                                <Button key={n} variant={gkAdvance === n ? "primary" : "secondary"} size="small" onClick={() => setGkAdvance(n)}>{n}</Button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ padding: "0.65rem 0.85rem", borderRadius: "0.5rem", border: "1px solid var(--border-default)", background: "var(--surface-raised, var(--surface-default))", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                          {gkLobby <= 2
                            ? `Classic 1v1 ${format === "double_elim" ? "double" : "single"}-elimination bracket.${isSmash ? " Best-of-3 sets (finals best of 5) with stage striking; change the rules once it's created." : ""}`
                            : describeStructure({ lobbySize: gkLobby, advance: gkAdvance, bracketing: gkBracketing }, maxParticipants ? Number(maxParticipants) : 16)}
                          {gkLobby > 2 && !maxParticipants && <span style={{ color: "var(--text-tertiary)" }}> (example with 16 players)</span>}
                        </div>
                        {billingEnabled && (circuitPlan.plan === "grace" || circuitPlan.plan === "free") && (
                          <p style={{ fontSize: "var(--font-size-12)", lineHeight: 1.4, color: "var(--text-tertiary)", margin: 0 }}>
                            <IconSparkles size={14} stroke={1.9} aria-hidden />{" "}
                            {circuitPlan.plan === "grace"
                              ? <><strong>GameShuffle Circuit is free for you until {circuitPlan.graceLabel}:</strong> you ran tournaments before it launched, so bigger fields and every organizer feature cost nothing until then.</>
                              : <><strong>Free plan:</strong> up to {getGameLobbySize(isOtherGame ? null : gameSlug)} players get a spot; anyone after that joins the waitlist. Upgrade to <Link href="/gs-circuit">GameShuffle Circuit</Link> (64 or 256 players) and they&rsquo;re offered spots in line order.</>}
                          </p>
                        )}
                        {!billingEnabled && (
                          <p style={{ fontSize: "var(--font-size-12)", lineHeight: 1.4, color: "var(--text-tertiary)", margin: 0 }}>
                            <IconSparkles size={14} stroke={1.9} aria-hidden /> <strong>GameShuffle Circuit {circuitPhase.phase === "preview" ? "preview" : "is free for now"}:</strong> fields over {getGameLobbySize(isOtherGame ? null : gameSlug)} players {circuitPhase.phase === "preview"
                              ? <>will become part of GameShuffle Circuit. Everything is free while it&rsquo;s in preview.</>
                              : <>become part of GameShuffle Circuit on {circuitPhase.dateLabel}. Until then it&rsquo;s free, and a tournament you create now keeps its Circuit features.</>}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Team Mode</label>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {MODES.map((m) => (
                        <Button key={m.value} variant={mode === m.value ? "primary" : "secondary"} size="small" onClick={() => setMode(m.value)}>{m.label}</Button>
                      ))}
                    </div>
                  </div>
                {/* GameShuffle doesn't know this game, so its rules are the format: they stay here rather than under More options. */}
                {isOtherGame && (
              <div className="create-field">
                <label className="account-card__label" htmlFor="create-rules">Rules</label>
                {isOtherGame && (
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", margin: "0 0 var(--spacing-12)" }}>
                    GameShuffle doesn&rsquo;t know {customGame.trim() || "this game"}, so the bracket, points or Heat → Mains
                    ladder runs on named players and these rules are what everyone plays by. Worth being specific: match
                    length, stage or map picks, tie-breaks.
                  </p>
                )}
                <Textarea
                  id="create-rules"
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder={isOtherGame
                    ? "e.g. Best of 3. Stage striking, no items. Tie-break on total stocks."
                    : "Any rules, notes, or instructions for participants..."}
                  rows={5}
                  fullWidth
                />
              </div>
                )}
              </>
            ) : (
              <>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Event format</label>
                    <div style={{ padding: "0.7rem 0.9rem", borderRadius: "0.5rem", border: "1px solid var(--border-default)", background: "var(--surface-raised, var(--surface-default))", fontSize: "var(--font-size-14)" }}>
                      <strong>Heat → Mains ★</strong>: every event in the season runs heats into a consi ladder, and the tiered points feed your season standings.
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Heat series (default)</label>
                      <select className="save-setup-input" value={hmSeries} onChange={(e) => setHmSeries(Number(e.target.value))}>
                        <option value={1}>1 round</option>
                        <option value={2}>2 rounds</option>
                      </select>
                    </div>
                    <div>
                      <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Heat size (default)</label>
                      <select className="save-setup-input" value={String(hmHeatSize)} onChange={(e) => setHmHeatSize(e.target.value === "auto" ? "auto" : Number(e.target.value))}>
                        <option value="auto">Auto (even)</option>
                        {[4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} / heat</option>)}
                      </select>
                    </div>
                  </div>
                  <p style={{ fontSize: "var(--font-size-12)", lineHeight: 1.4, color: "var(--text-tertiary)" }}>
                    Next you&apos;ll build the league roster (invite existing players or email an invite to create a free account) and run events.
                  </p>
              </>
            )}
          </div>

          {/* When and who: single tournaments only (a championship's events get their own dates). */}
          {runMode === "single" && (
            <div className="comp-card create-card">
              <h2 className="create-card__title">When and who</h2>
                  <div className="create-pair">
                    <div>
                      <label className="account-card__label" htmlFor="create-when" style={{ display: "block", marginBottom: "0.5rem" }}>Date and time</label>
                      <input id="create-when" type="datetime-local" className="save-setup-input" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
                      {ORGANIZER_TZ && (
                        <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                          Times are in your timezone ({currentZoneLabel(ORGANIZER_TZ)}). Attendees see the start time converted to theirs.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="account-card__label" htmlFor="create-max" style={{ display: "block", marginBottom: "0.5rem" }}>Max players</label>
                      <Input id="create-max" type="number" min={2} max={200} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="No limit" />
                    </div>
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Where</label>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: locationType === "in_person" ? "0.75rem" : 0 }}>
                      {([["online", "Online"], ["in_person", "In person"]] as const).map(([val, label]) => (
                        <Button key={val} variant={locationType === val ? "primary" : "secondary"} size="small" onClick={() => setLocationType(val)}>{label}</Button>
                      ))}
                    </div>
                    {locationType === "in_person" && (
                      <PlaceAutocompleteInput
                        value={locationText}
                        onChange={setLocationText}
                        onPick={(p) => setLocationText(p.address)}
                        placeholder="Venue or address (e.g. Card Kingdom, Seattle WA)"
                      />
                    )}
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Accept people</label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Button variant={acceptanceMode === "auto" ? "primary" : "secondary"} size="small" onClick={() => setAcceptanceMode("auto")}>Automatically</Button>
                      <Button variant={acceptanceMode === "manual" ? "primary" : "secondary"} size="small" onClick={() => setAcceptanceMode("manual")}>By hand</Button>
                    </div>
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Who can enter</label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Button variant={entryPolicy === "open" ? "primary" : "secondary"} size="small" onClick={() => setEntryPolicy("open")}>Anyone</Button>
                      <Button variant={entryPolicy === "accounts_only" ? "primary" : "secondary"} size="small" onClick={() => setEntryPolicy("accounts_only")}>Accounts only</Button>
                    </div>
                    <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.45rem", maxWidth: "46ch" }}>
                      {entryPolicy === "open"
                        ? "Easier to fill: people can enter by name without signing up. You will know less about who is coming."
                        : "Every entrant has a GameShuffle account, so you can see their history before you seed and their results follow them afterwards."}
                    </p>
                  </div>
            </div>
          )}

          {/* More options: everything that can wait (all of it can be changed on the manage page). */}
          <div className="comp-card create-card">
            <Accordion
              key={moreOpen ? "open" : "closed"}
              variant="flush"
              defaultOpenIds={moreOpen ? ["more"] : []}
              items={[{
                id: "more",
                title: "More options",
                description: runMode === "single" ? (isOtherGame ? "Description, organizer and community" : "Description, organizer and community, rules") : "Description",
                content: (
                  <div className="create-more">
              <div className="create-field">
                <label className="account-card__label" htmlFor="create-description">Description</label>
                <Textarea id="create-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={runMode === "championship" ? "What's this league about?" : "What's this tournament about?"} rows={3} fullWidth />
              </div>
                    {runMode === "single" && (
                      <>
                <div style={{ marginBottom: "1.25rem" }}>
                  <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Organized by</label>
                  <Select
                    value={organizerCommunityId}
                    onChange={(v) => setOrganizerCommunityId(typeof v === "string" ? v : v[0] ?? "")}
                    options={[
                      { value: "", label: "Just me (individual)" },
                      ...organizerCommunities.map((c) => ({ value: c.id, label: c.displayName || c.slug })),
                    ]}
                  />
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.4rem" }}>
                    {organizerCommunityId
                      ? "Listed as presented by this community."
                      : organizerCommunities.length
                        ? "Or present it under a community you manage."
                        : "Create or manage a community to present events under its name."}
                  </p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>{organizerCommunityId ? "Community Name (override)" : "Community Name"}</label>
                    <Input type="text" value={communityName} onChange={(e) => setCommunityName(e.target.value)} placeholder="MK Lounge Discord" />
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Community Link</label>
                    <Input type="url" value={communityLink} onChange={(e) => setCommunityLink(e.target.value)} placeholder="https://discord.gg/..." />
                  </div>
                </div>
                        {!isOtherGame && (
              <div className="create-field">
                <label className="account-card__label" htmlFor="create-rules">Rules</label>
                {isOtherGame && (
                  <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", margin: "0 0 var(--spacing-12)" }}>
                    GameShuffle doesn&rsquo;t know {customGame.trim() || "this game"}, so the bracket, points or Heat → Mains
                    ladder runs on named players and these rules are what everyone plays by. Worth being specific: match
                    length, stage or map picks, tie-breaks.
                  </p>
                )}
                <Textarea
                  id="create-rules"
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder={isOtherGame
                    ? "e.g. Best of 3. Stage striking, no items. Tie-break on total stocks."
                    : "Any rules, notes, or instructions for participants..."}
                  rows={5}
                  fullWidth
                />
              </div>
                        )}
                      </>
                    )}
                  </div>
                ),
              }]}
            />
          </div>

          {runMode === "single" && (
            <Modal isOpen={aiOpen} onClose={() => setAiOpen(false)} title="Draft it with AI" size="large">
              <AiTournamentHelper
                bare
                game={gameLabel}
                allowHeat={!noHeat}
                formatLabel={(v) => formats.find((f) => f.value === v)?.label.replace(" ★", "") ?? v}
                onUse={(part) => {
                  if (part.format && formats.some((f) => f.value === part.format && f.available)) setFormat(part.format);
                  if (part.description) setDescription(part.description);
                  if (part.rules) setRules(part.rules);
                  if (part.description || (part.rules && !isOtherGame)) setMoreOpen(true);
                }}
              />
            </Modal>
          )}

          {runMode === "championship" && !isPro && (
            <div className="comp-card" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <strong style={{ fontSize: "var(--font-size-16)" }}><IconTrophy size={16} stroke={1.9} aria-hidden /> Championship series is a GS Pro feature</strong>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "0.25rem 0 0" }}>
                  Run a full season with accumulating points, roster invites, and live standings. Single tournaments are free, so switch above to run one now.
                </p>
              </div>
              <Link href="/gs-pro" className={tagged(EVENTS.upgradeClicked, { from: "championship" })}><Button variant="primary">Upgrade to Pro</Button></Link>
            </div>
          )}

          <Button variant="primary" onClick={handleCreate} disabled={saving || (runMode === "championship" && !isPro)} fullWidth>
            {saving ? "Creating..." : runMode === "championship" ? (isPro ? "Create championship" : "Championship requires GS Pro") : "Create Tournament"}
          </Button>
        </div>
      </Container>
    </main>
  );
}
