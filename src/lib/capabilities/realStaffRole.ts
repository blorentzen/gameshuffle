import "server-only";

/**
 * The signed-in account's real role (staff or admin), read once per request. The root layout's three
 * impersonation pieces each used to call Auth and read `users.role` on every page render (3 + 3 calls
 * for every signed-in page view); React's `cache` makes it one of each. Null for everyone else.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const realStaffRole = cache(async (): Promise<"staff" | "admin" | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  const role = (data?.role as string | null) ?? null;
  return role === "staff" || role === "admin" ? role : null;
});
