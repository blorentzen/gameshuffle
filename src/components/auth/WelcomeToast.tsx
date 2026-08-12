"use client";

/**
 * Fires a one-time welcome toast when a freshly-confirmed user lands with
 * `?welcome=1` (set on the signup confirmation link and forwarded by
 * /auth/callback). Strips the param afterward so a refresh/back doesn't
 * re-trigger it. Mounted globally inside ToastProvider.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/toast/ToastProvider";

export function WelcomeToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || params.get("welcome") !== "1") return;
    firedRef.current = true;

    toast.success(
      "You're all set. Set up your profile and start your first game night whenever you're ready.",
      { title: "Welcome to GameShuffle! 🎉" },
    );

    const next = new URLSearchParams(params.toString());
    next.delete("welcome");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router, toast]);

  return null;
}
