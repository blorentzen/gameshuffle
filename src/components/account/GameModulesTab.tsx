"use client";

/**
 * GameModulesTab — streamer-level template defaults for the per-game
 * module configurators.
 *
 * Surface shape:
 *   - Top of the page: short intro + "picks/bans coming next" note.
 *   - Grid of game tiles (artwork + name + status pill). Click a
 *     tile to open a modal with the per-game configurator. Save in
 *     the modal upserts `streamer_module_defaults` for that game.
 *
 * Storage: `streamer_module_defaults` (owner_user_id, module_id,
 * game_slug, config). The seed helper consults this on every session
 * load and prefers the streamer override over the hardcoded
 * `RACE_RANDOMIZER_TEMPLATES` baseline.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Radio,
  RadioGroup,
  Switch,
} from "@empac/cascadeds";
import { GAMERTAG_PLATFORMS } from "@/data/gamertag-types";
import type {
  GamertagPlatformKey,
  RaceRandomizerConfig,
} from "@/lib/modules/types";
import { GameArtwork } from "@/components/hub/GameArtwork";

interface GameDef {
  slug: string;
  label: string;
  hasRallies: boolean;
}

const GAMES: GameDef[] = [
  { slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe", hasRallies: false },
  { slug: "mario-kart-world", label: "Mario Kart World", hasRallies: true },
];

const SERIES_PRESETS = [1, 2, 4, 6, 8, 12, 16];

export function GameModulesTab() {
  // Set of game slugs with a saved `streamer_module_defaults` row.
  // Drives the "Customized" badge on each tile. Refreshed after every
  // modal save so the badge stays in sync.
  const [customizedSlugs, setCustomizedSlugs] = useState<Set<string>>(
    new Set(),
  );
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const refreshCustomized = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/account/module-defaults?moduleId=race_randomizer",
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as {
        rows: Array<{ gameSlug: string }>;
      };
      setCustomizedSlugs(new Set(body.rows.map((r) => r.gameSlug)));
    } catch {
      // Silent — the page is still usable, badge will just stay
      // "Using GameShuffle default" until a save refreshes it.
    }
  }, []);

  useEffect(() => {
    void refreshCustomized();
  }, [refreshCustomized]);

  const editingGame = editingSlug
    ? GAMES.find((g) => g.slug === editingSlug) ?? null
    : null;

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Game Modules</h2>
      <p className="account-tab__intro">
        Set your default config per game. New sessions seed from here
        automatically — no more re-configuring from scratch each
        stream. Existing sessions keep whatever config they already
        had (use the per-session <em>Reset to default</em> button to
        pull in your new defaults).
      </p>

      <Alert variant="info">
        Picks/bans pool editing lives on the per-session Modules tab
        for now — it&rsquo;ll move here in the next pass. Everything
        in the per-game editor already pre-seeds into new sessions.
      </Alert>

      {topError && (
        <div style={{ marginTop: "var(--spacing-16)" }}>
          <Alert variant="error" onClose={() => setTopError(null)}>
            {topError}
          </Alert>
        </div>
      )}

      <div className="game-modules__grid">
        {GAMES.map((game) => (
          <button
            type="button"
            key={game.slug}
            className="game-modules__tile"
            onClick={() => setEditingSlug(game.slug)}
            aria-label={`Edit ${game.label} defaults`}
          >
            <GameArtwork slug={game.slug} size="tile" hideLabel />
            <div className="game-modules__tile-body">
              <span className="game-modules__tile-name">{game.label}</span>
              <span
                className={`game-modules__tile-status game-modules__tile-status--${
                  customizedSlugs.has(game.slug) ? "customized" : "default"
                }`}
              >
                {customizedSlugs.has(game.slug)
                  ? "Customized"
                  : "Using GameShuffle default"}
              </span>
            </div>
          </button>
        ))}
      </div>

      {editingGame && (
        <GameDefaultsModal
          game={editingGame}
          isOpen={!!editingGame}
          onClose={() => setEditingSlug(null)}
          onSaved={() => void refreshCustomized()}
          onError={(msg) => setTopError(msg)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal — per-game configurator
// ---------------------------------------------------------------------------

interface ModalProps {
  game: GameDef;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function GameDefaultsModal({
  game,
  isOpen,
  onClose,
  onSaved,
  onError,
}: ModalProps) {
  const [config, setConfig] = useState<RaceRandomizerConfig | null>(null);
  const [customized, setCustomized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/account/module-defaults?moduleId=race_randomizer&gameSlug=${encodeURIComponent(
          game.slug,
        )}`,
        { cache: "no-store" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        config?: RaceRandomizerConfig | null;
        error?: string;
      };
      if (!res.ok) {
        setLoadError(body.error || `Failed to load (${res.status}).`);
        return;
      }
      if (body.config) {
        setConfig(body.config);
        setCustomized(true);
      } else {
        // Hydrate from the hardcoded baseline so the form starts
        // populated when the streamer has never customized this game.
        const { getRaceRandomizerTemplate } = await import(
          "@/lib/modules/templates"
        );
        setConfig(getRaceRandomizerTemplate(game.slug));
        setCustomized(false);
      }
    } catch {
      setLoadError("Network error while loading.");
    }
  }, [game.slug]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const patch = (next: Partial<RaceRandomizerConfig>) => {
    setConfig((c) => (c ? { ...c, ...next } : c));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/account/module-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: "race_randomizer",
          gameSlug: game.slug,
          config,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setLoadError(body.error || `Save failed (${res.status}).`);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setLoadError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  const resetToBaseline = async () => {
    setResetting(true);
    setLoadError(null);
    try {
      const { getRaceRandomizerTemplate } = await import(
        "@/lib/modules/templates"
      );
      const baseline = getRaceRandomizerTemplate(game.slug);
      setConfig(baseline);
      setCustomized(false);
      // Persist the baseline so subsequent loads return it from the
      // override row directly — no flicker between "Customized" and
      // "Using default" as the streamer iterates.
      const res = await fetch("/api/account/module-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: "race_randomizer",
          gameSlug: game.slug,
          config: baseline,
        }),
      });
      if (!res.ok) {
        onError("Failed to persist reset.");
      } else {
        onSaved();
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={game.label}
      size="medium"
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--spacing-12)",
            width: "100%",
          }}
        >
          <Button
            variant="secondary"
            size="small"
            onClick={resetToBaseline}
            loading={resetting}
            disabled={saving || resetting}
          >
            Reset to GameShuffle default
          </Button>
          <div
            style={{
              display: "flex",
              gap: "var(--spacing-8)",
            }}
          >
            <Button
              variant="tertiary"
              onClick={onClose}
              disabled={saving || resetting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={save}
              loading={saving}
              disabled={saving || resetting || !config}
            >
              Save defaults
            </Button>
          </div>
        </div>
      }
    >
      {loadError && (
        <div style={{ marginBottom: "var(--spacing-12)" }}>
          <Alert variant="error" onClose={() => setLoadError(null)}>
            {loadError}
          </Alert>
        </div>
      )}

      {!config ? (
        <p
          style={{
            color: "var(--text-tertiary)",
            fontSize: "var(--font-size-14)",
            margin: 0,
          }}
        >
          Loading…
        </p>
      ) : (
        <>
          <div
            style={{
              fontSize: "var(--font-size-12)",
              color: customized
                ? "var(--success-700)"
                : "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontWeight: "var(--font-weight-semibold)",
              marginBottom: "var(--spacing-16)",
            }}
          >
            {customized ? "Customized" : "Using GameShuffle default"}
          </div>

          <div className="hub-form__field-stack">
            <label className="hub-form__inline-field hub-form__inline-field--row">
              <Switch
                checked={config.enabled}
                onChange={() => patch({ enabled: !config.enabled })}
              />
              <span>
                <strong>
                  {config.enabled ? "Module enabled" : "Module disabled"}
                </strong>
                <span className="hub-form__platform-disabled">
                  When disabled, <code>!gs-track</code>,{" "}
                  <code>!gs-items</code>, and <code>!gs-race</code> stay
                  silent by default for this game.
                </span>
              </span>
            </label>

            <label
              className="hub-form__field"
              htmlFor={`series-${game.slug}`}
            >
              <span className="hub-form__label">
                Default series length
              </span>
              <select
                id={`series-${game.slug}`}
                className="hub-form__select"
                value={String(config.defaultSeriesLength ?? 1)}
                onChange={(e) =>
                  patch({
                    defaultSeriesLength: parseInt(e.target.value, 10),
                  })
                }
              >
                {SERIES_PRESETS.map((n) => (
                  <option key={n} value={String(n)}>
                    {n === 1 ? "1 race" : `${n} races`}
                  </option>
                ))}
              </select>
            </label>

            {game.hasRallies && (
              <RadioGroup
                name={`roll-kind-${game.slug}`}
                label="Default !gs-race kind"
                orientation="vertical"
                value={config.rollKind ?? "race"}
                onChange={(v) =>
                  patch({ rollKind: v as "race" | "rally" | "auto" })
                }
              >
                <Radio
                  value="race"
                  label="Race tracks"
                  helperText="!gs-race rolls a regular race track."
                />
                <Radio
                  value="rally"
                  label="Knockout rallies"
                  helperText="!gs-race rolls a knockout rally."
                />
                <Radio
                  value="auto"
                  label="Mix it up"
                  helperText="!gs-race picks a race or rally at random each call."
                />
              </RadioGroup>
            )}

            <div className="hub-form__field">
              <span className="hub-form__label">Series duplicates</span>
              <label className="hub-form__inline-field hub-form__inline-field--row">
                <Switch
                  checked={!!config.allowSeriesDuplicates}
                  onChange={() =>
                    patch({
                      allowSeriesDuplicates: !config.allowSeriesDuplicates,
                    })
                  }
                />
                <span>
                  <strong>
                    {config.allowSeriesDuplicates
                      ? "Duplicates allowed"
                      : "No duplicate tracks"}
                  </strong>
                  <span className="hub-form__platform-disabled">
                    {config.allowSeriesDuplicates
                      ? "A track can roll more than once in a series."
                      : "Each track rolls at most once per series. Competitive default."}
                  </span>
                </span>
              </label>
            </div>

            <RadioGroup
              name={`share-mode-${game.slug}`}
              label="Share room code via"
              orientation="vertical"
              value={config.roomCodeShareMode ?? "twitch_chat"}
              onChange={(v) =>
                patch({
                  roomCodeShareMode: v as "twitch_chat" | "discord",
                })
              }
            >
              <Radio
                value="twitch_chat"
                label="Twitch chat"
                helperText="Bot replies in chat with the code when a viewer types !gs room."
              />
              <Radio
                value="discord"
                label="Discord"
                helperText="Bot redirects askers to your Discord invite AND posts the code in your configured Discord channel whenever it changes. Requires Discord bot + invite URL set on your profile."
              />
            </RadioGroup>

            <div className="hub-form__field">
              <span className="hub-form__label">Playable on</span>
              <div className="hub-form__platform-grid">
                {GAMERTAG_PLATFORMS.map((p) => {
                  const checked = config.platforms?.includes(p.key) ?? false;
                  return (
                    <label
                      key={p.key}
                      className="hub-form__inline-field hub-form__inline-field--row"
                    >
                      <Checkbox
                        checked={checked}
                        onChange={(e) => {
                          const current = new Set<GamertagPlatformKey>(
                            config.platforms ?? [],
                          );
                          if (e.target.checked) current.add(p.key);
                          else current.delete(p.key);
                          patch({ platforms: Array.from(current) });
                        }}
                      />
                      <span>
                        <strong>{p.label}</strong>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <RadioGroup
              name={`fc-share-mode-${game.slug}`}
              label="Share friend codes via"
              orientation="vertical"
              value={config.fcShareMode ?? "twitch_chat"}
              onChange={(v) =>
                patch({
                  fcShareMode: v as "twitch_chat" | "discord",
                })
              }
            >
              <Radio
                value="twitch_chat"
                label="Twitch chat"
                helperText="Bot posts your friend codes (for the platforms checked above) when a viewer types !gs fc."
              />
              <Radio
                value="discord"
                label="Discord"
                helperText="Bot redirects askers to your Discord invite — keep your FCs pinned there. Falls back to chat if no invite is set."
              />
            </RadioGroup>
          </div>
        </>
      )}
    </Modal>
  );
}
