"use client";

/**
 * "On my profile" on a room tile (bring-along picks 6A, 2026-11-05): whether this tile's part of your room shows
 * in its front window (your public profile). A CDS Chip as a toggle (pressed = shown); it writes the profile
 * layout's hidden list, the same one Profile ▸ Profile page edits, through PATCH /api/account/profile-layout.
 */

import { useState } from "react";
import { Chip } from "@empac/cascadeds";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import type { ProfileSectionKey } from "@/lib/profile/layout";

export function ProfileEye({ keys, on: initial, what, className }: {
  keys: ProfileSectionKey[];
  on: boolean;
  /** What the tile shows, for the toast and the label: "Your MMR card". */
  what: string;
  className?: string;
}) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function flip() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      const res = await fetch("/api/account/profile-layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys, show: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(next ? `${what}: on your profile` : `${what}: just for you`);
    } catch {
      setOn(!next);
      toast.error("That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`room-eye${className ? ` ${className}` : ""}`}>
      <Chip
        clickable
        selected={on}
        variant={on ? "success" : "default"}
        size="small"
        onClick={() => void flip()}
        icon={on ? <IconEye size={14} stroke={2} aria-hidden="true" /> : <IconEyeOff size={14} stroke={2} aria-hidden="true" />}
        label="On my profile"
        aria-label={`Show ${what.toLowerCase()} on my profile`}
      />
    </span>
  );
}
