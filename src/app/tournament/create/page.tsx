"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Button, Input, Tabs } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { canCreateTournament, generateShareToken } from "@/lib/tournaments";

const MODES = [
  { value: "ffa", label: "FFA" },
  { value: "2v2", label: "2v2" },
  { value: "3v3", label: "3v3" },
  { value: "4v4", label: "4v4" },
  { value: "6v6", label: "6v6" },
];

export default function CreateTournamentPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState("ffa");
  const [dateTime, setDateTime] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [acceptanceMode, setAcceptanceMode] = useState("manual");
  const [communityLink, setCommunityLink] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [rules, setRules] = useState("");

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

  const handleCreate = async () => {
    if (!title.trim()) { setError("Tournament name is required."); return; }
    setSaving(true);
    setError(null);

    // Check limit
    const { allowed, reason } = await canCreateTournament(user.id);
    if (!allowed) { setError(reason || "Cannot create tournament."); setSaving(false); return; }

    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("tournaments")
      .insert({
        organizer_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        game_slug: "mario-kart-8-deluxe",
        mode,
        acceptance_mode: acceptanceMode,
        date_time: dateTime || null,
        max_participants: maxParticipants ? Number(maxParticipants) : null,
        community_link: communityLink.trim() || null,
        community_name: communityName.trim() || null,
        rules: rules.trim() || null,
        share_token: generateShareToken(),
        status: "draft",
        settings: { raceCount: 12, cc: "150cc", items: "normal", cpu: "hard" },
      })
      .select("id")
      .single();

    if (dbError) { setError(dbError.message); setSaving(false); return; }
    if (data) { router.push(`/tournament/${data.id}/manage`); }
  };

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <Container>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 700, marginBottom: "2rem" }}>Create Tournament</h1>

          {error && <div className="auth-page__error" style={{ marginBottom: "1.5rem" }}>{error}</div>}

          {/* Basics */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "1.5rem" }}>Basics</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Tournament Name *</label>
                <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday Night Karts" />
              </div>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Description</label>
                <textarea
                  className="save-setup-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this tournament about?"
                  rows={3}
                  style={{ resize: "vertical" }}
                />
              </div>
              <div>
                <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>Format</label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {MODES.map((m) => (
                    <Button key={m.value} variant={mode === m.value ? "primary" : "secondary"} size="small" onClick={() => setMode(m.value)}>
                      {m.label}
                    </Button>
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
            </div>
          </div>

          {/* Community */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "1.5rem" }}>Community</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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
          </div>

          {/* Rules */}
          <div className="comp-card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "1.5rem" }}>Rules</h2>
            <textarea
              className="save-setup-input"
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="Any rules, notes, or instructions for participants..."
              rows={5}
              style={{ resize: "vertical" }}
            />
          </div>

          <Button variant="primary" onClick={handleCreate} disabled={saving} fullWidth>
            {saving ? "Creating..." : "Create Tournament"}
          </Button>
        </div>
      </Container>
    </main>
  );
}
