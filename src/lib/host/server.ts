import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

/** Every Host page: the signed-in account (else sign in and come back) and its profile time zone. */
export async function hostViewer(path: string): Promise<{ userId: string; tz: string | null }> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(path)}`);
  const { data } = await createServiceClient().from("users").select("timezone").eq("id", user.id).maybeSingle();
  return { userId: user.id, tz: ((data as { timezone?: string | null } | null)?.timezone) ?? null };
}
