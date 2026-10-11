/**
 * /staff/economy now lives in Platform admin ▸ Token economy (2026-10-09):
 * Overview, Streamers (allowance use, communities, busiest chats), History
 * (daily snapshots, events by day, new-community bonuses), Levers and Rules.
 * Staff are sent there; anyone else gets a 404, as before.
 */

import { notFound, redirect } from "next/navigation";
import { isStaffRequest } from "@/lib/auth/raw";

export const dynamic = "force-dynamic";

export default async function EconomyDashboardPage() {
  if (!(await isStaffRequest())) notFound();
  redirect("/account/platform?tab=platform-snapshot");
}
