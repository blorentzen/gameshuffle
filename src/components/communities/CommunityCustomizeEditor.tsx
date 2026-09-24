"use client";

/**
 * Owner-only editor for a community's personalization — tagline, blurb, and an
 * accent color that tints the /c page (mirrors the "Personalize your profile"
 * card on /u). A button that opens a modal; saves via PATCH.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Select, Input, Textarea, Switch } from "@empac/cascadeds";
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
      <Button variant="secondary" size="small" onClick={() => setOpen(true)}>Customize community</Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Customize your community"
        size="medium"
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
      </Modal>
    </>
  );
}
