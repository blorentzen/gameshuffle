"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { PresenceHeartbeat } from "@/components/social/PresenceHeartbeat";
import { detectBrowserTimeZone } from "@/lib/time/format";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

/**
 * Once per browser session (sessionStorage), not once per page load: the refs above reset on every
 * full page load, so these syncs used to run on each one. True the first time for `key`; true every
 * time when storage is blocked, so the sync still happens.
 */
function firstThisSession(key: string): boolean {
  try {
    const k = `gs-once:${key}`;
    if (sessionStorage.getItem(k)) return false;
    sessionStorage.setItem(k, "1");
  } catch {
    // Storage blocked: run it.
  }
  return true;
}

function forgetThisSession(key: string) {
  try { sessionStorage.removeItem(`gs-once:${key}`); } catch { /* blocked */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;

    // Supabase keeps a lock on the session in the browser. A call that holds it more than 5 seconds (a slow refresh,
    // or the site open in another tab) has it taken over, and its getUser rejects with "...another request stole it"
    // (Sentry GAMESHUFFLE-6P, 2026-11-01). The call that took it over finishes the work, so ask once more; either
    // way loading ends, so nothing waits on the sign-in state forever.
    const load = async (tries = 0): Promise<void> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (alive) setUser(user);
      } catch (err) {
        if (tries < 1) return load(tries + 1);
        console.warn("[auth] couldn't read the signed-in account:", err);
      }
      if (alive) setLoading(false);
    };
    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // Auto-detect the account timezone once we know who's signed in. Backfills
  // existing accounts and covers fresh signups; `ifMissing` means it never
  // overwrites a timezone the user set deliberately. Fires once per session.
  const tzSyncedRef = useRef(false);
  useEffect(() => {
    if (!user || tzSyncedRef.current) return;
    const tz = detectBrowserTimeZone();
    if (!tz) return;
    tzSyncedRef.current = true;
    if (!firstThisSession(`tz:${user.id}`)) return;
    fetch("/api/account/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz, ifMissing: true }),
    }).catch(() => { tzSyncedRef.current = false; forgetThisSession(`tz:${user.id}`); });
  }, [user]);

  // Make sure every signed-in account has a handle (covers email signups + old
  // accounts predating auto-assignment). Idempotent server-side; once per session.
  const unameSyncedRef = useRef(false);
  useEffect(() => {
    if (!user || unameSyncedRef.current) return;
    unameSyncedRef.current = true;
    if (!firstThisSession(`uname:${user.id}`)) return;
    fetch("/api/account/ensure-username", { method: "POST" }).catch(() => { unameSyncedRef.current = false; forgetThisSession(`uname:${user.id}`); });
  }, [user]);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
      <PresenceHeartbeat />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
