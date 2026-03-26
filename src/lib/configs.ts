import { createClient } from "@/lib/supabase/client";
import type { SavedConfigData, ConfigType } from "@/data/config-types";

const FREE_CONFIG_LIMIT = 5;

export async function saveConfig(
  userId: string,
  randomizerSlug: string,
  configName: string,
  configData: SavedConfigData
) {
  const supabase = createClient();

  // Check free tier limit
  const { count } = await supabase
    .from("saved_configs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count || 0) >= FREE_CONFIG_LIMIT) {
    return {
      error: `Free accounts can save up to ${FREE_CONFIG_LIMIT} items. Upgrade to Pro for unlimited.`,
    };
  }

  const shareToken = generateShareToken();

  const { data, error } = await supabase
    .from("saved_configs")
    .insert({
      user_id: userId,
      randomizer_slug: randomizerSlug,
      config_name: configName,
      config_data: configData,
      share_token: shareToken,
    })
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

function generateShareToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}
