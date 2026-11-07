import type { Metadata } from "next";
import { hostViewer } from "@/lib/host/server";
import { HostHeader } from "@/components/host/HostParts";
import { HostCommunities } from "@/components/host/HostScreen";

export const metadata: Metadata = { title: "Communities · Host", robots: { index: false, follow: false } };

/** /host/communities: the groups and crews you run (the screen Account ▸ Your events had). */
export default async function HostCommunitiesPage() {
  await hostViewer("/host/communities");
  return (
    <div className="hub-page studio-page host-page">
      <HostHeader />
      <HostCommunities />
    </div>
  );
}
