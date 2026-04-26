"use client";

/**
 * Avatar customization modal — Phase 2.1 of gs-avatars-spec.md.
 *
 * Surfaces the five most-impactful Adventurer features (hair, hairColor,
 * skinColor, eyes, mouth, glasses) as swatch grids with a live SVG
 * preview at the top. "Save" persists the selection set to
 * `users.avatar_options` jsonb; "Reset to random" clears overrides AND
 * mints a fresh seed so the user gets a brand-new randomized avatar.
 *
 * Lives inline in <AvatarSection /> — the modal is mounted always but
 * only renders content when `isOpen` is true (CDS Modal handles the
 * portal + ESC + overlay close behavior).
 */

import { useEffect, useMemo, useState } from "react";
import { Accordion, Modal } from "@empac/cascadeds";
import { ADVENTURER_OPTIONS, generateDicebearAvatar, type AvatarOptions } from "@/lib/avatar/dicebear";

export interface AvatarEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Used to seed the live preview when no overrides are set yet. */
  seed: string;
  /** Current persisted overrides, if any. */
  initialOptions: AvatarOptions | null;
  /** Save handler — receives the new options object (empty {} clears overrides). */
  onSave: (next: AvatarOptions) => Promise<void> | void;
}

/**
 * Categories surfaced to the user, in the order they appear in the modal.
 * Each picks an icon-style label that's recognizable without DiceBear
 * variant naming bleeding through ("variant26", etc).
 */
const CATEGORIES: Array<{
  key: keyof AvatarOptions;
  label: string;
  /**
   * "preview" swatches render a mini-avatar with just that feature
   * swapped — used for hair, hairColor, skinColor, eyes, mouth, glasses.
   * "color" is reserved for the Background category where there's no
   * face to show, just the surrounding fill.
   */
  swatchKind: "color" | "preview";
  /** Allow a "none" option (only meaningful for glasses today). */
  allowNone?: boolean;
}> = [
  { key: "hair", label: "Hair style", swatchKind: "preview" },
  { key: "hairColor", label: "Hair color", swatchKind: "preview" },
  { key: "skinColor", label: "Skin tone", swatchKind: "preview" },
  { key: "eyes", label: "Eyes", swatchKind: "preview" },
  { key: "mouth", label: "Mouth", swatchKind: "preview" },
  { key: "glasses", label: "Glasses", swatchKind: "preview", allowNone: true },
  { key: "backgroundColor", label: "Background", swatchKind: "color" },
];

export function AvatarEditModal({
  isOpen,
  onClose,
  seed,
  initialOptions,
  onSave,
}: AvatarEditModalProps) {
  const [draft, setDraft] = useState<AvatarOptions>({});
  const [saving, setSaving] = useState(false);

  // Sync draft from props every time the modal opens so closing without
  // saving discards in-flight edits.
  useEffect(() => {
    if (isOpen) setDraft(initialOptions ?? {});
  }, [isOpen, initialOptions]);

  const previewSvg = useMemo(() => generateDicebearAvatar(seed, draft), [seed, draft]);

  const handlePick = (key: keyof AvatarOptions, value: string | undefined) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit avatar"
      size="large"
      primaryAction={{ label: saving ? "Saving…" : "Save changes", onClick: () => void handleSave() }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
        <span
          role="img"
          aria-label="Avatar preview"
          style={{ width: 128, height: 128, borderRadius: "50%", overflow: "hidden", display: "inline-block", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
          dangerouslySetInnerHTML={{ __html: previewSvg }}
        />
        <p style={{ fontSize: "12px", color: "#808080", margin: 0, textAlign: "center" }}>
          Pick from any category below. Anything you don&apos;t set stays randomized from your seed.
        </p>
      </div>

      <Accordion
        variant="bordered"
        defaultOpenIds={[CATEGORIES[0].key]}
        items={CATEGORIES.map((cat) => ({
          id: cat.key,
          title: cat.label,
          content: (
            <CategorySection
              current={draft[cat.key]}
              options={ADVENTURER_OPTIONS[cat.key as keyof typeof ADVENTURER_OPTIONS] ?? []}
              seed={seed}
              optionKey={cat.key}
              swatchKind={cat.swatchKind}
              allowNone={cat.allowNone}
              draft={draft}
              onPick={(value) => handlePick(cat.key, value)}
            />
          ),
        }))}
      />
    </Modal>
  );
}

function CategorySection({
  current,
  options,
  seed,
  optionKey,
  swatchKind,
  allowNone,
  draft,
  onPick,
}: {
  current: string | undefined;
  options: readonly string[];
  seed: string;
  optionKey: keyof AvatarOptions;
  swatchKind: "color" | "preview";
  allowNone?: boolean;
  draft: AvatarOptions;
  onPick: (value: string | undefined) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          swatchKind === "color"
            ? "repeat(auto-fill, minmax(40px, 1fr))"
            : "repeat(auto-fill, minmax(64px, 1fr))",
        gap: "0.5rem",
        maxHeight: "240px",
        overflowY: "auto",
        padding: "0.25rem",
      }}
    >
      {allowNone && (
        <Swatch
          label="None"
          isActive={current === "none"}
          onClick={() => onPick("none")}
          kind="text"
        />
      )}
      {options.map((value) => (
        <Swatch
          key={value}
          label={value}
          isActive={current === value}
          onClick={() => onPick(value)}
          kind={swatchKind}
          color={swatchKind === "color" ? `#${value}` : undefined}
          preview={
            swatchKind === "preview"
              ? generateDicebearAvatar(seed, { ...draft, [optionKey]: value })
              : undefined
          }
        />
      ))}
    </div>
  );
}

function Swatch({
  label,
  isActive,
  onClick,
  kind,
  color,
  preview,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  kind: "color" | "preview" | "text";
  color?: string;
  preview?: string;
}) {
  const ringStyle: React.CSSProperties = {
    border: isActive ? "2px solid #0E75C1" : "2px solid transparent",
    boxShadow: isActive ? "0 0 0 2px rgba(14,117,193,0.18)" : "none",
  };
  if (kind === "color") {
    return (
      <button
        type="button"
        title={label}
        onClick={onClick}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: color,
          cursor: "pointer",
          padding: 0,
          ...ringStyle,
        }}
      />
    );
  }
  if (kind === "text") {
    return (
      <button
        type="button"
        title={label}
        onClick={onClick}
        style={{
          width: 64,
          height: 64,
          borderRadius: "0.4rem",
          background: "#f5f6f8",
          color: isActive ? "#0E75C1" : "#606060",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          cursor: "pointer",
          padding: 0,
          ...ringStyle,
        }}
      >
        {label}
      </button>
    );
  }
  // preview
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      style={{
        width: 64,
        height: 64,
        borderRadius: "0.4rem",
        overflow: "hidden",
        background: "#fff",
        cursor: "pointer",
        padding: 0,
        ...ringStyle,
      }}
      dangerouslySetInnerHTML={preview ? { __html: preview } : undefined}
    />
  );
}
