"use client";

/**
 * My Stuff ▸ Saved configs: saved randomizer setups (a section per kind,
 * grouped by game when there's more than one) and saved TCG Companion games.
 * Deleting asks first; copying a share link says so in a toast.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, List } from "@empac/cascadeds";
import { IconDeviceGamepad2, IconCards } from "@tabler/icons-react";
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
import { LoadingLines } from "@/components/loading/LoadingLines";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { AdminRowMenu, AdminScreen, AdminSection } from "@/components/account/admin/AdminKit";
import { StuffRow } from "@/components/account/stuff/StuffList";

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
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
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
    const config = configs.find((c) => c.id === configId);
    const ok = await confirm({
      title: `Delete ${config?.config_name ? `"${config.config_name}"` : "this setup"}?`,
      body: config?.share_token ? "Its share link stops working too." : undefined,
      confirmLabel: "Delete setup",
    });
    if (!ok) return;
    const { error } = await deleteConfig(configId, user.id);
    if (error) { toast.error("Couldn't delete that setup. Try again."); return; }
    setConfigs((prev) => prev.filter((c) => c.id !== configId));
    toast.success("Setup deleted");
  };

  const handleCopyLink = (shareToken: string) => {
    void navigator.clipboard.writeText(`${window.location.origin}/s/${shareToken}`);
    setCopied(shareToken);
    toast.success("Share link copied");
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDeleteCompanionSave = async (saveId: string, name: string) => {
    const ok = await confirm({ title: `Delete "${name}"?`, body: "You won't be able to resume this game.", confirmLabel: "Delete game" });
    if (!ok) return;
    setCompanionDeletingId(saveId);
    const result = await deleteCompanionSaveAction(saveId);
    if (result.ok) {
      setCompanionSaves((prev) => prev.filter((s) => s.id !== saveId));
      toast.success("Saved game deleted");
    } else {
      toast.error("Couldn't delete that game. Try again.");
    }
    setCompanionDeletingId(null);
  };

  const handleResumeCompanionSave = (saveId: string) => {
    window.location.assign(
      `/tcg-companion?resume=${encodeURIComponent(saveId)}`,
    );
  };

  if (loading) {
    return <AdminScreen title="Saved configs"><LoadingLines label="Loading your saved configs" /></AdminScreen>;
  }

  const types: ConfigType[] = [
    "game-night-setup", "party-setup", "smash-setup", "splatoon-setup", "kirby-setup", "stadium-setup",
    "kart-build", "item-set", "track-list", "player-preset", "ruleset",
  ];
  const card = (config: SavedConfig) => (
    <SetupCard key={config.id} config={config} onCopyLink={handleCopyLink} onDelete={handleDeleteConfig} copied={copied} />
  );

  return (
    <AdminScreen
      title="Saved configs"
      intro="Builds, item sets, game night setups and rules you saved from the randomizers, plus TCG Companion games you can pick back up."
    >
      {configs.length === 0 ? (
        <EmptyState
          variant="bordered"
          icon={<IconDeviceGamepad2 size={40} stroke={1.4} />}
          title="No saved setups yet"
          description="Randomize a kart build, an item set or a whole game night, then hit Save to keep it here."
          action={<Button variant="primary" onClick={() => router.push("/randomizers/mario-kart-8-deluxe")}>Open the randomizer</Button>}
        />
      ) : (
        types.map((type) => {
          const typeConfigs = configs.filter((c) => c.config_data?.type === type);
          if (typeConfigs.length === 0) return null;
          const gameGroups = new Map<string, SavedConfig[]>();
          for (const config of typeConfigs) {
            const slug = config.config_data?.gameSlug || config.randomizer_slug || "unknown";
            if (!gameGroups.has(slug)) gameGroups.set(slug, []);
            gameGroups.get(slug)!.push(config);
          }
          return (
            <AdminSection key={type} title={`${CONFIG_TYPE_LABELS[type]} (${typeConfigs.length})`}>
              {gameGroups.size === 1 ? (
                <div className="saved-builds-grid">{typeConfigs.map(card)}</div>
              ) : (
                Array.from(gameGroups.entries()).map(([slug, gameConfigs]) => (
                  <div key={slug} className="stuff-subgroup">
                    <h3 className="stuff-subgroup__title">{getGameName(slug)}</h3>
                    <div className="saved-builds-grid">{gameConfigs.map(card)}</div>
                  </div>
                ))
              )}
            </AdminSection>
          );
        })
      )}

      <AdminSection
        title={`TCG Companion games${companionSaves.length ? ` (${companionSaves.length})` : ""}`}
        actions={companionSaves.length > 0 ? <Button variant="secondary" size="small" onClick={() => router.push("/tcg-companion")}>Open the companion</Button> : undefined}
      >
        {companionSaves.length === 0 ? (
          <EmptyState
            variant="bordered"
            icon={<IconCards size={40} stroke={1.4} />}
            title="No saved games yet"
            description="Start a game in the TCG Companion and tap Save to pick it back up later."
            action={<Button variant="secondary" onClick={() => router.push("/tcg-companion")}>Open the companion</Button>}
          />
        ) : (
          <List divided className="stuff-list">
            {companionSaves.map((save) => {
              const formatLabel = formatByKey(save.gameSettings.format).label;
              const displayName = save.name?.trim() || defaultSaveName(formatLabel, save.updatedAt);
              const updated = new Date(save.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
              const isDeleting = companionDeletingId === save.id;
              const prizes = save.gameSettings.prizeCount;
              return (
                <StuffRow
                  key={save.id}
                  thumb={<span className="stuff-thumb stuff-thumb--icon" aria-hidden><IconCards size={24} stroke={1.6} /></span>}
                  title={displayName}
                  href={`/tcg-companion?resume=${encodeURIComponent(save.id)}`}
                  meta={`${formatLabel} · ${prizes} ${prizes === 1 ? "prize" : "prizes"} · ${save.sessionData.playerNames.p1} vs ${save.sessionData.playerNames.p2} · Saved ${updated}`}
                  badges={
                    <>
                      <Button size="small" variant="primary" onClick={() => handleResumeCompanionSave(save.id)} disabled={isDeleting} aria-label={`Resume ${displayName}`}>Resume</Button>
                      <AdminRowMenu label={`More for ${displayName}`} items={[{ label: "Delete", danger: true, onClick: () => void handleDeleteCompanionSave(save.id, displayName) }]} />
                    </>
                  }
                />
              );
            })}
          </List>
        )}
      </AdminSection>
    </AdminScreen>
  );
}
