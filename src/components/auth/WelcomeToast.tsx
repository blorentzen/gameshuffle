"use client";

/**
 * Fires a one-time "welcome to GameShuffle" toast the first time a newly
 * signed-up user is authenticated on the site — on whatever page they land
 * (homepage, /account, /beta, …). Server-side `welcomed_at` is the source of
 * truth (POST /api/account/welcome-check claims it atomically), so this doesn't
 * depend on a query param surviving Supabase's confirmation redirect.
 *
 * A per-session guard keeps it to one check per browser session. Mounted
 * globally inside ToastProvider + AuthProvider.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";

const SESSION_KEY = "gs-welcome-checked";

export function WelcomeToast() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (loading || !user || checkedRef.current) return;
    // Once per browser session — the server flag is the real guard, this just
    // avoids an extra request on every navigation.
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_KEY)) return;
    checkedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/account/welcome-check", { method: "POST" });
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SESSION_KEY, "1");
        if (!res.ok) return;
        const body = (await res.json()) as { welcome?: boolean };
        if (body.welcome) {
          toast.success(
            "You're all set. Set up your profile and start your first game night whenever you're ready.",
            { title: "Welcome to GameShuffle! 🎉" },
          );
        }
      } catch {
        // Non-fatal — no welcome this time.
      }
    })();
  }, [user, loading, toast]);

  return null;
}
