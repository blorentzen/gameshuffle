import { redirect } from "next/navigation";
import { youTabFor } from "@/lib/games/youForward";
import { CompetitiveTabs } from "@/components/account/competitive/CompetitiveTabs";
import { accountPageData } from "@/lib/account/pageData";
import { competitiveSummary } from "@/lib/account/competitive";
import "@/styles/account-home.css";

/** Account ▸ Competitive (menus and account picks 2026-11-05): see CompetitiveTabs. */
export const dynamic = "force-dynamic";

export default async function CompetitivePage() {
  const d = await accountPageData("/account/competitive");
  // Your Mario Kart things live in the game's space now (journeys picks 2026-11-06, step 6).
  const to = await youTabFor(d.userId, "competitive").catch(() => null);
  if (to) redirect(to);
  return <CompetitiveTabs summary={await competitiveSummary(d.userId)} />;
}
