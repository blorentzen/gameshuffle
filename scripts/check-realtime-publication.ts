/**
 * Diagnostic: list every table currently in the `supabase_realtime`
 * publication. If `session_picks_bans_rounds` and
 * `session_picks_bans_ballots` aren't in the list, the /live page's
 * realtime subscriptions will never fire — explaining "round opens
 * server-side but live view doesn't react."
 *
 * Usage:
 *   npx tsx scripts/check-realtime-publication.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Supabase service role can call `pg_publication_tables` via the
  // REST/PostgREST path. Easiest reliable way is via an RPC, but
  // there isn't one — so use the `rest` client's raw SQL via the
  // `postgres` schema, which is not exposed.
  //
  // Instead, list each table we care about and check whether it's
  // realtime-enabled by trying a small subscribe. But that's racy.
  //
  // Simplest reliable approach: call the meta endpoint. Falling back
  // to attempting a SELECT through PostgREST against a system view
  // doesn't work either.
  //
  // Cleanest path: use the `rpc` to call a helper. We don't have
  // one, so create-and-run a temporary function via the SQL endpoint.

  // Actually — Supabase exposes pg_publication_tables via the
  // pg_catalog schema; we can run a SELECT via the supabase-js v2
  // .rpc() call only if there's a registered function. There isn't.
  //
  // Pivot: use the `postgrest_admin` style — service role can hit
  // any view if we expose it. Since we can't run DDL from here, just
  // list every table we care about and print a manual instruction.

  const TABLES_TO_CHECK = [
    "gs_sessions",
    "session_participants",
    "session_events",
    "session_modules",
    "session_picks_bans_rounds",
    "session_picks_bans_ballots",
  ];

  console.log(
    "Cannot query pg_publication_tables directly through the JS client.\n" +
      "Please open the Supabase SQL editor and run:\n\n" +
      "  SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;\n\n" +
      "Then verify these tables are present:\n",
  );
  TABLES_TO_CHECK.forEach((t) => console.log(`  - ${t}`));
  console.log(
    "\nIf either picks_bans table is missing, run:\n" +
      "  supabase/realtime-publication-membership.sql\n" +
      "  supabase/realtime-ballots-publication-membership.sql\n" +
      "in the SQL editor.\n",
  );

  // Belt-and-suspenders: attempt to read each table as service role
  // to confirm it exists at all.
  console.log("Confirming table existence via service-role read:");
  for (const table of TABLES_TO_CHECK) {
    const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`  ✗ ${table}: ${error.message}`);
    } else {
      console.log(`  ✓ ${table}: exists`);
    }
  }
})();
