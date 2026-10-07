import { createClient } from "@/lib/supabase/client";
import type { SavedConfigData, ConfigType } from "@/data/config-types";

/** The saved row, as /api/configs returns it. */
export interface SavedConfigRow { id: string; share_token: string | null; config_name: string; randomizer_slug: string; config_data: SavedConfigData }

/**
 * Saves a setup through /api/configs, which checks the plan limit on the
 * server (free 5, GS Pro unlimited). `userId` stays in the signature for the
 * callers; the server uses the signed-in account.
 */
export async function saveConfig(
  _userId: string,
  randomizerSlug: string,
  configName: string,
  configData: SavedConfigData
) {
  void _userId;
  const res = await fetch("/api/configs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ randomizerSlug, configName, configData }),
  }).catch(() => null);
  const j = (await res?.json().catch(() => null)) as { data?: SavedConfigRow; error?: string } | null;
  if (!res?.ok || !j?.data) return { error: j?.error ?? "Couldn't save that setup. Try again." };
  return { data: j.data };
}

/** Overwrite a setup the person loaded (its name and data); the share link stays the same. */
export async function updateConfig(
  userId: string,
  configId: string,
  configName: string,
  configData: SavedConfigData
) {
  const { data, error } = await createClient()
    .from("saved_configs")
    .update({ config_name: configName, config_data: configData })
    .eq("id", configId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data };
}

export async function getUserConfigs(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("saved_configs")
    .select("id, randomizer_slug, config_name, config_data, share_token, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data: data || [] };
}

export async function getUserConfigsByType(userId: string, type: ConfigType) {
  const { data } = await getUserConfigs(userId);
  return data.filter(
    (c) => (c.config_data as SavedConfigData)?.type === type
  );
}

export async function deleteConfig(configId: string, userId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("saved_configs")
    .delete()
    .eq("id", configId)
    .eq("user_id", userId);

  return { error: error?.message };
}

export async function getSharedConfig(shareToken: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("saved_configs")
    .select("*")
    .eq("share_token", shareToken)
    .single();

  if (error) return { error: error.message };
  return { data };
}

