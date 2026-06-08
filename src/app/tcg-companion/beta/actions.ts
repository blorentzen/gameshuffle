"use server";

/**
 * Server action behind the beta passcode form.
 *
 * The submitted passphrase reaches the server only as a JSON body
 * on this server-action POST. The expected value lives in
 * `COMPANION_BETA_PASSCODE` and is compared in `checkBetaPasscode`
 * — it never appears in any rendered HTML, network response, or
 * client-side bundle.
 *
 * When beta mode is off, this action returns `{ ok: false }`
 * regardless of input — the route hosting the form is itself
 * server-gated to 404 in that case, but defending here too keeps
 * the action self-contained.
 */

import { checkBetaPasscode, isBetaModeOn } from "@/lib/companion/beta";

export interface VerifyBetaResult {
  ok: boolean;
  reason?: string;
}

export async function verifyBetaPasscodeAction(
  passcode: string,
): Promise<VerifyBetaResult> {
  if (!isBetaModeOn()) return { ok: false, reason: "beta_off" };
  if (checkBetaPasscode(passcode)) return { ok: true };
  return { ok: false, reason: "wrong_passcode" };
}
