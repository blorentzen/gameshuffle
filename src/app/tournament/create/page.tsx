"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Container, Button, Input } from "@empac/cascadeds";
import { PlaceAutocompleteInput } from "@/components/maps/PlaceAutocompleteInput";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { canCreateTournament, generateShareToken } from "@/lib/tournaments";
import { describeStructure } from "@/lib/tournaments/groups";
import { ORGANIZER_BILLING_LAUNCH } from "@/lib/tournaments/circuit";
import { getGameLobbySize } from "@/lib/tournaments/gameData";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { isEmailVerified } from "@/lib/auth-utils";
import { useAnalytics } from "@/hooks/useAnalytics";
import { detectBrowserTimeZone, currentZoneLabel } from "@/lib/time/format";

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
  { value: "other", label: "Other game" },
];

// Mario Kart games carry rich track/build config; any other game runs the
// game-agnostic formats (brackets / points / heat→mains) on named participants.
function slugifyGame(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// Competition structure. FFA-points, round-robin, both brackets, and the
// Heat → Mains ladder run now; Swiss is on the way.
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

  // Championship creation is Pro-only — read the user's effective tier for a
  // clean upsell (RLS also enforces this server-side).
  const [isPro, setIsPro] = useState(true); // optimistic until loaded (avoids a flash of the upsell)
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("users").select("subscription_tier, role, circuit_tier, circuit_status").eq("id", user.id).maybeSingle();
      setIsPro(effectiveTier({ tier: normalizeTier(data?.subscription_tier), role: data?.role, circuitTier: data?.circuit_tier ?? null, circuitStatus: data?.circuit_status ?? null }) === "pro");
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
  const [communityLink, setCommunityLink] = useState("");
  const [communityName, setCommunityName] = useState("");
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
  const gkBracketing = format === "double_elim" ? "double" : "single";
  // GS Circuit billing flag (admin-toggleable) — drives the free-preview hint.
  const [billingEnabled, setBillingEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/tournaments/billing-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setBillingEnabled(!!d.billingEnabled); })
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
  const resolvedSlug = isOtherGame ? slugifyGame(customGame) || "custom-game" : gameSlug;
  const gameLabel = isOtherGame ? customGame.trim() : GAMES.find((g) => g.value === gameSlug)?.label ?? gameSlug;

  const handleCreateSingle = async () => {
    const supabase = createClient();
    const { allowed, reason } = await canCreateTournament(user.id);
    if (!allowed) { setError(reason || "Cannot create tournament."); setSaving(false); return; }

    const { data, error: dbError } = await supabase
      .from("tournaments")
      .insert({
        organizer_id: user.id,
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
        // MK games carry race/track/build config; other games just record a
        // label. Group Knockout adds its lobby rules on top, any game.
        settings: {
          ...(isOtherGame
            ? { game_label: gameLabel }
            : gameSlug === "mario-kart-world"
              ? { raceCount: 12, items: "normal", game_label: gameLabel }
              : { raceCount: 12, cc: "150cc", items: "normal", cpu: "hard", game_label: gameLabel }),
          ...(isElim ? { lobbySize: gkLobby, advance: gkAdvance } : {}),
          locationType,
          location: locationType === "in_person" ? (locationText.trim() || null) : null,
        },
      })
      .select("id")
      .single();

    if (dbError) { setError(dbError.message); setSaving(false); return; }
    if (data) { trackEvent("Tournament Created", { mode, game: resolvedSlug, format }); router.push(`/tournament/${data.id}/manage`); }
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
    if (!title.trim()) { setError(`${runMode === "championship" ? "Championship" : "Tournament"} name is required.`); return; }
    if (isOtherGame && !customGame.trim()) { setError("Enter the name of the game."); return; }
    setSaving(true);
    setError(null);
    if (runMode === "championship") await handleCreateChampionship();
    else await handleCreateSingle();
  };

  const optionCard = (id: "single" | "championship", heading: string, blurb: string) => {
    const on = runMode === id;
    return (
      <button
        type="button"
        onClick={() => setRunMode(id)}
        style={{
          textAlign: "left", cursor: "pointer", padding: "1rem", borderRadius: "0.6rem", flex: 1, minWidth: 240,
          border: `1.5px solid ${on ? "var(--bg-primary, var(--primary-500))" : "var(--border-default)"}`,
          background: on ? "color-mix(in srgb, var(--primary-500) 10%, var(--surface-default))" : "var(--surface-default)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "var(--font-size-16)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {id === "championship" ? "🏆 " : ""}{heading}
          {id === "championship" && !isPro && (
            <span style={{ fontSize: "var(--font-size-12)", fontWeight: 700, padding: "0.05rem 0.4rem", borderRadius: 999, background: "color-mix(in srgb, var(--primary-500) 16%, var(--surface-default))", color: "var(--bg-primary, var(--primary-500))" }}>PRO</span>
          )}
          {on && <span style={{ marginLeft: "auto", color: "var(--bg-primary, var(--primary-500))" }}>✓</span>}
        </div>
        <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", lineHeight: 1.4 }}>{blurb}</div>
      </button>
    );
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem", minHeight: "100%", background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))" }}>
      <Container>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>Create {runMode === "championship" ? "a Championship" : "a Tournament"}</h1>

          {error && <div className="auth-page__error" style={{ marginBottom: "1.5rem" }}>{error}</div>}

          {/* What are you running? */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "1rem" }}>What are you running?</h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {optionCard("single", "Single tournament", "One event: brackets, points, round robin, or the Heat → Mains ladder. Play it out and share the results.")}
              {optionCard("championship", "Championship series", "A season of Heat → Mains events. Points accumulate across nights into a live standings table. Accounts-only roster.")}
            </div>
          </div>

          {/* Basics */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "1.5rem" }}>Basics</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>{runMode === "championship" ? "Season / League Name" : "Tournament Name"} *</label>
                <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={runMode === "championship" ? "Friday Night League" : "Friday Night Karts"} />
              </div>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Description</label>
                <textarea className="save-setup-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={runMode === "championship" ? "What's this league about?" : "What's this tournament about?"} rows={3} style={{ resize: "vertical" }} />
              </div>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Game</label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {GAMES.map((g) => (
                    <Button key={g.value} variant={gameSlug === g.value ? "primary" : "secondary"} size="small" onClick={() => setGameSlug(g.value)}>{g.label}</Button>
                  ))}
                </div>
                {isOtherGame && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <Input type="text" value={customGame} onChange={(e) => setCustomGame(e.target.value)} placeholder="Game name (e.g. Super Smash Bros, Rocket League)" />
                    <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                      Brackets, points, and Heat → Mains work for any game. Mario Kart&apos;s track &amp; build tools are the only game-specific extras.
                    </p>
                  </div>
                )}
              </div>

              {runMode === "single" ? (
                <>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Format</label>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {FORMATS.map((f) => (
                        <Button key={f.value} variant={format === f.value ? "primary" : "secondary"} size="small" disabled={!f.available} onClick={() => f.available && setFormat(f.value)}>
                          {f.label}{!f.available ? " · Soon" : ""}
                        </Button>
                      ))}
                    </div>
                    <p style={{ fontSize: "var(--font-size-12)", lineHeight: 1.4, color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
                      {format === "heat_mains"
                        ? "Heat → Mains: race heats into A/B mains, win to lock the A Main, top finishers transfer up. Want points across a season? Pick Championship series above."
                        : isElim
                          ? `${format === "double_elim" ? "Double" : "Single"} elimination. Lobbies of 2 is a classic 1v1 bracket; make the lobbies bigger to race in groups where the top finishers move on${format === "double_elim" ? " and everyone else gets a second chance in a lower bracket" : ""}.`
                          : "FFA/Points and Round Robin run now. Swiss is on the way."}
                    </p>
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
                            ? `Classic 1v1 ${format === "double_elim" ? "double" : "single"}-elimination bracket.`
                            : describeStructure({ lobbySize: gkLobby, advance: gkAdvance, bracketing: gkBracketing }, maxParticipants ? Number(maxParticipants) : 16)}
                          {gkLobby > 2 && !maxParticipants && <span style={{ color: "var(--text-tertiary)" }}> (example with 16 players)</span>}
                        </div>
                        {!billingEnabled && (
                          <p style={{ fontSize: "var(--font-size-12)", lineHeight: 1.4, color: "var(--text-tertiary)", margin: 0 }}>
                            ✨ <strong>GameShuffle Circuit preview:</strong> fields over {getGameLobbySize(isOtherGame ? null : gameSlug)} players will become part of GameShuffle Circuit{ORGANIZER_BILLING_LAUNCH ? ` starting ${new Date(ORGANIZER_BILLING_LAUNCH).toLocaleDateString()}` : ""}. Everything is free while it&rsquo;s in preview.
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Date & Time</label>
                      <input type="datetime-local" className="save-setup-input" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
                      {ORGANIZER_TZ && (
                        <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "0.35rem" }}>
                          Times are in your timezone ({currentZoneLabel(ORGANIZER_TZ)}). Attendees see the start time converted to theirs.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Max Participants</label>
                      <Input type="number" min={2} max={200} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="No limit" />
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
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Registration</label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Button variant={acceptanceMode === "auto" ? "primary" : "secondary"} size="small" onClick={() => setAcceptanceMode("auto")}>Auto-Accept</Button>
                      <Button variant={acceptanceMode === "manual" ? "primary" : "secondary"} size="small" onClick={() => setAcceptanceMode("manual")}>Manual Approval</Button>
                    </div>
                  </div>
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
          </div>

          {/* Single-only: Community + Rules */}
          {runMode === "single" && (
            <>
              <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
                <h2 style={{ fontSize: "1.4rem", marginBottom: "1.5rem" }}>Community</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Community Name</label>
                    <Input type="text" value={communityName} onChange={(e) => setCommunityName(e.target.value)} placeholder="MK Lounge Discord" />
                  </div>
                  <div>
                    <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Community Link</label>
                    <Input type="url" value={communityLink} onChange={(e) => setCommunityLink(e.target.value)} placeholder="https://discord.gg/..." />
                  </div>
                </div>
              </div>

              <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
                <h2 style={{ fontSize: "1.4rem", marginBottom: "1.5rem" }}>Rules</h2>
                <textarea className="save-setup-input" value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Any rules, notes, or instructions for participants..." rows={5} style={{ resize: "vertical" }} />
              </div>
            </>
          )}

          {runMode === "championship" && !isPro && (
            <div className="comp-card" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <strong style={{ fontSize: "var(--font-size-16)" }}>🏆 Championship series is a GS Pro feature</strong>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "0.25rem 0 0" }}>
                  Run a full season with accumulating points, roster invites, and live standings. Single tournaments are free, so switch above to run one now.
                </p>
              </div>
              <Link href="/gs-pro"><Button variant="primary">Upgrade to Pro</Button></Link>
            </div>
          )}

          <Button variant="primary" onClick={handleCreate} disabled={saving || (runMode === "championship" && !isPro)} fullWidth>
            {saving ? "Creating..." : runMode === "championship" ? (isPro ? "Create championship → set the roster" : "Championship requires GS Pro") : "Create Tournament"}
          </Button>
        </div>
      </Container>
    </main>
  );
}
