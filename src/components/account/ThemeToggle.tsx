"use client";

/**
 * Account → Profile theme toggle. Two CDS Switches stacked:
 *   1. "Match my system theme" — when ON, follow OS preference
 *      (cookie absent).
 *   2. "Dark mode" — only applies when match-system is OFF;
 *      reflected (read-only) when match-system is ON to give
 *      the viewer feedback about their current effective state.
 *
 * Cookie name: `gs-theme`. Values: 'light' | 'dark' | (absent for
 * system). Read at SSR by `app/layout.tsx` to set the
 * `<html data-theme>` attribute pre-paint, so toggling a fresh
 * page load doesn't flash the wrong theme.
 *
 * Toggle interactions write the cookie + mutate the root
 * `data-theme` attribute synchronously so the user sees the swap
 * immediately without needing a server round-trip.
 */

import { useSyncExternalStore, useState, useEffect } from "react";
import { Switch } from "@empac/cascadeds";

const THEME_COOKIE = "gs-theme";
const COOKIE_MAX_AGE_SECS = 60 * 60 * 24 * 365; // one year

/** Read the current theme cookie from `document.cookie`. Returns
 *  'light', 'dark', or null (= system). SSR-safe: returns null when
 *  document is undefined. */
function readThemeCookie(): "light" | "dark" | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${THEME_COOKIE}=`));
  if (!match) return null;
  const value = match.slice(THEME_COOKIE.length + 1);
  return value === "light" || value === "dark" ? value : null;
}

// useSyncExternalStore subscriber for `prefers-color-scheme: dark`.
// Lives at module scope so React can identify the same store across
// renders.
function subscribePrefersDark(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getPrefersDarkSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle() {
  // matchSystem: true when we're following the OS (no explicit user
  // choice), false when the user has forced light or dark. Lazy
  // initializer reads the cookie at first render.
  const [matchSystem, setMatchSystem] = useState(
    () => readThemeCookie() === null
  );
  // forceDark: meaningful only when matchSystem is false; reflects
  // current resolved theme when matchSystem is true so the second
  // switch isn't blank.
  const [forceDark, setForceDark] = useState(
    () => readThemeCookie() === "dark"
  );
  // Track the OS preference via useSyncExternalStore so the second
  // switch can show "currently dark" / "currently light" when
  // match-system is on. SSR snapshot defaults to false (light) — the
  // toggle is interactive-only so it'll re-resolve on hydration.
  const systemPrefersDark = useSyncExternalStore(
    subscribePrefersDark,
    getPrefersDarkSnapshot,
    () => false,
  );

  // When the user is in match-system mode and the OS preference flips
  // (e.g. system dark scheduler), keep the `html.dark` class in sync so
  // CDS's component CSS flips with it.
  useEffect(() => {
    if (!matchSystem) return;
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", systemPrefersDark);
  }, [matchSystem, systemPrefersDark]);

  const writeCookie = (value: "light" | "dark" | null) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (value === null) {
      // Clear the cookie so the OS preference wins. Sync the `dark`
      // class to the live OS preference — CDS's component CSS is keyed
      // on `html.dark`, so without this CDS components wouldn't flip
      // when the user re-engages match-system.
      document.cookie = `${THEME_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
      root.removeAttribute("data-theme");
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      root.classList.toggle("dark", prefersDark);
      return;
    }
    document.cookie =
      `${THEME_COOKIE}=${value}; max-age=${COOKIE_MAX_AGE_SECS}; ` +
      `path=/; SameSite=Lax`;
    root.setAttribute("data-theme", value);
    // Sync the `dark` class so CDS's own component styles (which key on
    // `html.dark`, ~388 rules) flip alongside our semantic tokens.
    root.classList.toggle("dark", value === "dark");
  };

  const onMatchSystemChange = (next: boolean) => {
    setMatchSystem(next);
    if (next) {
      writeCookie(null);
    } else {
      // When the user flips OFF match-system, lock in whatever theme
      // is currently rendering as the explicit choice. They can flip
      // the second switch right after if they want the opposite.
      const lockedTheme = systemPrefersDark ? "dark" : "light";
      setForceDark(lockedTheme === "dark");
      writeCookie(lockedTheme);
    }
  };

  const onForceDarkChange = (next: boolean) => {
    // Flipping Dark mode always takes effect, even when "Match system"
    // is on — doing so implicitly turns off match-system and locks in
    // the user's explicit choice. They can re-enable match-system any
    // time to go back to following the OS.
    if (matchSystem) setMatchSystem(false);
    setForceDark(next);
    writeCookie(next ? "dark" : "light");
  };

  // The "Dark mode" switch displays the EFFECTIVE current state
  // when match-system is on (so it visually reflects what the user
  // is seeing) but isn't user-actionable in that mode.
  const darkSwitchChecked = matchSystem ? systemPrefersDark : forceDark;

  return (
    <div className="account-theme-toggle">
      <div className="account-theme-toggle__heading">
        <span className="account-theme-toggle__title">Theme</span>
        <p className="account-theme-toggle__sub">
          Light or dark mode for the GameShuffle interface.
        </p>
      </div>
      <div className="account-theme-toggle__row">
        <Switch
          checked={matchSystem}
          onChange={(e) => onMatchSystemChange(e.target.checked)}
          label="Match my system theme"
          helperText="Follow your device's light / dark setting automatically."
        />
      </div>
      <div className="account-theme-toggle__row">
        <Switch
          checked={darkSwitchChecked}
          onChange={(e) => onForceDarkChange(e.target.checked)}
          label="Dark mode"
          helperText={
            matchSystem
              ? `Currently ${
                  systemPrefersDark ? "dark" : "light"
                } from your system setting. Flip to override.`
              : "Locked in regardless of your system setting."
          }
        />
      </div>
    </div>
  );
}
