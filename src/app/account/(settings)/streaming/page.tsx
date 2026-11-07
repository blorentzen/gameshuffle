import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { StreamingTabs } from "@/components/account/streaming/StreamingTabs";
import { previewPro } from "@/lib/preview/server";
import { streamSetup } from "@/lib/streaming/setup";
import { STREAMING_TAB_TO_STUDIO } from "@/lib/studio/tools";

/**
 * Streaming section page (/account/streaming): Stream Setup and Community &
 * Chat in one place. Resolves GS Pro server-side (free accounts get Get
 * started and the Discord bot) and the profile timezone the schedule uses.
 * The shared shell and sidebar live in src/app/account/layout.tsx.
 */
export default async function StreamingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/account/streaming");

  const { data } = await supabase
    .from("users")
    .select("role, subscription_tier, circuit_tier, circuit_status, timezone")
    .eq("id", user.id)
    .maybeSingle();
  const isPro = effectiveTier({
    tier: normalizeTier(data?.subscription_tier as string | null),
    role: (data?.role as string | null) ?? null,
    circuitTier: (data?.circuit_tier as string | null) ?? null,
    circuitStatus: (data?.circuit_status as string | null) ?? null,
  }) === "pro";

  // A staff persona preview (src/lib/preview) shows the plan it previews.
  const pro = await previewPro(isPro);
  // GS Pro streamers run everything from the Studio now (journeys picks 2026-11-06, 10A): each old tab has a page
  // there, other parameters kept (OAuth returns). Free accounts keep Get started here.
  if (pro) {
    const sp = await searchParams;
    const tab = typeof sp.tab === "string" ? sp.tab : "";
    const to = !tab || tab === "get-started" ? "/hub" : STREAMING_TAB_TO_STUDIO[tab];
    if (to) {
      const rest = new URLSearchParams();
      for (const [k, v] of Object.entries(sp)) if (k !== "tab" && typeof v === "string") rest.set(k, v);
      redirect(rest.size ? `${to}?${rest.toString()}` : to);
    }
  }
  // GS Pro: the setup checklist stays on top until every step is done (menus and account picks 2026-11-05, 4A).
  const setup = pro ? await streamSetup(user.id).catch(() => null) : null;
  return <StreamingTabs isPro={pro} setup={setup} profileTimezone={(data?.timezone as string | null) ?? null} />;
}
