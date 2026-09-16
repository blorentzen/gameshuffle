"use client";

import { useRef, useState } from "react";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

/**
 * Cover-image uploader for a board-game night (host only). Uploads to R2 via
 * /api/board-game-nights/[id]/cover. Falls back cleanly: if the cover column
 * isn't migrated yet the API returns migration_pending and we tell the host.
 */

const ERR: Record<string, string> = {
  migration_pending: "Cover images aren't enabled yet. Try again shortly.",
  storage_unconfigured: "Image uploads aren't configured on this environment.",
  unsupported_type: "Use a JPG, PNG, or WebP image.",
  too_large: "That image is too large (max 10MB).",
  upload_failed: "Upload failed. Please try again.",
};

export function CoverUploader({ nightId, initialUrl }: { nightId: string; initialUrl?: string | null }) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/board-game-nights/${nightId}/cover`, { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.url) {
        setUrl(j.url as string);
        toast.success("Cover updated.");
      } else {
        toast.error(ERR[j?.error] ?? "Couldn't update the cover.");
      }
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove the cover image?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/board-game-nights/${nightId}/cover`, { method: "DELETE" });
      if (res.ok) { setUrl(null); toast.success("Cover removed."); }
      else toast.error("Couldn't remove the cover.");
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-card bgn-cover-uploader">
      <h2 className="bgn-event-h2">Cover image</h2>
      <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", margin: "0 0 var(--spacing-16)" }}>
        Optional. Shown on the night&rsquo;s page and its card. Without one, a branded gradient is used.
      </p>
      <div className="bgn-cover-uploader__preview">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Night cover" className="bgn-cover-uploader__img" />
        ) : (
          <div className="bgn-cover-uploader__placeholder">No cover yet</div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
      <div className="bgn-cover-uploader__actions">
        <Button variant="secondary" size="small" onClick={pick} disabled={busy}>
          {busy ? "Uploading…" : url ? "Replace cover" : "Upload cover"}
        </Button>
        {url && <Button variant="ghost" size="small" onClick={remove} disabled={busy}>Remove</Button>}
      </div>
    </div>
  );
}
