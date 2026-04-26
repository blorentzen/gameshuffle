"use client";

/**
 * Avatar picker — uses <UserAvatar /> for preview + lets users choose
 * between DiceBear (default), Twitch, and Discord. When the user is on
 * DiceBear mode, hovering the avatar reveals "Edit Avatar" which pops
 * the customization modal (Phase 2.1 — hair/skin/eyes/mouth/glasses
 * overrides via jsonb `users.avatar_options`).
 *
 * Per gs-avatars-spec.md §5 + §12 + gs-connections-architecture.md §6.
 *
 * Persistence: PATCH-style update through the existing supabase client
 * — same RLS-honored path the rest of the Profile tab uses for users
 * table updates.
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { AvatarEditModal } from "./AvatarEditModal";
import type { AvatarOptions } from "@/lib/avatar/dicebear";

export interface AvatarSectionProps {
  userId: string;
  initialSource: AvatarSource;
  initialSeed: string | null;
  initialOptions: AvatarOptions | null;
  twitchAvatar: string | null;
  discordAvatar: string | null;
  /** Fires after a successful save so callers can refresh navbar avatars etc. */
  onSaved?: (next: { source: AvatarSource; seed: string | null; options: AvatarOptions | null }) => void;
}

export function AvatarSection({
  userId,
  initialSource,
  initialSeed,
  initialOptions,
  twitchAvatar,
  discordAvatar,
  onSaved,
}: AvatarSectionProps) {
  const [source, setSource] = useState<AvatarSource>(initialSource || "dicebear");
  const [seed, setSeed] = useState<string | null>(initialSeed);
  const [options, setOptions] = useState<AvatarOptions | null>(initialOptions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewHover, setPreviewHover] = useState(false);

  // Sync local state if parent reloaded after a connection change.
  useEffect(() => {
    setSource(initialSource || "dicebear");
  }, [initialSource]);
  useEffect(() => {
    setSeed(initialSeed);
  }, [initialSeed]);
  useEffect(() => {
    setOptions(initialOptions);
  }, [initialOptions]);

  const persist = async (
    nextSource: AvatarSource,
    nextSeed: string | null,
    nextOptions: AvatarOptions | null
  ) => {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: dbErr } = await supabase
        .from("users")
        .update({
          avatar_source: nextSource,
          avatar_seed: nextSeed,
          avatar_options: nextOptions && Object.keys(nextOptions).length > 0 ? nextOptions : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (dbErr) {
        setError(dbErr.message || "Couldn't save avatar.");
        return false;
      }
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
      window.dispatchEvent(new CustomEvent("profile-updated"));
      onSaved?.({ source: nextSource, seed: nextSeed, options: nextOptions });
      return true;
    } finally {
      setSaving(false);
    }
  };

  const handlePick = async (next: AvatarSource) => {
    setSource(next);
    await persist(next, seed, options);
  };

  const handleSaveOptions = async (next: AvatarOptions) => {
    const cleaned = Object.keys(next).length > 0 ? next : null;
    setOptions(cleaned);
    await persist(source === "dicebear" || source === "initials" ? "dicebear" : "dicebear", seed, cleaned);
  };

  const previewUser = {
    id: userId,
    avatar_source: source,
    avatar_seed: seed,
    avatar_options: options,
    twitch_avatar: twitchAvatar,
    discord_avatar: discordAvatar,
  };

  const hasTwitchAvatar = !!twitchAvatar;
  const hasDiscordAvatar = !!discordAvatar;
  const isDiceBearMode = source === "dicebear" || source === "initials";

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => isDiceBearMode && setEditOpen(true)}
        onMouseEnter={() => setPreviewHover(true)}
        onMouseLeave={() => setPreviewHover(false)}
        onFocus={() => setPreviewHover(true)}
        onBlur={() => setPreviewHover(false)}
        disabled={!isDiceBearMode}
        title={isDiceBearMode ? "Edit avatar" : undefined}
        style={{
          position: "relative",
          padding: 0,
          background: "none",
          border: "none",
          cursor: isDiceBearMode ? "pointer" : "default",
          width: 88,
          height: 88,
          borderRadius: "50%",
        }}
      >
        <UserAvatar user={previewUser} size={88} alt="Your avatar" />
        {isDiceBearMode && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 600,
              opacity: previewHover ? 1 : 0,
              transition: "opacity 0.15s ease",
              pointerEvents: "none",
            }}
          >
            Edit Avatar
          </span>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 220 }}>
        <label className="account-card__label" style={{ display: "block", marginBottom: "0.5rem" }}>
          Avatar
        </label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button
            variant={isDiceBearMode ? "primary" : "secondary"}
            size="small"
            disabled={saving}
            onClick={() => void handlePick("dicebear")}
          >
            Generated
          </Button>
          {hasDiscordAvatar && (
            <Button
              variant={source === "discord" ? "primary" : "secondary"}
              size="small"
              disabled={saving}
              onClick={() => void handlePick("discord")}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <img
                  src="/images/icons/discord.svg"
                  alt=""
                  style={{
                    width: 14,
                    height: 14,
                    filter: source === "discord" ? "brightness(0) invert(1)" : "none",
                  }}
                />
                Discord
              </span>
            </Button>
          )}
          {hasTwitchAvatar && (
            <Button
              variant={source === "twitch" ? "primary" : "secondary"}
              size="small"
              disabled={saving}
              onClick={() => void handlePick("twitch")}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <img
                  src="/images/icons/twitch.svg"
                  alt=""
                  style={{
                    width: 14,
                    height: 14,
                    filter: source === "twitch" ? "brightness(0) invert(1)" : "none",
                  }}
                />
                Twitch
              </span>
            </Button>
          )}
        </div>

        {isDiceBearMode && (
          <div style={{ marginTop: "0.65rem" }}>
            <Button variant="secondary" size="small" disabled={saving} onClick={() => setEditOpen(true)}>
              Edit avatar
            </Button>
          </div>
        )}

        {!hasDiscordAvatar && !hasTwitchAvatar && (
          <p style={{ fontSize: "12px", color: "#808080", marginTop: "0.5rem", lineHeight: 1.5 }}>
            More avatar options unlock when you link Discord or Twitch in Connections.
          </p>
        )}

        {error && (
          <p style={{ fontSize: "12px", color: "#9a2f2c", marginTop: "0.5rem" }}>{error}</p>
        )}
        {savedFlash && (
          <p style={{ fontSize: "12px", color: "#155724", marginTop: "0.5rem", fontWeight: 600 }}>
            Saved.
          </p>
        )}
      </div>

      <AvatarEditModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        seed={seed?.trim() || userId}
        initialOptions={options}
        onSave={handleSaveOptions}
      />
    </div>
  );
}
