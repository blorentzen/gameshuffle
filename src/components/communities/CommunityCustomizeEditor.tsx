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
  initial: { tagline: string | null; blurb: string | null; accent: string | null; hiddenSections: string[]; pinnedPostId: string | null };
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
  const [saving, setSaving] = useState(false);

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
        body: JSON.stringify({ tagline: tagline.trim() || null, blurb: blurb.trim() || null, accent: accent || null, hiddenSections: hidden, pinnedPostId: pinnedPostId || null }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        toast.success("Community updated.");
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
            <Textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={3} placeholder="What's this community about? Who's it for?" maxLength={500} />
          </label>
          <label className="hub-form__field">
            <span className="account-card__label">Accent color</span>
            <Select options={ACCENT_OPTIONS} value={accent} onChange={(v) => setAccent((typeof v === "string" ? v : v[0] ?? ""))} fullWidth />
            <span style={{ fontSize: "var(--font-size-13)", color: "var(--text-tertiary)" }}>
              Tints your community page. Leave on Default to use your brand color.
            </span>
          </label>

          {pinOptions.length > 1 && (
            <label className="hub-form__field">
              <span className="account-card__label">Pinned post</span>
              <Select options={pinOptions} value={pinnedPostId} onChange={(v) => setPinnedPostId((typeof v === "string" ? v : v[0] ?? ""))} fullWidth />
              <span style={{ fontSize: "var(--font-size-13)", color: "var(--text-tertiary)" }}>
                Pin an announcement or rules to the top of your feed.
              </span>
            </label>
          )}

          <div className="hub-form__field">
            <span className="account-card__label">Sections</span>
            <span style={{ fontSize: "var(--font-size-13)", color: "var(--text-tertiary)", display: "block", marginBottom: "var(--spacing-8)" }}>
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
