"use client";

/** Says once how many /gs-tt times moved to the account after connecting Discord (cookie from the sign-in callback). */

import { useEffect } from "react";
import { useToast } from "@/components/toast/ToastProvider";
import { TT_MOVED_COOKIE, movedLine } from "@/lib/timeTrials/moved";

export function TtMovedToast() {
  const toast = useToast();
  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${TT_MOVED_COOKIE}=(\\d+)`));
    if (!m) return;
    document.cookie = `${TT_MOVED_COOKIE}=; path=/; max-age=0`;
    const n = Number(m[1]);
    if (n > 0) toast.success(movedLine(n));
  }, [toast]);
  return null;
}
