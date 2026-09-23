import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

/**
 * Two-factor authentication.
 *
 * Factors live in Supabase Auth, which is what makes this trustworthy: a
 * verified challenge raises the session's **assurance level** to `aal2` inside
 * the JWT, so enforcement is a property of the session rather than something
 * our UI can be talked out of. We add the two pieces Supabase doesn't:
 * single-use recovery codes, and the policy for who must use 2FA.
 *
 * Factor types, in the order we recommend them:
 *   totp   authenticator app — free, offline, no carrier in the loop
 *   phone  SMS code — needs Twilio configured in Supabase Auth settings
 *   (WebAuthn/passkeys are supported by the client and are the natural next
 *    step once the project has a configured relying party.)
 *
 * Email is deliberately NOT offered as a second factor: it's the account's
 * recovery channel, so a compromised inbox would defeat both steps at once.
 */

export type MfaPolicy = "required" | "recommended";
export const RECOVERY_CODE_COUNT = 10;

export interface MfaFactor {
  id: string;
  type: "totp" | "phone" | "webauthn";
  friendlyName: string | null;
  status: "verified" | "unverified";
  createdAt: string;
}

export interface MfaState {
  factors: MfaFactor[];
  /** A verified factor exists → the account is protected. */
  enabled: boolean;
  /** Current session assurance: aal1 (password only) or aal2 (second factor done). */
  currentLevel: "aal1" | "aal2" | null;
  /** What this session would need to reach after enrolling. */
  nextLevel: "aal1" | "aal2" | null;
  policy: MfaPolicy;
  recoveryCodesRemaining: number;
  /** Phone factors need Twilio wired into Supabase Auth. */
  phoneAvailable: boolean;
}

/** Staff and admins must use 2FA; everyone else is strongly encouraged. */
export function policyForRole(role: string | null | undefined): MfaPolicy {
  return isStaffRole(role ?? null) ? "required" : "recommended";
}

export async function getMfaState(): Promise<MfaState | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: factorData }, { data: aal }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const all = [...(factorData?.totp ?? []), ...(factorData?.phone ?? [])] as { id: string; factor_type: string; friendly_name?: string | null; status: string; created_at: string }[];
  const factors: MfaFactor[] = all.map((f) => ({
    id: f.id, type: (f.factor_type as MfaFactor["type"]) ?? "totp", friendlyName: f.friendly_name ?? null,
    status: f.status === "verified" ? "verified" : "unverified", createdAt: f.created_at,
  }));

  const svc = createServiceClient();
  const [{ data: profile }, { count }] = await Promise.all([
    svc.from("users").select("role").eq("id", user.id).maybeSingle(),
    svc.from("gs_mfa_recovery_codes").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("used_at", null),
  ]);

  return {
    factors,
    enabled: factors.some((f) => f.status === "verified"),
    currentLevel: (aal?.currentLevel as "aal1" | "aal2" | null) ?? null,
    nextLevel: (aal?.nextLevel as "aal1" | "aal2" | null) ?? null,
    policy: policyForRole((profile as { role: string | null } | null)?.role),
    recoveryCodesRemaining: count ?? 0,
    phoneAvailable: false, // flipped on once Supabase Auth has an SMS provider (see mfa-m1.sql notes)
  };
}

// ─── recovery codes ──────────────────────────────────────────────────────────

const hashCode = (code: string, userId: string) => createHash("sha256").update(`${code}:${userId}`).digest("hex");

/** Human-friendly, unambiguous alphabet (no O/0/I/1). */
function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  const out = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

/**
 * Replace the user's recovery codes and return the plaintext ONCE. Only the
 * hashes are stored, so a database read can't be turned into account access.
 */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const svc = createServiceClient();
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newCode);
  await svc.from("gs_mfa_recovery_codes").delete().eq("user_id", userId);
  const { error } = await svc.from("gs_mfa_recovery_codes").insert(codes.map((c) => ({ user_id: userId, code_hash: hashCode(c, userId) })));
  if (error) throw new Error(error.message);
  return codes;
}

/** Consume one code. Single use: the row is marked immediately. */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  const withDash = normalized.includes("-") ? normalized : `${normalized.slice(0, 5)}-${normalized.slice(5, 10)}`;
  const svc = createServiceClient();
  const { data } = await svc.from("gs_mfa_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId).eq("code_hash", hashCode(withDash, userId)).is("used_at", null)
    .select("id");
  return (data ?? []).length > 0;
}

export async function countRecoveryCodes(userId: string): Promise<number> {
  const { count } = await createServiceClient().from("gs_mfa_recovery_codes").select("id", { count: "exact", head: true }).eq("user_id", userId).is("used_at", null);
  return count ?? 0;
}

/** Called after the last factor is removed: stale codes must not linger. */
export async function clearRecoveryCodes(userId: string): Promise<void> {
  await createServiceClient().from("gs_mfa_recovery_codes").delete().eq("user_id", userId);
}
