import "server-only";

/** Who's looking at a team series page: signed in or not, staff or not. */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import type { User } from "@supabase/supabase-js";

export interface SeriesViewer { user: User | null; userId: string | null; staff: boolean; name: string | null }

export async function seriesViewer(): Promise<SeriesViewer> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, userId: null, staff: false, name: null };
  const { data } = await createServiceClient().from("users").select("role, display_name, username").eq("id", user.id).maybeSingle();
  const row = data as { role: string | null; display_name: string | null; username: string | null } | null;
  return { user, userId: user.id, staff: isStaffRole(row?.role ?? null), name: row?.display_name || row?.username || null };
}
