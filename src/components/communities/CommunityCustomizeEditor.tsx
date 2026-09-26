"use client";

/**
 * Owner-only editor for a community's personalization — tagline, blurb, accent
 * and skin. Opened from the OwnerBar; saves via PATCH.
 *
 * A DRAWER, not a modal, and that is the point. Appearance is the one kind of
 * edit you cannot judge from a form: a modal sat over the page whose colour
 * you were choosing, so you picked blind, saved, and only then saw it. CDS
 * Drawer with showOverlay={false} leaves the page visible and interactive
 * beside the controls, and every skin change is painted onto the real element
 * as you make it (previewSkin), so what you see IS the page. Closing without
 * saving puts the page back exactly as it was.
 */

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, Select, Input, Textarea, Switch } from "@empac/cascadeds";
import { previewSkin, snapshotSkin, restoreSkin, type SkinSnapshot } from "@/lib/profile/skinPreview";
import { resolveAccentOn } from "@/lib/profile/accents";
import { useToast } from "@/components/toast/ToastProvider";
import { PROFILE_ACCENTS } from "@/lib/profile/accents";
import { COMMUNITY_TOGGLEABLE_SECTIONS } from "@/data/community-sections";
import { DEFAULT_PROFILE_SKIN, SKIN_GRADIENTS, type ProfileSkin, type BackgroundKind, type CardBorder, type CardRadius } from "@/lib/profile/skin";

const ACCENT_OPTIONS = [
  { value: "", label: "Default (brand color)" },
  ...PROFILE_ACCENTS.map((a) => ({ value: a.key, label: a.label })),
];

export function CommunityCustomizeEditor({
  communityId,
  initial,
  recentPosts = [],
}: {
  communityId: string;
  initial: { tagline: string | null; blurb: string | null; accent: string | null; hiddenSections: string[]; pinnedPostId: string | null; skin?: ProfileSkin; css?: string };
  /** Recent community posts, to choose one to pin. */
  recentPosts?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [blurb, setBlurb] = useState(initial.blurb ?? "");
  const [accent, setAccent] = useState(initial.accent ?? "");
  const [hidden, setHidden] = useState<string[]>(initial.hiddenSections ?? []);
  const [pinnedPostId, setPinnedPostId] = useState(initial.pinnedPostId ?? "");
  const [skin, setSkin] = useState<ProfileSkin>(initial.skin ?? DEFAULT_PROFILE_SKIN);
  const [css, setCss] = useState(initial.css ?? "");
  const [saving, setSaving] = useState(false);

  // The real page element, so the preview paints the thing itself rather than
  // a mock of it that could drift from what the server renders.
  const snapRef = useRef<SkinSnapshot | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>("main.community-page");
    if (!el) return;
    if (!open) {
      // Closed without saving: put it back. After a save the server re-renders
      // with the new values, so restoring would flash the old ones.
      if (snapRef.current && !savedRef.current) restoreSkin(el, snapRef.current);
      snapRef.current = null;
      return;
    }
    if (!snapRef.current) snapRef.current = snapshotSkin(el);
    previewSkin(el, skin, {
      brandPrimary: getComputedStyle(el).getPropertyValue("--brand-primary").trim() || null,
      accent: accent || null,
      accentOn: resolveAccentOn(accent || null),
    });
  }, [open, skin, accent]);

  const setBg = (patch: Partial<ProfileSkin["bg"]>) => setSkin((s) => ({ ...s, bg: { ...s.bg, ...patch } }));
  const setCard = (patch: Partial<ProfileSkin["card"]>) => setSkin((s) => ({ ...s, card: { ...s.card, ...patch } }));

  const pinOptions = [
    { value: "", label: "None" },
    ...recentPosts.map((p) => ({ value: p.id, label: p.label })),
    // Keep the current pin selectable even if it's no longer in the recent list.
    ...(initial.pinnedPostId && !recentPosts.some((p) => p.id === initial.pinnedPostId)
      ? [{ value: initial.pinnedPostId, label: "Currently pinned post" }]
      : []),
  ];

  const isShown = (key: string) => !hidden.includes(key);
  const toggleSection = (key: string) =>
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/customize`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagline: tagline.trim() || null, blurb: blurb.trim() || null, accent: accent || null, hiddenSections: hidden, pinnedPostId: pinnedPostId || null, skin, css }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        savedRef.current = true;
        toast.success("Community updated.");
        if (Array.isArray(j.warnings) && j.warnings.length) j.warnings.forEach((w: string) => toast.info(w));
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Couldn't save. Try again.");
      }
    } catch {
      toast.error("Network error. Try again.");
    }
    setSaving(false);
  };

  return (
    <>
      <Button variant="secondary" size="small" onClick={() => { savedRef.current = false; setOpen(true); }}>Customize community</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        position="right"
        size="standard"
        title="Customize your community"
        subtitle="Changes show on the page as you make them."
        /* No overlay: the page behind IS the preview, so dimming or blocking
           it would defeat the reason this is a drawer. */
        showOverlay={false}
        primaryAction={{ label: saving ? "Saving…" : "Save", onClick: save }}
        secondaryAction={{ label: "Cancel", onClick: () => setOpen(false) }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-16)" }}>
          <label className="hub-form__field">
            <span className="account-card__label">Tagline</span>
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="A short line under your community name" maxLength={120} />
          </label>
          <label className="hub-form__field">
            <span className="account-card__label">About</span>
            <Textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={3} placeholder="What's this community about? Who's it for?" maxLength={500} fullWidth />
          </label>
          <label className="hub-form__field">
            <span className="account-card__label">Accent color</span>
            <Select options={ACCENT_OPTIONS} value={accent} onChange={(v) => setAccent((typeof v === "string" ? v : v[0] ?? ""))} fullWidth />
            <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
              Tints your community page. Leave on Default to use your brand color.
            </span>
          </label>

          {pinOptions.length > 1 && (
            <label className="hub-form__field">
              <span className="account-card__label">Pinned post</span>
              <Select options={pinOptions} value={pinnedPostId} onChange={(v) => setPinnedPostId((typeof v === "string" ? v : v[0] ?? ""))} fullWidth />
              <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                Pin an announcement or rules to the top of your feed.
              </span>
            </label>
          )}

          {/* Appearance — background + card style (reuses the profile skin gate). */}
          <div className="hub-form__field">
            <span className="account-card__label">Background</span>
            <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap", marginTop: "var(--spacing-6)" }}>
              {(["none", "color", "gradient"] as BackgroundKind[]).map((k) => (
                <Button key={k} variant={skin.bg.kind === k ? "primary" : "secondary"} size="small" onClick={() => setBg({ kind: k })}>{k[0].toUpperCase() + k.slice(1)}</Button>
              ))}
            </div>
            {skin.bg.kind === "color" && (
              <input type="color" value={skin.bg.color || "#5457e5"} onChange={(e) => setBg({ color: e.target.value })} style={{ marginTop: "var(--spacing-8)", width: 48, height: 32, border: "1px solid var(--border-default)", borderRadius: 6, background: "none", cursor: "pointer" }} />
            )}
            {skin.bg.kind === "gradient" && (
              <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap", marginTop: "var(--spacing-8)" }}>
                {Object.entries(SKIN_GRADIENTS).map(([id, cssv]) => (
                  <button key={id} type="button" aria-label={id} onClick={() => setBg({ gradient: id })} style={{ width: 52, height: 36, borderRadius: 8, background: cssv, cursor: "pointer", border: `2px solid ${skin.bg.gradient === id ? "var(--primary-500)" : "var(--border-default)"}` }} />
                ))}
              </div>
            )}
          </div>
          <div className="hub-form__field" style={{ display: "flex", gap: "var(--spacing-24)", flexWrap: "wrap" }}>
            <div>
              <span className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-6)" }}>Card border</span>
              <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
                {(["subtle", "bold", "none"] as CardBorder[]).map((b) => (
                  <Button key={b} variant={skin.card.border === b ? "primary" : "secondary"} size="small" onClick={() => setCard({ border: b })}>{b[0].toUpperCase() + b.slice(1)}</Button>
                ))}
              </div>
            </div>
            <div>
              <span className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-6)" }}>Card corners</span>
              <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
                {(["sm", "md", "lg"] as CardRadius[]).map((r) => (
                  <Button key={r} variant={skin.card.radius === r ? "primary" : "secondary"} size="small" onClick={() => setCard({ radius: r })}>{r.toUpperCase()}</Button>
                ))}
              </div>
            </div>
          </div>
          <label className="hub-form__field">
            <span className="account-card__label">Custom CSS <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(advanced)</span></span>
            <Textarea value={css} onChange={(e) => setCss(e.target.value)} rows={4} spellCheck={false} placeholder=".card { border-radius: 18px; }" fullWidth />
            <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
              Scoped to your community page and sanitized on save (safe properties + your own images only).
            </span>
          </label>

          <div className="hub-form__field">
            <span className="account-card__label">Sections</span>
            <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", display: "block", marginBottom: "var(--spacing-8)" }}>
              Turn off what your community doesn&apos;t use. The feed and members always show.
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
              {COMMUNITY_TOGGLEABLE_SECTIONS.map((s) => (
                <label key={s.key} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
                  <Switch checked={isShown(s.key)} onChange={() => toggleSection(s.key)} />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
}
