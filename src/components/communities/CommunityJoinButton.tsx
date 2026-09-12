"use client";

/**
 * Join / leave a community. Optimistic toggle backed by
 * /api/communities/[id]/membership. Signed-out visitors are routed to login
 * with a redirect back to the community.
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";

export function CommunityJoinButton({
  communityId,
  slug,
  initialMember,
  initialCount,
}: {
  communityId: string;
  slug: string;
  initialMember: boolean;
  initialCount: number;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [member, setMember] = useState(initialMember);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!user) {
      window.location.assign(`/login?redirect=/c/${slug}`);
      return;
    }
    setBusy(true);
    const leaving = member;
    try {
      const res = await fetch(`/api/communities/${communityId}/membership`, {
        method: leaving ? "DELETE" : "POST",
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast.error("Something went wrong. Try again.");
      } else {
        setMember(!leaving);
        if (typeof j.memberCount === "number") setCount(j.memberCount);
        toast.success(leaving ? "Left the community." : "Welcome to the community!");
      }
    } catch {
      toast.error("Network error. Try again.");
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
      <Button variant={member ? "secondary" : "primary"} onClick={toggle} loading={busy}>
        {member ? "Joined ✓" : "Join community"}
      </Button>
      <span style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
        {count.toLocaleString()} {count === 1 ? "member" : "members"}
      </span>
    </div>
  );
}
