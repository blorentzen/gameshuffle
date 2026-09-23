/**
 * Cookieless anon Supabase client, for public content rendered without a viewer.
 *
 * The cookie-bound server client opts a route into dynamic rendering, which is
 * fatal for anything statically generated: `/sitemap.xml` sets `revalidate`, so
 * every cookie-reading query in it threw and the URLs were silently dropped.
 *
 * This keeps anon RLS in force, so a query returns exactly what a crawler (or
 * any signed-out visitor) is allowed to see. Use `createServiceClient()` when
 * RLS genuinely has to be bypassed; use this when it must not be.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase public credentials missing (URL or ANON_KEY)");
  return createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
