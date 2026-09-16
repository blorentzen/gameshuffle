"use client";

/**
 * Owner-only per-member controls on /c: promote to mod / demote / remove.
 * Rendered under each member tile for the community owner (not for the owner's
 * own tile). Calls PATCH/DELETE /api/communities/[id]/members.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

export function CommunityMemberAdmin({
  communityId,
  userId,
  name,
  role,
}: {
  communityId: string;
  userId: string;
  name: string;
  role: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const setRole = async (next: "member" | "mod") => {
    setBusy(true);
    const res = await fetch(`/api/communities/${communityId}/members`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: next }),
    }).catch(() => null);
    setBusy(false);
    if (res && res.ok) { toast.success(next === "mod" ? `${name} is now a mod.` : `${name} is no longer a mod.`); router.refresh(); }
    else toast.error("Couldn't update the role.");
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${name} from the community?`)) return;
    setBusy(true);
    const res = await fetch(`/api/communities/${communityId}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res && res.ok) { toast.success(`${name} removed.`); router.refresh(); }
    else toast.error("Couldn't remove the member.");
  };

  return (
    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
      {role === "mod" ? (
        <Button variant="ghost" size="small" disabled={busy} onClick={() => setRole("member")}>Remove mod</Button>
      ) : (
        <Button variant="ghost" size="small" disabled={busy} onClick={() => setRole("mod")}>Make mod</Button>
      )}
      <Button variant="ghost" size="small" disabled={busy} onClick={remove}>Remove</Button>
    </div>
  );
}
