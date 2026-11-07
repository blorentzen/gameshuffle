/**
 * Server wrapper that mounts <ImpersonationControl /> only for staff
 * users. Resolves the user + role on the server, reads the current
 * impersonation cookie state, and emits the client component pre-seeded
 * with that state so first paint matches server state.
 *
 * Non-staff users get nothing — no client bundle waste, no leaked UI.
 */

import { realStaffRole } from "@/lib/capabilities/realStaffRole";
import { getStaffImpersonationState } from "@/lib/capabilities/staff-impersonation";
import { personaPreview } from "@/lib/preview/server";
import { DEV_PERSONA_ACCOUNTS, devAccountsOn } from "@/lib/preview/devAccounts";
import { ImpersonationControl, type ImpersonationOption } from "./ImpersonationControl";

export async function ImpersonationControlMount() {
  const role = await realStaffRole();
  if (!role) return null;

  const state = await getStaffImpersonationState();
  const persona = await personaPreview();
  let currentOption: ImpersonationOption = "default";
  if (state.viewingAsUnauth) currentOption = "unauth";
  else if (persona) currentOption = "persona";
  else if (state.viewingAsTier === "pro") currentOption = "pro";
  else if (state.viewingAsTier === "free") currentOption = "free";

  return <ImpersonationControl currentOption={currentOption} persona={persona} devAccounts={devAccountsOn() ? DEV_PERSONA_ACCOUNTS : null} />;
}
