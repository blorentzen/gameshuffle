"use client";

/**
 * Owner-only community banner control — pick an image, upload to R2, set it as
 * the /c hero. Lean vs the profile banner (no crop; the hero uses object-fit:
 * cover). Shown only to the owner.
 */

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export function CommunityBannerUploader({ communityId, hasBanner }: { communityId: string; hasBanner: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) { toast.error("Use a JPG, PNG, or WebP image."); return; }
    if (file.size > MAX_BYTES) { toast.error("Image must be 8MB or smaller."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/communities/${communityId}/banner`, { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) { toast.success("Banner updated."); router.refresh(); }
      else toast.error(j?.error === "storage_unconfigured" ? "Image storage isn't set up." : "Couldn't upload the banner.");
    } catch {
      toast.error("Network error. Try again.");
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!window.confirm("Remove the community banner?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/banner`, { method: "DELETE" });
      if (res.ok) { toast.success("Banner removed."); router.refresh(); }
      else toast.error("Couldn't remove the banner.");
    } catch {
      toast.error("Network error. Try again.");
    }
    setBusy(false);
  };

  return (
    <>
      <Button variant="secondary" size="small" onClick={pick} disabled={busy}>
        {busy ? "Uploading…" : hasBanner ? "Change banner" : "Add banner"}
      </Button>
      {hasBanner && <Button variant="ghost" size="small" onClick={remove} disabled={busy}>Remove banner</Button>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPick} />
    </>
  );
}
