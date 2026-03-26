"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { deleteConfig } from "@/lib/configs";
import { CONFIG_TYPE_LABELS, type ConfigType } from "@/data/config-types";
import { SetupCard } from "@/components/account/SetupCard";

interface SavedConfig {
  id: string;
  randomizer_slug: string;
  config_name: string;
  config_data: Record<string, any>;
  share_token: string | null;
  is_public: boolean;
  created_at: string;
}

export default function ConfigsPage() {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadConfigs();
  }, [user]);

  const loadConfigs = async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("saved_configs")
      .select(
        "id, randomizer_slug, config_name, config_data, share_token, is_public, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setConfigs((data as SavedConfig[]) || []);
    setLoading(false);
  };

  const handleDelete = async (configId: string) => {
    if (!user) return;
    const { error } = await deleteConfig(configId, user.id);
    if (!error) {
      setConfigs(configs.filter((c) => c.id !== configId));
    }
  };

  const handleCopyLink = (shareToken: string) => {
    const url = `${window.location.origin}/s/${shareToken}`;
    navigator.clipboard.writeText(url);
    setCopied(shareToken);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="account-card">
        <p>Loading...</p>
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <div className="account-card">
        <h2>Saved Configs</h2>
        <p style={{ color: "#808080" }}>
          No saved items yet. Randomize a kart build and hit &quot;Save
          Build&quot; to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      {(["game-night-setup", "kart-build", "item-set", "track-list", "player-preset", "ruleset"] as ConfigType[]).map(
        (type) => {
          const typeConfigs = configs.filter(
            (c) => c.config_data?.type === type
          );
          if (typeConfigs.length === 0) return null;
          return (
            <div key={type} className="account-card">
              <h2>{CONFIG_TYPE_LABELS[type]}</h2>
              <div className="saved-builds-grid">
                {typeConfigs.map((config) => (
                  <SetupCard
                    key={config.id}
                    config={config}
                    onCopyLink={handleCopyLink}
                    onDelete={handleDelete}
                    copied={copied}
                  />
                ))}
              </div>
            </div>
          );
        }
      )}
    </>
  );
}
