/**
 * Supabase admin client for Twitch integration server routes.
 *
 * Used by:
 *  - OAuth callback (insert/update twitch_connections)
 *  - Webhook handler (insert sessions, dedupe rows, etc — bypass RLS)
 *  - EventSub manager (insert/update twitch_eventsub_subscriptions)
 *  - Disconnect endpoint (delete the connection row + cascade)
 *
 * Never expose to the browser — service role key bypasses RLS.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createTwitchAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Supabase admin credentials missing (URL or SERVICE_ROLE_KEY)");
  }
  return createSupabaseClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
