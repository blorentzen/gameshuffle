"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { effectiveTier, normalizeTier } from "@/lib/subscription";

/**
 * Who's looking, for upgrade prompts: signed in, already Pro, and whether the
 * one GS Pro trial per account (users.has_used_trial) is still theirs. Read in
 * the browser for copy only; checkout decides the trial on the server.
 * Null while loading.
 */
export interface TrialEligibility { signedIn: boolean; isPro: boolean; hasUsedTrial: boolean }

export function useTrialEligibility(): TrialEligibility | null {
  const [state, setState] = useState<TrialEligibility | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) setState({ signedIn: false, isPro: false, hasUsedTrial: false }); return; }
      const { data } = await supabase.from("users").select("subscription_tier, role, has_used_trial, circuit_tier, circuit_status").eq("id", user.id).maybeSingle();
      const row = data as { subscription_tier: string | null; role: string | null; has_used_trial: boolean | null; circuit_tier: string | null; circuit_status: string | null } | null;
      const isPro = effectiveTier({ tier: normalizeTier(row?.subscription_tier ?? null), role: row?.role ?? null, circuitTier: row?.circuit_tier ?? null, circuitStatus: row?.circuit_status ?? null }) === "pro";
      if (alive) setState({ signedIn: true, isPro, hasUsedTrial: !!row?.has_used_trial });
    })().catch(() => { if (alive) setState({ signedIn: false, isPro: false, hasUsedTrial: false }); });
    return () => { alive = false; };
  }, []);
  return state;
}
