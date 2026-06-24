"use client";

/**
 * Profile banner uploader (account → Profile). Pick an image → crop/position
 * it → upload the cropped result (plus the original, kept for Reposition) to
 * R2 via /api/account/banner. Reposition re-crops the stored original;
 * Replace picks a new image; Remove clears it.
 *
 * The crop editor is lazy-loaded (next/dynamic) so the heavy cropper +
 * react-easy-crop never block this control from rendering.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
import { Alert, Button } from "@empac/cascadeds";

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
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (current?.mode === "new") fd.append("source", current.file);
      const res = await fetch("/api/account/banner", { method: "POST", body: fd });
      const b = (await res.json().catch(() => ({}))) as {
        url?: string;
        sourceUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(
          b.error === "storage_unconfigured"
            ? "Image uploads aren't available yet."
            : "Upload failed. Please try again.",
        );
        return;
      }
      setUrl(b.url ?? null);
      setSourceUrl(b.sourceUrl ?? null);
      setEdit(null);
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
      <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>
        Profile banner
      </label>

      <div
        className="banner-preview"
        style={
          url
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

      {!configured ? (
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
          <p style={{ marginTop: "var(--spacing-8)", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
            JPG, PNG, or WebP · position + zoom before saving · shown across the top of your public profile.
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
