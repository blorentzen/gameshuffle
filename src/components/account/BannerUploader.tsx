"use client";

/**
 * Profile banner (account → Profile). A profile has one banner, and it's one of two kinds, picked here:
 *   Picture: a still JPG, PNG or WebP → crop/position → the cropped result (plus the original, kept for Reposition)
 *            goes to R2 via /api/account/banner. Reposition re-crops the stored original; Replace picks a new image.
 *   Animated GIF: one of your GIFs, framed by where it sits (BannerGifControls; GS Pro or Supporter looks).
 * Saving one kind replaces the other (src/lib/profile/banner.ts).
 *
 * The crop editor is lazy-loaded (next/dynamic) so the heavy cropper +
 * react-easy-crop never block this control from rendering.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
import { Alert, Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { BannerGifControls, type BannerGifState } from "@/components/account/BannerGifEditor";
import { fitPicture } from "@/lib/images/shrink";

const BannerEditModal = dynamic(
  () => import("@/components/account/BannerEditModal").then((m) => m.BannerEditModal),
  { ssr: false },
);

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

type EditState = { mode: "new"; file: File } | { mode: "reposition" } | null;

export function BannerUploader() {
  const [url, setUrl] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>(null);
  const [gif, setGif] = useState<BannerGifState | null>(null);
  const [kind, setKind] = useState<"picture" | "gif">("picture");
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    fetch("/api/account/banner", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b) {
          setUrl(b.url ?? null);
          setSourceUrl(b.sourceUrl ?? null);
          setConfigured(b.configured !== false);
        }
      })
      .catch(() => {});
    fetch("/api/account/banner/gif", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((g: BannerGifState | null) => {
        if (!g?.ready) return;
        setGif(g);
        if (g.banner) setKind("gif");
      })
      .catch(() => {});
  }, []);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 8 MB or smaller.");
      return;
    }
    setEdit({ mode: "new", file });
  }

  async function uploadCropped(blob: Blob) {
    const current = edit;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "banner.jpg", { type: "image/jpeg" }));
      // Both go in one request, which Vercel turns away over 4.5 MB: the original is made to fit beside the crop.
      if (current?.mode === "new") fd.append("source", await fitPicture(current.file, Math.max(512 * 1024, 4 * 1024 * 1024 - blob.size - 64 * 1024)));
      const res = await fetch("/api/account/banner", { method: "POST", body: fd });
      const b = (await res.json().catch(() => ({}))) as {
        url?: string;
        sourceUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        const reason = (b as { reason?: string }).reason;
        setError(
          b.error === "storage_unconfigured"
            ? "Image uploads aren't available yet."
            : b.error === "refused"
              ? `That picture can't be a banner${reason ? `: ${reason}` : "."}`
              : b.error === "check_unavailable"
                ? "We couldn't check that picture just now. Try again in a minute."
                : "Upload failed. Please try again.",
        );
        return;
      }
      setUrl(b.url ?? null);
      setSourceUrl(b.sourceUrl ?? null);
      // A picture replaces an animated banner.
      setGif((g) => (g ? { ...g, banner: null } : g));
      setEdit(null);
      toast.success("Banner updated");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/banner", { method: "DELETE" });
      if (res.ok) {
        setUrl(null);
        setSourceUrl(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="account-card__label" style={{ marginBottom: "var(--spacing-8)" }}>
        Profile banner
      </p>
      {gif ? (
        <div className="banner-kind" role="group" aria-label="Banner type">
          <Button size="small" variant={kind === "picture" ? "primary" : "secondary"} aria-pressed={kind === "picture"} onClick={() => setKind("picture")}>Picture</Button>
          <Button size="small" variant={kind === "gif" ? "primary" : "secondary"} aria-pressed={kind === "gif"} onClick={() => setKind("gif")}>Animated GIF</Button>
        </div>
      ) : null}

      <div
        className="banner-preview"
        style={
          gif?.banner
            ? { backgroundImage: `url(${gif.banner.url})`, backgroundSize: "cover", backgroundPosition: `${gif.banner.x}% ${gif.banner.y}%` }
            : url
              ? { backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined
        }
        aria-hidden="true"
      >
        {busy ? (
          <div className="banner-crop__loading">
            <span className="banner-crop__spinner" aria-label="Working" />
          </div>
        ) : null}
      </div>

      {kind === "gif" && gif ? (
        <div style={{ marginTop: "var(--spacing-12)", display: "grid", gap: "var(--spacing-8)" }}>
          <BannerGifControls
            state={gif}
            replacesPicture={!!url && !gif.banner}
            onChange={(banner) => {
              setGif({ ...gif, banner });
              // A GIF replaces the picture banner.
              if (banner) { setUrl(null); setSourceUrl(null); }
            }}
          />
        </div>
      ) : !configured ? (
        <p style={{ marginTop: "var(--spacing-8)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
          Image uploads aren&rsquo;t available yet.
        </p>
      ) : (
        <>
          {error ? (
            <div style={{ marginTop: "var(--spacing-8)" }}>
              <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            style={{ display: "none" }}
          />
          <div style={{ marginTop: "var(--spacing-12)", display: "flex", flexWrap: "wrap", gap: "var(--spacing-8)" }}>
            <Button size="small" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {url ? "Replace" : "Upload"}
            </Button>
            {url && sourceUrl ? (
              <Button size="small" variant="secondary" disabled={busy} onClick={() => setEdit({ mode: "reposition" })}>
                Reposition
              </Button>
            ) : null}
            {url ? (
              <Button size="small" variant="secondary" disabled={busy} onClick={() => void remove()}>
                Remove
              </Button>
            ) : null}
          </div>
          <p className="banner-gif__note" style={{ marginTop: "var(--spacing-8)" }}>
            {gif?.banner
              ? "Your banner is an animated GIF now. Uploading a picture replaces it."
              : "A still picture: JPG, PNG or WebP. You can position and zoom it before saving. It runs across the top of your profile: phones show all of it, wide screens trim a little off the top and bottom."}
          </p>
        </>
      )}

      {edit ? (
        <BannerEditModal
          file={edit.mode === "new" ? edit.file : undefined}
          imageSrc={edit.mode === "reposition" ? "/api/account/banner/raw" : undefined}
          onCancel={() => setEdit(null)}
          onConfirm={uploadCropped}
        />
      ) : null}
    </div>
  );
}
