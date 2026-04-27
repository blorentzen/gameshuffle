/**
 * Server wrapper that mounts <ImpersonationControl /> only for staff
 * users. Resolves the user + role on the server, reads the current
 * impersonation cookie state, and emits the client component pre-seeded
 * with that state so first paint matches server state.
 *
 * Non-staff users get nothing — no client bundle waste, no leaked UI.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStaffImpersonationState } from "@/lib/capabilities/staff-impersonation";
import { ImpersonationControl, type ImpersonationOption } from "./ImpersonationControl";

export async function ImpersonationControlMount() {
  const supabase = await createClient();
  const {
    data: { user: rawUser },
  } = await supabase.auth.getUser();
  if (!rawUser) return null;

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", rawUser.id)
    .maybeSingle();
  const role = (profile?.role as string | null) ?? null;
  if (role !== "staff" && role !== "admin") return null;

  const state = await getStaffImpersonationState();
  let currentOption: ImpersonationOption = "default";
  if (state.viewingAsUnauth) currentOption = "unauth";
  else if (state.viewingAsTier === "pro") currentOption = "pro";
  else if (state.viewingAsTier === "free") currentOption = "free";

  return <ImpersonationControl currentOption={currentOption} />;
}
