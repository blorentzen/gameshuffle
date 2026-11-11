"use client";

/**
 * Add a screenshot to your own time that has no proof yet, like one brought over from Quaxly (players' feedback,
 * picks 2026-11-04, 21A). The picture goes through /api/time-trials/read (stored as proof, the time read off it),
 * then onto the time (POST /api/time-trials/<id> { action: "proof" }). When it shows a different time, or can't be
 * read, an updater gets a ticket; it counts as Screenshot proof, not Verified.
 */

import { useRef, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconCamera } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { formatTime } from "@/lib/timeTrials/rules";
import type { TtGame } from "@/lib/timeTrials/tracks";
import { fitPicture } from "@/lib/images/shrink";

const UPLOAD_ERRORS: Record<string, string> = {
  bad_type: "Use a PNG, JPEG or WebP picture.",
  too_big: "That picture is over 8 MB.",
  storage: "Pictures can't be saved right now. Try again later.",
  slow_down: "That's a lot of pictures. Wait a few minutes and try again.",
};

export function TtAddShot({ timeId, game, timeMs, onDone, size = "small" }: {
  timeId: string; game: TtGame; timeMs: number; onDone?: () => void; size?: "small" | "medium";
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      // Vercel turns away requests over 4.5 MB: a phone photo of the screen is made smaller first.
      form.append("file", await fitPicture(file));
      form.append("game", game);
      const res = await fetch("/api/time-trials/read", { method: "POST", body: form });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; proofUrl?: string; readToken?: string; read?: { timeMs: number | null } | null; error?: string };
      if (!res.ok || !j.ok || !j.proofUrl) { toast.error(UPLOAD_ERRORS[j.error ?? ""] ?? "That picture didn't upload. Try again."); return; }
      const put = await fetch(`/api/time-trials/${timeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "proof", proofUrl: j.proofUrl, readToken: j.readToken }) });
      const p = (await put.json().catch(() => ({}))) as { ok?: boolean; matched?: boolean; error?: string };
      if (!put.ok || !p.ok) { toast.error(p.error === "has_proof" ? "That time has proof already." : "The screenshot couldn't be added. Try again."); return; }
      const read = j.read?.timeMs ?? null;
      if (p.matched) toast.success(`Screenshot added. It shows ${formatTime(timeMs)}.`);
      else if (read != null) toast.info(`Screenshot added. It reads ${formatTime(read)}, not ${formatTime(timeMs)}, so an updater will check it.`);
      else toast.info("Screenshot added. We couldn't read the time off it, so an updater will check it.");
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size={size} variant="secondary" iconBefore={IconCamera} loading={busy} onClick={() => fileRef.current?.click()}>Add a screenshot</Button>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
    </>
  );
}
