"use client";

/**
 * Client-side sync that keeps `<html data-theme>` + `html.dark` in
 * step with the current route on every navigation.
 *
 * Why this exists: Next.js App Router does NOT fully reconcile the
 * `<html>` element's attributes during client-side navigation. The
 * root layout re-executes and renders `<html data-theme={...}>` with
 * the new value, but React's reconciler doesn't propagate those
 * attribute changes to the live document element. Result: navigating
 * from a marketing page (forced light) to an app page (cookie-honored
 * dark) leaves the page rendering light until a full reload. Reload
 * works because SSR writes the correct value to the initial HTML.
 *
 * Solution: imperatively mirror the SSR decision tree client-side
 * whenever `usePathname()` changes. Same source of truth as the root
 * layout — `isAppRoute()` + the gs-theme cookie — so SSR and client
 * never disagree.
 */

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isAppRoute } from "@/lib/theme/app-routes";

const THEME_COOKIE = "gs-theme";

function readThemeCookie(): "light" | "dark" | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${THEME_COOKIE}=`));
  if (!match) return null;
  const value = match.slice(THEME_COOKIE.length + 1);
  return value === "light" || value === "dark" ? value : null;
}

export function RouteThemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const themable = pathname ? isAppRoute(pathname) : false;

    // Marketing → force light, strip dark class. Always wins over
    // cookie / OS preference (matches the SSR branch in app/layout.tsx).
    if (!themable) {
      root.setAttribute("data-theme", "light");
      root.classList.remove("dark");
      return;
    }

    // App → cookie wins if set; otherwise follow OS via the live
    // prefers-color-scheme media query (matches the OS-sync pre-paint
    // script in app/layout.tsx for the cookie-absent path).
    const cookie = readThemeCookie();
    if (cookie === "dark") {
      root.setAttribute("data-theme", "dark");
      root.classList.add("dark");
      return;
    }
    if (cookie === "light") {
      root.setAttribute("data-theme", "light");
      root.classList.remove("dark");
      return;
    }
    // No cookie: clear the attribute so the @media (prefers-color-scheme)
    // rules in globals.css take over for our semantic tokens, and sync
    // the `dark` class to live OS preference so CDS's class-keyed
    // component CSS flips alongside.
    root.removeAttribute("data-theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    root.classList.toggle("dark", prefersDark);
  }, [pathname]);

  return null;
}
