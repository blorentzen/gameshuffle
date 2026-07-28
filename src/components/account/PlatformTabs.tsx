"use client";

/**
 * PlatformTabs — client tab switcher for the Platform Admin section page
 * (`src/app/account/platform/page.tsx`). The page server-gates on staff/admin
 * before rendering this, so these tabs never reach a non-staff session.
 *
 * The tab catalog + default live in `src/lib/account/nav.ts` — add new
 * platform tabs there and add their render block below.
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlatformHealthTab } from "@/components/account/PlatformHealthTab";
import { PlatformEventsTab } from "@/components/account/PlatformEventsTab";
import { PlatformVariablesTab } from "@/components/account/PlatformVariablesTab";
import { PlatformDefaultCommandsTab } from "@/components/account/PlatformDefaultCommandsTab";
import { PlatformComplianceTab } from "@/components/account/PlatformComplianceTab";
import { PlatformEngagementTab } from "@/components/account/PlatformEngagementTab";
import { PlatformEconomyTab } from "@/components/account/PlatformEconomyTab";
import { PlatformEconomySnapshotTab } from "@/components/account/PlatformEconomySnapshotTab";
import { PlatformStaffTab } from "@/components/account/PlatformStaffTab";
import { PlatformModerationTab } from "@/components/account/PlatformModerationTab";
import { PlatformShopTab } from "@/components/account/PlatformShopTab";

export function PlatformTabs() {
  return (
    <Suspense>
      <PlatformTabsContent />
    </Suspense>
  );
}

function PlatformTabsContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "platform-health";

  return (
    <>
      {activeTab === "platform-health" && <PlatformHealthTab />}
      {activeTab === "platform-events" && <PlatformEventsTab />}
      {activeTab === "platform-variables" && <PlatformVariablesTab />}
      {activeTab === "platform-default-commands" && <PlatformDefaultCommandsTab />}
      {activeTab === "platform-compliance" && <PlatformComplianceTab />}
      {activeTab === "platform-engagement" && <PlatformEngagementTab />}
      {activeTab === "platform-economy" && <PlatformEconomyTab />}
      {activeTab === "platform-snapshot" && <PlatformEconomySnapshotTab />}
      {activeTab === "platform-staff" && <PlatformStaffTab />}
      {activeTab === "platform-moderation" && <PlatformModerationTab />}
      {activeTab === "platform-shop" && <PlatformShopTab />}
    </>
  );
}
