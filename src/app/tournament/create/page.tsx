"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Container, Button, Input } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { canCreateTournament, generateShareToken } from "@/lib/tournaments";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { isEmailVerified } from "@/lib/auth-utils";
import { useAnalytics } from "@/hooks/useAnalytics";

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
];

// Competition structure. FFA-points, round-robin, both brackets, and the
// Heat → Mains ladder run now; Swiss is on the way.
const FORMATS = [
  { value: "ffa_points", label: "FFA / Points", available: true },
  { value: "round_robin", label: "Round Robin", available: true },
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
      const { data } = await supabase.from("users").select("subscription_tier, role").eq("id", user.id).maybeSingle();
      setIsPro(effectiveTier({ tier: normalizeTier(data?.subscription_tier), role: data?.role }) === "pro");
    })();
  }, [user]);

  // Shared
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gameSlug, setGameSlug] = useState("mario-kart-8-deluxe");

  // Single tournament
  const [format, setFormat] = useState("ffa_points");
  const [mode, setMode] = useState("ffa");
  const [dateTime, setDateTime] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [acceptanceMode, setAcceptanceMode] = useState("manual");
  const [communityLink, setCommunityLink] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [rules, setRules] = useState("");

  // Championship
  const [hmSeries, setHmSeries] = useState(2);
  const [hmHeatSize, setHmHeatSize] = useState<number | "auto">("auto");

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
        game_slug: gameSlug,
        format,
        mode,
        acceptance_mode: acceptanceMode,
        date_time: dateTime || null,
        max_participants: maxParticipants ? Number(maxParticipants) : null,
        community_link: communityLink.trim() || null,
        community_name: communityName.trim() || null,
        rules: rules.trim() || null,
        share_token: generateShareToken(),
        status: "draft",
        settings:
          gameSlug === "mario-kart-world"
            ? { raceCount: 12, items: "normal" }
            : { raceCount: 12, cc: "150cc", items: "normal", cpu: "hard" },
      })
      .select("id")
      .single();

    if (dbError) { setError(dbError.message); setSaving(false); return; }
    if (data) { trackEvent("Tournament Created", { mode, game: gameSlug, format }); router.push(`/tournament/${data.id}/manage`); }
  };

  const handleCreateChampionship = async () => {
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("championships")
      .insert({
        owner_id: user.id,
        name: title.trim(),
        description: description.trim() || null,
        game_slug: gameSlug,
        settings: { series: hmSeries, heatSize: hmHeatSize, mode: "ffa", items: "normal" },
        share_token: generateShareToken(),
      })
      .select("id")
      .single();

    if (dbError) { setError(dbError.message); setSaving(false); return; }
    if (data) { trackEvent("Championship Created", { game: gameSlug }); router.push(`/tournament/championship/${data.id}/manage`); }
  };

  const handleCreate = async () => {
    if (runMode === "championship" && !isPro) { setError("Championship series is a GS Pro feature."); return; }
    if (!title.trim()) { setError(`${runMode === "championship" ? "Championship" : "Tournament"} name is required.`); return; }
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
        <div style={{ fontSize: "var(--font-size-13)", color: "var(--text-tertiary)", lineHeight: 1.4 }}>{blurb}</div>
      </button>
    );
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>Create {runMode === "championship" ? "a Championship" : "a Tournament"}</h1>

          {error && <div className="auth-page__error" style={{ marginBottom: "1.5rem" }}>{error}</div>}

          {/* What are you running? */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "1rem" }}>What are you running?</h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {optionCard("single", "Single tournament", "One event — brackets, points, round robin, or the Heat → Mains ladder. Play it out and share the results.")}
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
                        : "Brackets, FFA/Points, Round Robin, and Heat → Mains run now. Swiss is on the way. (Double-elim needs a power-of-2 player count.)"}
                    </p>
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
                    </div>
                    <div>
                      <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Max Participants</label>
                      <Input type="number" min={2} max={200} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="No limit" />
                    </div>
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
                      <strong>Heat → Mains ★</strong> — every event in the season runs heats into a consi ladder, and the tiered points feed your season standings.
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
                  Run a full season with accumulating points, roster invites, and live standings. Single tournaments are free — switch above to run one now.
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
