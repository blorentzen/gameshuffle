"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

interface OnboardingResult {
  playerCount: number;
  raceCount: number;
  selectedTabs: string[];
}

interface OnboardingPromptProps {
  gameSlug: string;
  maxPlayers: number;
  availableTabs: { id: string; label: string }[];
  onComplete: (result: OnboardingResult) => void;
}

const STORAGE_KEY = "gs_onboarding_dismissed";

export function OnboardingPrompt({
  gameSlug,
  maxPlayers,
  availableTabs,
  onComplete,
}: OnboardingPromptProps) {
  const { user, loading: authLoading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [playerCount, setPlayerCount] = useState(4);
  const RACE_OPTIONS = [4, 6, 8, 12, 16, 24, 32, 48];
  const [raceIndex, setRaceIndex] = useState(0);
  const raceCount = RACE_OPTIONS[raceIndex];
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(
    new Set(["karts"])
  );
  const [playerAnim, setPlayerAnim] = useState<"up" | "down" | null>(null);
  const [raceAnim, setRaceAnim] = useState<"up" | "down" | null>(null);
  const playerAnimTimeout = useRef<NodeJS.Timeout>(undefined);
  const raceAnimTimeout = useRef<NodeJS.Timeout>(undefined);

  const triggerAnim = (
    setter: (v: "up" | "down" | null) => void,
    timeoutRef: React.MutableRefObject<NodeJS.Timeout | undefined>,
    direction: "up" | "down"
  ) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setter(null);
    requestAnimationFrame(() => {
      setter(direction);
      timeoutRef.current = setTimeout(() => setter(null), 200);
    });
  };

  useEffect(() => {
    if (authLoading) return;

    // Skip if already dismissed
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const parsed = JSON.parse(dismissed);
      if (parsed[gameSlug]) return;
    }

    // Skip if logged-in user has playerCount set
    if (user) {
      const supabase = createClient();
      supabase
        .from("users")
        .select("context_profile")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          const profile = data?.context_profile as Record<string, unknown> | null;
          if (profile?.playerCount) {
            // Already has profile data, auto-complete
            onComplete({
              playerCount: Number(profile.playerCount),
              raceCount: 4,
              selectedTabs: ["karts"],
            });
          } else {
            setVisible(true);
          }
        });
    } else {
      setVisible(true);
    }
  }, [authLoading, user, gameSlug, onComplete]);

  const toggleTab = (id: string) => {
    const next = new Set(selectedTabs);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTabs(next);
  };

  const handleGo = () => {
    // Save to localStorage
    const dismissed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    dismissed[gameSlug] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));

    // Save player count to localStorage for guests
    localStorage.setItem("gs_player_count", String(playerCount));

    setVisible(false);
    onComplete({
      playerCount,
      raceCount,
      selectedTabs: Array.from(selectedTabs),
    });
  };

  const handleSkip = () => {
    const dismissed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    dismissed[gameSlug] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
    setVisible(false);
  };

  if (!visible) return null;

  const hasSelections = selectedTabs.size > 0;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <h2 className="onboarding-card__title">Let&apos;s set up your game night</h2>

        <div className="onboarding-card__section">
          <label className="onboarding-card__label">
            What do you want to randomize?
          </label>
          <div className="onboarding-card__tabs">
            {availableTabs.map((tab) => (
              <Button
                key={tab.id}
                variant={selectedTabs.has(tab.id) ? "primary" : "secondary"}
                size="small"
                onClick={() => toggleTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {selectedTabs.has("karts") && (
          <div className="onboarding-card__section onboarding-card__section--reveal">
            <label className="onboarding-card__label">How many players?</label>
            <div className="onboarding-card__player-picker">
              <button
                className="onboarding-card__adjust"
                onClick={() => {
                  if (playerCount > 1) {
                    setPlayerCount(playerCount - 1);
                    triggerAnim(setPlayerAnim, playerAnimTimeout, "down");
                  }
                }}
              >
                -
              </button>
              <span className={`onboarding-card__count ${playerAnim ? `onboarding-card__count--${playerAnim}` : ""}`}>
                {playerCount}
              </span>
              <button
                className="onboarding-card__adjust"
                onClick={() => {
                  if (playerCount < maxPlayers) {
                    setPlayerCount(playerCount + 1);
                    triggerAnim(setPlayerAnim, playerAnimTimeout, "up");
                  }
                }}
              >
                +
              </button>
            </div>
          </div>
        )}

        {selectedTabs.has("races") && (
          <div className="onboarding-card__section onboarding-card__section--reveal">
            <label className="onboarding-card__label">How many races?</label>
            <div className="onboarding-card__player-picker">
              <button
                className="onboarding-card__adjust"
                onClick={() => {
                  if (raceIndex > 0) {
                    setRaceIndex(raceIndex - 1);
                    triggerAnim(setRaceAnim, raceAnimTimeout, "down");
                  }
                }}
              >
                -
              </button>
              <span className={`onboarding-card__count ${raceAnim ? `onboarding-card__count--${raceAnim}` : ""}`}>
                {raceCount}
              </span>
              <button
                className="onboarding-card__adjust"
                onClick={() => {
                  if (raceIndex < RACE_OPTIONS.length - 1) {
                    setRaceIndex(raceIndex + 1);
                    triggerAnim(setRaceAnim, raceAnimTimeout, "up");
                  }
                }}
              >
                +
              </button>
            </div>
          </div>
        )}

        {hasSelections && (
          <div className="onboarding-card__actions onboarding-card__section--reveal">
            <Button variant="primary" onClick={handleGo} fullWidth>
              Let&apos;s go
            </Button>
          </div>
        )}

        <button className="onboarding-card__skip" onClick={handleSkip}>
          Skip — let me choose
        </button>
      </div>
    </div>
  );
}
