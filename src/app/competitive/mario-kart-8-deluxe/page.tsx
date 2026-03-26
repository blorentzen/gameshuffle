"use client";

import { useState } from "react";
import { Container, Button, Icon } from "@empac/cascadeds";
import { VideoHero } from "@/components/layout/VideoHero";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const COMMUNITY_RESOURCES = [
  {
    name: "MK Central",
    description: "The hub for competitive Mario Kart — rankings, events, and community.",
    url: "https://www.mariokartcentral.com/",
    icon: "trophy",
  },
  {
    name: "MK8DX Stats",
    description: "Track and course statistics, tier lists, and meta analysis.",
    url: "https://www.mk8dxstats.com/",
    icon: "chart-bar",
  },
  {
    name: "MK Lounge",
    description: "Discord-based matchmaking and ranked lounge system.",
    url: "https://discord.gg/mklounge",
    icon: "brand-discord",
  },
];

const MK8DX_SCORING: { place: string; points: number }[] = [
  { place: "1st", points: 15 },
  { place: "2nd", points: 12 },
  { place: "3rd", points: 10 },
  { place: "4th", points: 9 },
  { place: "5th", points: 8 },
  { place: "6th", points: 7 },
  { place: "7th", points: 6 },
  { place: "8th", points: 5 },
  { place: "9th", points: 4 },
  { place: "10th", points: 3 },
  { place: "11th", points: 2 },
  { place: "12th", points: 1 },
];

type CompMode = "ffa" | "2v2" | "3v3" | "4v4" | "6v6";

const COMP_MODES: { value: CompMode; label: string; teams: number; perTeam: number }[] = [
  { value: "ffa", label: "FFA", teams: 12, perTeam: 1 },
  { value: "2v2", label: "2v2", teams: 6, perTeam: 2 },
  { value: "3v3", label: "3v3", teams: 4, perTeam: 3 },
  { value: "4v4", label: "4v4", teams: 3, perTeam: 4 },
  { value: "6v6", label: "6v6", teams: 2, perTeam: 6 },
];

export default function CompetitiveMK8DXPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [selectedMode, setSelectedMode] = useState<CompMode>("ffa");

  const modeInfo = COMP_MODES.find((m) => m.value === selectedMode)!;

  const handleCreateLounge = async () => {
    if (!user) {
      router.push("/signup");
      return;
    }

    setCreating(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("lounge_sessions")
      .insert({
        game_slug: "mario-kart-8-deluxe",
        organizer_id: user.id,
        status: "waiting",
        race_count: 12,
        scoring_table: MK8DX_SCORING,
        players: [],
        races: [],
        settings: {
          mode: selectedMode,
          teams: modeInfo.teams,
          perTeam: modeInfo.perTeam,
        },
      })
      .select("id")
      .single();

    if (data && !error) {
      router.push(`/competitive/mario-kart-8-deluxe/lounge/${data.id}`);
    }
    setCreating(false);
  };

  return (
    <>
      <VideoHero
        backgroundImage="/images/bg/MK8DX_Background_Music.jpg"
        overlayOpacity={0.75}
        height="medium"
      >
        <Container>
          <div style={{ maxWidth: "600px" }}>
            <h1
              style={{
                fontSize: "clamp(2.4rem, 4vw, 4.8rem)",
                fontWeight: 700,
                lineHeight: 1.1,
                marginBottom: "1rem",
              }}
            >
              Competitive Mario Kart 8 Deluxe <span className="beta-badge">BETA</span>
            </h1>
            <p>
              12 races. Normal items. Hard CPU. Track your scores, settle
              disputes, and connect with the competitive MK community.
            </p>
          </div>
        </Container>
      </VideoHero>

      <main style={{ paddingTop: "3rem" }}>
        <Container>
          {/* Quick Start */}
          <section className="comp-section">
            <div className="comp-card comp-card--highlight">
              <div className="comp-card__content">
                <h2>Start a Lounge Match</h2>
                <p>
                  Create a live scoring session for your next lounge set. Share
                  the link with your opponents — everyone tracks placements in
                  real-time. No more forgotten scores or screenshot disputes.
                </p>
                <div className="comp-mode-selector">
                  <span className="comp-mode-selector__label">Match Format</span>
                  <div className="comp-mode-selector__options">
                    {COMP_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        className={`comp-mode-btn ${selectedMode === mode.value ? "comp-mode-btn--active" : ""}`}
                        onClick={() => setSelectedMode(mode.value)}
                      >
                        <span className="comp-mode-btn__label">{mode.label}</span>
                        <span className="comp-mode-btn__desc">
                          {mode.value === "ffa" ? "12 players" : `${mode.teams} teams`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  variant="primary"
                  onClick={handleCreateLounge}
                  disabled={creating}
                >
                  {creating ? "Creating..." : `Create ${selectedMode === "ffa" ? "FFA" : selectedMode} Lounge`}
                </Button>
              </div>
              <div className="comp-card__aside">
                <div className="comp-scoring-preview">
                  <span className="comp-scoring-preview__title">Standard Scoring</span>
                  <div className="comp-scoring-preview__grid">
                    {MK8DX_SCORING.slice(0, 6).map((row) => (
                      <div key={row.place} className="comp-scoring-preview__row">
                        <span>{row.place}</span>
                        <span className="comp-scoring-preview__pts">{row.points} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="comp-section">
            <h2 className="comp-section__title">How Live Scoring Works</h2>
            <div className="comp-steps">
              <div className="comp-step">
                <div className="comp-step__number">1</div>
                <h3>Create a Session</h3>
                <p>Start a 12-race lounge match with standard MK8DX scoring.</p>
              </div>
              <div className="comp-step">
                <div className="comp-step__number">2</div>
                <h3>Share the Link</h3>
                <p>Send the session link to your opponents. Everyone joins on their device.</p>
              </div>
              <div className="comp-step">
                <div className="comp-step__number">3</div>
                <h3>Log Placements</h3>
                <p>After each race, tap your finish position. Points calculate automatically.</p>
              </div>
              <div className="comp-step">
                <div className="comp-step__number">4</div>
                <h3>Final Standings</h3>
                <p>After 12 races, see the final results. Share or export to Discord.</p>
              </div>
            </div>
          </section>

          {/* Community Resources */}
          <section className="comp-section">
            <h2 className="comp-section__title">Community Resources</h2>
            <div className="comp-resources">
              {COMMUNITY_RESOURCES.map((resource) => (
                <a
                  key={resource.name}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="comp-resource"
                >
                  <div className="comp-resource__icon">
                    <Icon name={resource.icon as any} size="24" />
                  </div>
                  <div>
                    <h3 className="comp-resource__name">{resource.name}</h3>
                    <p className="comp-resource__desc">{resource.description}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>

          {/* Scoring Table */}
          <section className="comp-section" style={{ marginBottom: "5rem" }}>
            <h2 className="comp-section__title">MK8DX Standard Scoring Table</h2>
            <div className="comp-scoring-table">
              {MK8DX_SCORING.map((row) => (
                <div key={row.place} className="comp-scoring-table__row">
                  <span className="comp-scoring-table__place">{row.place}</span>
                  <div className="comp-scoring-table__bar" style={{ width: `${(row.points / 15) * 100}%` }} />
                  <span className="comp-scoring-table__pts">{row.points} pts</span>
                </div>
              ))}
            </div>
          </section>
        </Container>
      </main>
    </>
  );
}
