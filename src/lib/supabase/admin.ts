/**
 * Shared Supabase admin (service-role) client factory.
 *
 * Used by server-only code that needs to bypass RLS — webhooks, cron jobs,
 * privileged API routes (DSAR, account deletion, sign-in unlink, etc).
 *
 * Never import this from client components; the service role key bypasses
 * row-level security and grants full DB access.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Supabase admin credentials missing (URL or SERVICE_ROLE_KEY)");
  }
  return createSupabaseClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
