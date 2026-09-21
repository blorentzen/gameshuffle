"use client";

/**
 * Per-member controls on /c: promote to mod / admin, demote, remove. Rendered
 * under each member tile for the owner + admins (not for the owner's own tile).
 * Only the owner sees the admin grant/revoke controls (`canGrantAdmin`). Calls
 * PATCH/DELETE /api/communities/[id]/members; the server re-enforces the
 * permission hierarchy regardless of what the UI shows.
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
  canGrantAdmin = false,
}: {
  communityId: string;
  userId: string;
  name: string;
  role: string;
  /** Only the owner may grant/revoke the admin role. */
  canGrantAdmin?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const setRole = async (next: "member" | "mod" | "admin", label: string) => {
    setBusy(true);
    const res = await fetch(`/api/communities/${communityId}/members`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: next }),
    }).catch(() => null);
    setBusy(false);
    if (res && res.ok) { toast.success(label); router.refresh(); }
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
    <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
      {role === "mod" ? (
        <Button variant="ghost" size="small" disabled={busy} onClick={() => setRole("member", `${name} is no longer a mod.`)}>Remove mod</Button>
      ) : role === "member" ? (
        <Button variant="ghost" size="small" disabled={busy} onClick={() => setRole("mod", `${name} is now a mod.`)}>Make mod</Button>
      ) : null}
      {canGrantAdmin && (
        role === "admin" ? (
          <Button variant="ghost" size="small" disabled={busy} onClick={() => setRole("member", `${name} is no longer an admin.`)}>Remove admin</Button>
        ) : (
          <Button variant="ghost" size="small" disabled={busy} onClick={() => setRole("admin", `${name} is now an admin.`)}>Make admin</Button>
        )
      )}
      <Button variant="ghost" size="small" disabled={busy} onClick={remove}>Remove</Button>
    </div>
  );
}
