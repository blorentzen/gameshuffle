import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/subscription";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AdminGuard =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

/** Staff/admin gate for platform shop-card management. Mirrors the
 *  /api/admin/staff pattern: authed + role in (staff, admin). */
export async function requireStaff(supabase: Supabase): Promise<AdminGuard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isStaffRole((data as { role: string | null } | null)?.role ?? null)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, userId: user.id };
}
