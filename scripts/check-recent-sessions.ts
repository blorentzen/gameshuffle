import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

(async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data } = await admin
    .from("gs_sessions")
    .select("id, slug, status, activated_at, ended_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);
  console.log(JSON.stringify(data, null, 2));
})();
