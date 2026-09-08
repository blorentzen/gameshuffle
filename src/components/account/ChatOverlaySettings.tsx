"use client";

/**
 * Chat Timeline Overlay settings — enable capture + tune the feed (theme,
 * animation, which roles show, hide commands, GS badge, size). Pro-gated to
 * match the other overlay tools. Position is set in the layout editor above;
 * this is the content config. Saves to /api/account/chat-overlay.
 */

import { useEffect, useState } from "react";
import { Button, Select, Checkbox, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

interface Settings {
  theme: string;
  animation: string;
  showRoles: string[];
  hideCommands: boolean;
  showGsBadge: boolean;
  maxMessages: number;
}

const THEME_OPTIONS = [
  { value: "default", label: "Default (dark glass)" },
  { value: "midnight", label: "Midnight" },
  { value: "mint", label: "Mint" },
  { value: "sunset", label: "Sunset" },
  { value: "mono", label: "Mono" },
];
const ANIM_OPTIONS = [
  { value: "slide", label: "Slide in" },
  { value: "fade", label: "Fade in" },
  { value: "none", label: "None" },
];
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "broadcaster", label: "Host" },
  { value: "moderator", label: "Mods" },
  { value: "vip", label: "VIPs" },
  { value: "subscriber", label: "Subscribers" },
  { value: "viewer", label: "Everyone else" },
];

export function ChatOverlaySettings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPro, setIsPro] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [s, setS] = useState<Settings>({
    theme: "default",
    animation: "slide",
    showRoles: ["broadcaster", "moderator", "vip", "subscriber", "viewer"],
    hideCommands: true,
    showGsBadge: true,
    maxMessages: 12,
  });

  useEffect(() => {
    fetch("/api/account/chat-overlay", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setEnabled(!!d.enabled);
        setIsPro(!!d.isPro);
        if (d.settings) setS(d.settings as Settings);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleRole(role: string) {
    setS((prev) => {
      const has = prev.showRoles.includes(role);
      const next = has ? prev.showRoles.filter((r) => r !== role) : [...prev.showRoles, role];
      return { ...prev, showRoles: next.length ? next : prev.showRoles };
    });
  }

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/account/chat-overlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) toast.success("Chat overlay saved");
      else if (res.status === 403) toast.error("Chat overlay is a GameShuffle Pro feature");
      else toast.error("Couldn't save. Try again.");
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="account-card__hint">Loading chat overlay settings…</p>;

  return (
    <div className="account-card">
      <div className="account-card__head">
        <h2 className="account-card__title">Chat timeline overlay</h2>
        <Switch
          checked={enabled}
          onChange={(e) => {
            const next = e.target.checked;
            setEnabled(next);
            void save({ enabled: next });
          }}
          disabled={!isPro || saving}
        />
      </div>
      <p className="account-card__hint">
        Show your chat as an animated feed on the OBS overlay, with role badges and a
        GameShuffle indicator so players with a profile stand out. Position it in the
        layout editor above. {!isPro && "Available on GameShuffle Pro."}
      </p>

      <div className="chat-ov-settings" aria-disabled={!isPro}>
        <div className="chat-ov-settings__row">
          <label className="account-card__label">
            Theme
            <Select
              value={s.theme}
              onChange={(v) => setS((p) => ({ ...p, theme: (typeof v === "string" ? v : v[0]) ?? "default" }))}
              options={THEME_OPTIONS}
            />
          </label>
          <label className="account-card__label">
            Animation
            <Select
              value={s.animation}
              onChange={(v) => setS((p) => ({ ...p, animation: (typeof v === "string" ? v : v[0]) ?? "slide" }))}
              options={ANIM_OPTIONS}
            />
          </label>
          <label className="account-card__label">
            Max messages
            <Select
              value={String(s.maxMessages)}
              onChange={(v) => setS((p) => ({ ...p, maxMessages: Number((typeof v === "string" ? v : v[0]) ?? 12) }))}
              options={[6, 8, 10, 12, 15, 20].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </label>
        </div>

        <div className="chat-ov-settings__roles">
          <span className="account-card__label">Show messages from</span>
          <div className="chat-ov-settings__checks">
            {ROLE_OPTIONS.map((r) => (
              <Checkbox
                key={r.value}
                label={r.label}
                checked={s.showRoles.includes(r.value)}
                onChange={() => toggleRole(r.value)}
              />
            ))}
          </div>
        </div>

        <div className="chat-ov-settings__checks">
          <Checkbox
            label="Hide command messages (starting with !)"
            checked={s.hideCommands}
            onChange={(e) => setS((p) => ({ ...p, hideCommands: e.target.checked }))}
          />
          <Checkbox
            label="Show the GameShuffle badge on players"
            checked={s.showGsBadge}
            onChange={(e) => setS((p) => ({ ...p, showGsBadge: e.target.checked }))}
          />
        </div>

        <div className="chat-ov-settings__actions">
          <Button
            variant="primary"
            disabled={!isPro || saving}
            onClick={() =>
              void save({
                theme: s.theme,
                animation: s.animation,
                showRoles: s.showRoles,
                hideCommands: s.hideCommands,
                showGsBadge: s.showGsBadge,
                maxMessages: s.maxMessages,
              })
            }
          >
            {saving ? "Saving…" : "Save chat overlay"}
          </Button>
        </div>
      </div>
    </div>
  );
}
