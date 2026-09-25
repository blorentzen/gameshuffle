"use client";

/**
 * Setups & Games — a player's saved randomizer configs (grouped by type/game)
 * + their saved TCG Companion games. Self-loading so it can live in the
 * account "My Stuff" section page independent of the profile page's state.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState } from "@empac/cascadeds";
import { IconDeviceGamepad2, IconCards } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { deleteConfig } from "@/lib/configs";
import { CONFIG_TYPE_LABELS, type ConfigType } from "@/data/config-types";
import { SetupCard } from "@/components/account/SetupCard";
import { getGameName } from "@/data/game-registry";
import { nightVisual } from "@/data/game-night-visuals";
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
          {/* The instruction was right but unclickable: it told people to go to
              the randomizer without taking them there. */}
          <EmptyState
            variant="subtle"
            icon={<IconDeviceGamepad2 size={40} stroke={1.4} />}
            title="No saved setups yet"
            description="Randomize a kart build, an item set or a whole game night, then hit Save to keep it here."
            action={
              <Link href="/randomizers/mario-kart-8-deluxe" style={{ textDecoration: "none" }}>
                <Button variant="primary">Open the randomizer</Button>
              </Link>
            }
          />
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
          <EmptyState
            variant="subtle"
            icon={<IconCards size={40} stroke={1.4} />}
            title="No saved games yet"
            description="Start a game in the TCG Companion and tap Save to pick it back up later."
            action={
              <Link href="/tcg-companion" style={{ textDecoration: "none" }}>
                <Button variant="secondary">Open the companion</Button>
              </Link>
            }
          />
        ) : (
          <div className="bgn-grid">
            {companionSaves.map((save) => {
              const formatLabel = formatByKey(save.gameSettings.format).label;
              const displayName =
                save.name?.trim() ||
                defaultSaveName(formatLabel, save.updatedAt);
              const updated = new Date(save.updatedAt).toLocaleDateString();
              const isDeleting = companionDeletingId === save.id;
              const v = nightVisual(save.id);
              return (
                <div key={save.id} className="bgn-card bgn-card--static">
                  <span className="bgn-card__hero" style={{ background: v.gradient }}>
                    <span className="bgn-card__hero-emoji" aria-hidden>🃏</span>
                  </span>
                  <span className="bgn-card__body">
                    <span className="bgn-card__when">
                      {formatLabel} · {save.gameSettings.prizeCount}{" "}
                      {save.gameSettings.prizeCount === 1 ? "prize" : "prizes"}
                    </span>
                    <span className="bgn-card__title">{displayName}</span>
                    <span className="mystuff-card__place">
                      {save.sessionData.playerNames.p1} vs {save.sessionData.playerNames.p2} · Saved {updated}
                    </span>
                    <span className="bgn-card__actions">
                      <Button variant="primary" size="small" onClick={() => handleResumeCompanionSave(save.id)} disabled={isDeleting}>
                        Resume
                      </Button>
                      <Button variant="secondary" size="small" onClick={() => handleDeleteCompanionSave(save.id)} disabled={isDeleting}>
                        {isDeleting ? "Deleting…" : "Delete"}
                      </Button>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
