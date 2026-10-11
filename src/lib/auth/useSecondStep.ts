"use client";

/**
 * Whether this session still owes two-step verification. Supabase won't let a
 * session that stopped at aal1 change the password of an account with 2FA
 * (`insufficient_aal`), and a reset link only ever gives an aal1 session, so
 * the reset and backup-password pages ask for the code first.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useSecondStep(enabled: boolean): { state: "checking" | "needed" | "ok"; passed: () => void } {
  const [state, setState] = useState<"checking" | "needed" | "ok">("checking");
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    createClient().auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data }) => { if (alive) setState(data?.currentLevel === "aal1" && data?.nextLevel === "aal2" ? "needed" : "ok"); })
      .catch(() => { if (alive) setState("ok"); });
    return () => { alive = false; };
  }, [enabled]);
  return { state, passed: () => setState("ok") };
}
