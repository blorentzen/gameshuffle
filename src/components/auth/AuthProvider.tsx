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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
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
    fetch("/api/account/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz, ifMissing: true }),
    }).catch(() => { tzSyncedRef.current = false; });
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
