"use client";

/**
 * Setups & Games — a player's saved randomizer configs (grouped by type/game)
 * + their saved TCG Companion games. Self-loading so it can live in the
 * account "My Stuff" section page independent of the profile page's state.
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { deleteConfig } from "@/lib/configs";
import { CONFIG_TYPE_LABELS, type ConfigType } from "@/data/config-types";
import { SetupCard } from "@/components/account/SetupCard";
import { getGameName } from "@/data/game-registry";
import { deleteCompanionSaveAction } from "@/app/tcg-companion/save/actions";
import {
  defaultSaveName,
  type CompanionSavedState,
} from "@/lib/companion/saveStates";
import { formatByKey } from "@/lib/companion/gameSettings";

interface SavedConfig {
  id: string;
  randomizer_slug: string;
  config_name: string;
  config_data: Record<string, unknown> & { type?: string; gameSlug?: string };
  share_token: string | null;
  is_public: boolean;
  created_at: string;
}

export function SetupsTab() {
  const { user } = useAuth();
  const supabase = createClient();
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [companionSaves, setCompanionSaves] = useState<CompanionSavedState[]>([]);
  const [companionDeletingId, setCompanionDeletingId] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      const [configsRes, companionSavesRes] = await Promise.all([
        supabase
          .from("saved_configs")
          .select(
            "id, randomizer_slug, config_name, config_data, share_token, is_public, created_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("companion_save_states")
          .select(
            "id, name, mode, game_settings, session_data, state_version, updated_at, created_at",
          )
          .eq("account_id", user.id)
          .order("updated_at", { ascending: false }),
      ]);
      if (!active) return;
      setConfigs((configsRes.data as SavedConfig[]) ?? []);
      setCompanionSaves(
        (companionSavesRes.data ?? []).map((r) => ({
          id: r.id as string,
          name: (r.name as string | null) ?? null,
          mode: r.mode as string,
          gameSettings: r.game_settings as CompanionSavedState["gameSettings"],
          sessionData: r.session_data as CompanionSavedState["sessionData"],
          stateVersion: r.state_version as number,
          updatedAt: r.updated_at as string,
          createdAt: r.created_at as string,
        })) as CompanionSavedState[],
      );
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [user, supabase]);

  const handleDeleteConfig = async (configId: string) => {
    if (!user) return;
    const { error } = await deleteConfig(configId, user.id);
    if (!error) setConfigs((prev) => prev.filter((c) => c.id !== configId));
  };

  const handleCopyLink = (shareToken: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/s/${shareToken}`);
    setCopied(shareToken);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDeleteCompanionSave = async (saveId: string) => {
    setCompanionDeletingId(saveId);
    const result = await deleteCompanionSaveAction(saveId);
    if (result.ok) {
      setCompanionSaves((prev) => prev.filter((s) => s.id !== saveId));
    }
    setCompanionDeletingId(null);
  };

  const handleResumeCompanionSave = (saveId: string) => {
    window.location.assign(
      `/tcg-companion?resume=${encodeURIComponent(saveId)}`,
    );
  };

  if (loading) {
    return (
      <div className="account-card">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <>
      {/* Saved Configs */}
      {configs.length === 0 ? (
        <div className="account-card">
          <h2>Saved Configs</h2>
          <p style={{ color: "var(--text-tertiary)" }}>
            No saved items yet. Randomize a kart build and hit &quot;Save
            Build&quot; to get started.
          </p>
        </div>
      ) : (
        (
          [
            "game-night-setup",
            "kart-build",
            "item-set",
            "track-list",
            "player-preset",
            "ruleset",
          ] as ConfigType[]
        ).map((type) => {
          const typeConfigs = configs.filter(
            (c) => c.config_data?.type === type,
          );
          if (typeConfigs.length === 0) return null;

          const gameGroups = new Map<string, typeof typeConfigs>();
          for (const config of typeConfigs) {
            const slug =
              config.config_data?.gameSlug ||
              config.randomizer_slug ||
              "unknown";
            if (!gameGroups.has(slug)) gameGroups.set(slug, []);
            gameGroups.get(slug)!.push(config);
          }

          if (gameGroups.size === 1) {
            return (
              <div key={type} className="account-card">
                <h2>{CONFIG_TYPE_LABELS[type]}</h2>
                <div className="saved-builds-grid">
                  {typeConfigs.map((config) => (
                    <SetupCard
                      key={config.id}
                      config={config}
                      onCopyLink={handleCopyLink}
                      onDelete={handleDeleteConfig}
                      copied={copied}
                    />
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div key={type} className="account-card">
              <h2>{CONFIG_TYPE_LABELS[type]}</h2>
              {Array.from(gameGroups.entries()).map(([slug, gameConfigs]) => (
                <div key={slug} style={{ marginBottom: "var(--spacing-24)" }}>
                  <h3
                    style={{
                      fontSize: "var(--font-size-16)",
                      fontWeight: "var(--font-weight-semibold)",
                      color: "var(--text-secondary)",
                      marginBottom: "var(--spacing-12)",
                    }}
                  >
                    {getGameName(slug)}
                  </h3>
                  <div className="saved-builds-grid">
                    {gameConfigs.map((config) => (
                      <SetupCard
                        key={config.id}
                        config={config}
                        onCopyLink={handleCopyLink}
                        onDelete={handleDeleteConfig}
                        copied={copied}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}

      {/* TCG Companion saved games */}
      <div className="account-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--spacing-24)",
          }}
        >
          <h2>Saved TCG Companion Games</h2>
          <a href="/tcg-companion">
            <Button variant="primary" size="small">
              Open Companion
            </Button>
          </a>
        </div>
        {companionSaves.length === 0 ? (
          <p
            style={{
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-14)",
            }}
          >
            No saved games yet. Start a game in the TCG Companion and tap Save to
            keep it for later.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-8)",
            }}
          >
            {companionSaves.map((save) => {
              const formatLabel = formatByKey(save.gameSettings.format).label;
              const displayName =
                save.name?.trim() ||
                defaultSaveName(formatLabel, save.updatedAt);
              const updated = new Date(save.updatedAt).toLocaleString();
              const isDeleting = companionDeletingId === save.id;
              return (
                <div key={save.id} className="manage-participant-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: "var(--font-weight-semibold)",
                        fontSize: "var(--font-size-14)",
                      }}
                    >
                      {displayName}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--font-size-12)",
                        color: "var(--primary-600)",
                        marginLeft: "var(--spacing-8)",
                      }}
                    >
                      {formatLabel} · {save.gameSettings.prizeCount}{" "}
                      {save.gameSettings.prizeCount === 1 ? "prize" : "prizes"}
                    </span>
                    <div
                      style={{
                        fontSize: "var(--font-size-12)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {save.sessionData.playerNames.p1} vs{" "}
                      {save.sessionData.playerNames.p2} · Saved {updated}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--spacing-8)",
                    }}
                  >
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => handleResumeCompanionSave(save.id)}
                      disabled={isDeleting}
                    >
                      Resume
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => handleDeleteCompanionSave(save.id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
