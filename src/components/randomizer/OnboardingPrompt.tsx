"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@empac/cascadeds";
import { IconX } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

interface OnboardingResult {
  playerCount: number;
  raceCount: number;
  selectedTabs: string[];
  /** The answer to `choice` (e.g. which Switch version), when asked. */
  choice?: string;
  /** True when a signed-in player's saved profile answered for them (no prompt shown). */
  auto?: boolean;
}

/**
 * First-visit setup shared by every randomizer: pick what to randomize and how
 * many are playing, then "Let's go" (guided) or "Skip, let me choose" (DIY).
 * Defaults are the Mario Kart flow; other games pass their own tabs, counter
 * and an optional first question.
 */
interface OnboardingPromptProps {
  gameSlug: string;
  maxPlayers: number;
  availableTabs: { id: string; label: string }[];
  onComplete: (result: OnboardingResult) => void;
  title?: string;
  tabsLabel?: string;
  /** Tabs that reveal the player counter (Mario Kart: karts). */
  playersFor?: string[];
  minPlayers?: number;
  defaultPlayers?: number;
  playersHint?: string;
  /** A second counter tied to one tab (Mario Kart: how many races). Null hides it. */
  countStep?: { forTab: string; label: string; options: number[] } | null;
  /** A single-choice question shown first (e.g. Switch or Switch 2 Edition). */
  choice?: { label: string; options: { value: string; label: string }[]; value: string };
  defaultTabs?: string[];
}

const STORAGE_KEY = "gs_onboarding_dismissed";

const MK_RACES = { forTab: "races", label: "How many races?", options: [4, 6, 8, 12, 16, 24, 32, 48] };

export function OnboardingPrompt({
  gameSlug,
  maxPlayers,
  availableTabs,
  onComplete,
  title = "Let's set up your game night",
  tabsLabel = "What do you want to randomize?",
  playersFor = ["karts"],
  minPlayers = 1,
  defaultPlayers = 4,
  playersHint,
  countStep = MK_RACES,
  choice,
  defaultTabs = ["karts"],
}: OnboardingPromptProps) {
  const { user, loading: authLoading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [playerCount, setPlayerCount] = useState(Math.min(maxPlayers, defaultPlayers));
  const RACE_OPTIONS = countStep?.options ?? [4];
  const [raceIndex, setRaceIndex] = useState(0);
  const raceCount = RACE_OPTIONS[raceIndex];
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set(defaultTabs));
  const [choiceValue, setChoiceValue] = useState(choice?.value ?? "");
  const [playerAnim, setPlayerAnim] = useState<"up" | "down" | null>(null);
  const [raceAnim, setRaceAnim] = useState<"up" | "down" | null>(null);
  const playerAnimTimeout = useRef<NodeJS.Timeout>(undefined);
  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
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
              playerCount: Math.min(maxPlayers, Math.max(minPlayers, Number(profile.playerCount))),
              raceCount: 4,
              selectedTabs: defaultTabs,
              auto: true,
            });
          } else {
            setVisible(true);
          }
        });
    } else {
      setVisible(true);
    }
  }, [authLoading, user, gameSlug, onComplete]); // eslint-disable-line react-hooks/exhaustive-deps

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
      ...(choice ? { choice: choiceValue } : {}),
    });
  };

  // A modal with no Escape, no click-outside and no close button is a keyboard
  // trap (WCAG 2.1.2): once focus is inside, a keyboard-only visitor has no way
  // back to the page. It is also the first thing a first-time visitor meets.
  useEffect(() => {
    if (!visible) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); handleSkip(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
    // handleSkip only closes and writes localStorage; it needs no deps here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSkip = () => {
    const dismissed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    dismissed[gameSlug] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
    setVisible(false);
  };

  if (!visible) return null;

  const hasSelections = selectedTabs.size > 0;

  return (
    <div
      className="onboarding-overlay"
      // Clicking the backdrop dismisses, the way every other dialog on the web
      // does. Guarded on the target so a click inside the card does not close it.
      onClick={(e) => { if (e.target === e.currentTarget) handleSkip(); }}
    >
      <div
        className="onboarding-card"
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <button
          type="button"
          className="onboarding-card__close"
          onClick={handleSkip}
          aria-label="Close setup"
        >
          <IconX size={18} stroke={2} aria-hidden />
        </button>
        <h2 className="onboarding-card__title" id="onboarding-title">{title}</h2>

        {choice && (
          <div className="onboarding-card__section">
            <label className="onboarding-card__label">{choice.label}</label>
            <div className="onboarding-card__tabs">
              {choice.options.map((o) => (
                <Button key={o.value} variant={choiceValue === o.value ? "primary" : "secondary"} size="small" onClick={() => setChoiceValue(o.value)}>
                  {o.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="onboarding-card__section">
          <label className="onboarding-card__label">
            {tabsLabel}
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

        {playersFor.some((t) => selectedTabs.has(t)) && (
          <div className="onboarding-card__section onboarding-card__section--reveal">
            <label className="onboarding-card__label">How many players?</label>
            {playersHint && <p className="onboarding-card__hint">{playersHint}</p>}
            <div className="onboarding-card__player-picker">
              <button
                className="onboarding-card__adjust"
                onClick={() => {
                  if (playerCount > minPlayers) {
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

        {countStep && selectedTabs.has(countStep.forTab) && (
          <div className="onboarding-card__section onboarding-card__section--reveal">
            <label className="onboarding-card__label">{countStep.label}</label>
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
          Skip, let me choose
        </button>
      </div>
    </div>
  );
}
