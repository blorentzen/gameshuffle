"use client";

/**
 * Background & skin editor (Brand & Theme tab) — the profile's background (none /
 * solid color / curated gradient / uploaded image) and card styling (border +
 * corner radius). Autosaves through /api/account/profile-skin, which re-validates
 * the shape and re-checks the image origin server-side. Background images upload
 * to our R2 bucket; no external URLs are ever accepted.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import {
  DEFAULT_PROFILE_SKIN,
  SKIN_GRADIENTS,
  resolveProfileSkin,
  type ProfileSkin,
  type BackgroundKind,
  type CardBorder,
  type CardRadius,
} from "@/lib/profile/skin";

const KINDS: { value: BackgroundKind; label: string }[] = [
  { value: "none", label: "None" },
  { value: "color", label: "Color" },
  { value: "gradient", label: "Gradient" },
  { value: "image", label: "Image" },
];

export function ProfileSkinEditor() {
  const toast = useToast();
  const [skin, setSkin] = useState<ProfileSkin>(DEFAULT_PROFILE_SKIN);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploading, setUploading] = useState(false);
  const armed = useRef(false);
  const timer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/profile-skin")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.skin) setSkin(resolveProfileSkin(j.skin)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!armed.current) { armed.current = true; return; }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/account/profile-skin", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skin }),
        });
        if (res.ok) setSaveState("saved");
        else { setSaveState("error"); if ((await res.json().catch(() => null))?.error === "migration_pending") toast.error("Skin saving isn't enabled yet."); }
      } catch { setSaveState("error"); }
    }, 600);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin]);

  const setBg = (patch: Partial<ProfileSkin["bg"]>) => setSkin((s) => ({ ...s, bg: { ...s.bg, ...patch } }));
  const setCard = (patch: Partial<ProfileSkin["card"]>) => setSkin((s) => ({ ...s, card: { ...s.card, ...patch } }));

  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/account/profile-skin", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.url) setSkin((s) => ({ ...s, bg: { ...s.bg, kind: "image", image: j.url } }));
      else toast.error("Couldn't upload the image.");
    } catch { toast.error("Network error uploading the image."); }
    setUploading(false);
  };

  if (loading) return <div className="account-card"><p style={{ color: "var(--text-secondary)" }}>Loading skin…</p></div>;

  return (
    <div className="account-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        <h2 className="account-tab__heading" style={{ margin: 0 }}>Background &amp; skin</h2>
        <span style={{ fontSize: "var(--font-size-12)", color: saveState === "error" ? "var(--error-600, #c11a10)" : "var(--text-tertiary)" }}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
      </div>
      <p className="account-tab__intro">Give your profile its own backdrop, or keep it clean. Cards stay readable over any background.</p>

      {/* Background kind */}
      <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap", marginBottom: "var(--spacing-16)" }}>
        {KINDS.map((k) => (
          <Button key={k.value} variant={skin.bg.kind === k.value ? "primary" : "secondary"} size="small" onClick={() => setBg({ kind: k.value })}>
            {k.label}
          </Button>
        ))}
      </div>

      {skin.bg.kind === "color" && (
        <label style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", marginBottom: "var(--spacing-16)" }}>
          <span className="account-card__label">Background color</span>
          <input type="color" value={skin.bg.color || "#5457e5"} onChange={(e) => setBg({ color: e.target.value })} style={{ width: 48, height: 32, border: "1px solid var(--border-default)", borderRadius: 6, background: "none", cursor: "pointer" }} />
        </label>
      )}

      {skin.bg.kind === "gradient" && (
        <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap", marginBottom: "var(--spacing-16)" }}>
          {Object.entries(SKIN_GRADIENTS).map(([id, css]) => (
            <button key={id} type="button" aria-label={id} onClick={() => setBg({ gradient: id })}
              style={{ width: 56, height: 40, borderRadius: 8, background: css, cursor: "pointer", border: `2px solid ${skin.bg.gradient === id ? "var(--primary-500)" : "var(--border-default)"}` }} />
          ))}
        </div>
      )}

      {skin.bg.kind === "image" && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          {skin.bg.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={skin.bg.image} alt="Background" style={{ width: "100%", maxWidth: 480, aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-default)", display: "block", marginBottom: "var(--spacing-8)" }} />
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onImage} />
          <Button variant="secondary" size="small" loading={uploading} onClick={() => fileRef.current?.click()}>
            {skin.bg.image ? "Replace image" : "Upload image"}
          </Button>
          <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: "var(--spacing-8)" }}>JPG, PNG, or WebP. Stored on GameShuffle&rsquo;s own CDN.</p>
        </div>
      )}

      {/* Card style */}
      <div style={{ display: "flex", gap: "var(--spacing-24)", flexWrap: "wrap", borderTop: "1px solid var(--border-subtle, var(--border-default))", paddingTop: "var(--spacing-16)" }}>
        <div>
          <span className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Card border</span>
          <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
            {(["subtle", "bold", "none"] as CardBorder[]).map((b) => (
              <Button key={b} variant={skin.card.border === b ? "primary" : "secondary"} size="small" onClick={() => setCard({ border: b })}>{b[0].toUpperCase() + b.slice(1)}</Button>
            ))}
          </div>
        </div>
        <div>
          <span className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Card corners</span>
          <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
            {(["sm", "md", "lg"] as CardRadius[]).map((r) => (
              <Button key={r} variant={skin.card.radius === r ? "primary" : "secondary"} size="small" onClick={() => setCard({ radius: r })}>{r.toUpperCase()}</Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
