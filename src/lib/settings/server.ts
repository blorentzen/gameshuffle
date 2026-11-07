import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/** The account's public username, for "your profile" links in Settings (null while the profile is private). */
export async function usernameOf(userId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("users").select("username, is_public").eq("id", userId).maybeSingle();
  const row = data as { username: string | null; is_public: boolean | null } | null;
  return row?.username && row.is_public !== false ? row.username : null;
}
