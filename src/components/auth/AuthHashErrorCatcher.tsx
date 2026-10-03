"use client";

/**
 * When a sign-in's return address isn't on Supabase's allowlist, Supabase
 * falls back to the Site URL (the homepage) with the error after the `#`, which
 * our server never sees and no page shows. This catches that anywhere outside
 * the auth pages and sends the person to /login, where AuthErrorNotice explains.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const AUTH_PAGES = ["/login", "/signup", "/auth/"];

export function AuthHashErrorCatcher() {
  const pathname = usePathname();
  useEffect(() => {
    if (AUTH_PAGES.some((p) => pathname.startsWith(p)) || pathname.startsWith("/account")) return;
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (!h.get("error") && !h.get("error_code")) return;
    const next = new URL("/login", window.location.origin);
    for (const k of ["error", "error_code", "error_description"]) { const v = h.get(k); if (v) next.searchParams.set(k, v); }
    window.location.replace(next.toString());
  }, [pathname]);
  return null;
}
