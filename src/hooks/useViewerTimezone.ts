"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * The signed-in viewer's account timezone (IANA), or null when logged out or
 * unset. Feed it to `formatEventTime` so scheduled times render in the viewer's
 * own zone; null falls back to the platform default (Pacific + Eastern).
 *
 * Deliberately reads the stored *account* timezone, not the browser's — a
 * logged-out (or timezone-less) visitor should see the consistent PT/ET default,
 * not their local zone.
 */
export function useViewerTimezone(): string | null {
  const { user } = useAuth();
  const [tz, setTz] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setTz(null); return; }
    let active = true;
    const supabase = createClient();
    supabase
      .from("users")
      .select("timezone")
      .eq("id", user.id)
      .single()
      .then(({ data }) => { if (active) setTz((data?.timezone as string) ?? null); });
    return () => { active = false; };
  }, [user]);

  return tz;
}
