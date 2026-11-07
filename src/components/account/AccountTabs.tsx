"use client";

/**
 * The You section (/account): Your home · Profile (with the theming tabs and GIFs) · Settings · Plans & billing ·
 * Purchases · Support GameShuffle · Invite friends, each a view with tabs (src/lib/account/nav.ts). The screens live in
 * src/components/account/{home,profile,theming,settings}/; ProfileStore loads the profile once and autosaves it for
 * all of them. Old `?tab=` ids still work, and tabs that belong to another section are sent there by SectionTabs.
 * The page (src/app/account/page.tsx) works out the server-side bits: Shop orders and the profile timezone.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SectionTabs, type ScreenMap } from "@/components/account/SectionTabs";
import { ProfileStoreProvider, useProfileStore } from "@/components/account/profile/ProfileStore";
import { ProfileAboutScreen, ProfileFriendsScreen, ProfileGamesScreen, ProfileHandlesScreen } from "@/components/account/profile/ProfileScreens";
import { ThemingProfilePageScreen, ThemingThemeScreen, ThemingWalkupScreen } from "@/components/account/theming/ThemingScreens";
import { PlansScreen, SettingsGeneralScreen, SettingsNotificationsScreen, SettingsPrivacyScreen, SettingsSecurityScreen } from "@/components/account/settings/SettingsScreens";
import { TrialOfferBanner } from "@/components/account/TrialOfferBanner";
import { InviteFriendsScreen } from "@/components/account/invite/InviteFriendsScreen";
import { SupportScreen } from "@/components/account/support/SupportScreen";
import { AccountHomeScreen } from "@/components/account/home/AccountHomeScreen";
import { GifsTab } from "@/components/account/stuff/GifsTab";
import { TicketsTab } from "@/components/account/TicketsTab";
import { ShopOrdersTab } from "@/components/account/ShopOrdersTab";

const SCREENS: ScreenMap = {
  home: () => <AccountHomeScreen />,
  gifs: () => <GifsTab />,
  profile: () => <ProfileAboutScreen />,
  games: () => <ProfileGamesScreen />,
  gamertags: () => <ProfileHandlesScreen />,
  friends: () => <ProfileFriendsScreen />,
  theme: () => <ThemingThemeScreen />,
  "profile-page": () => <ThemingProfilePageScreen />,
  walkup: () => <ThemingWalkupScreen />,
  settings: () => <SettingsGeneralScreen />,
  security: () => <SettingsSecurityScreen />,
  notifications: () => <SettingsNotificationsScreen />,
  privacy: () => <SettingsPrivacyScreen />,
  plans: () => <PlansScreen />,
  support: () => <SupportScreen />,
  invite: () => <InviteFriendsScreen />,
};

export function AccountTabs({ showShopOrders, timeZone }: { showShopOrders: boolean; timeZone: string | null }) {
  const screens: ScreenMap = {
    ...SCREENS,
    tickets: () => <TicketsTab timeZone={timeZone} />,
    // Shop orders: hidden while the shop is, except for staff and anyone with an order.
    ...(showShopOrders ? { orders: () => <ShopOrdersTab /> } : {}),
  };
  return (
    <ProfileStoreProvider>
      <Suspense>
        <TrialBanner />
      </Suspense>
      <SectionTabs route="/account" screens={screens} />
    </ProfileStoreProvider>
  );
}

/** The one-time trial offer, everywhere in Account except Plans itself. */
function TrialBanner() {
  const router = useRouter();
  const tab = useSearchParams().get("tab");
  const { extras } = useProfileStore();
  if (tab === "plans") return null;
  return <TrialOfferBanner isEligible={extras.trialEligible} onLearnMore={() => router.push("/account?tab=plans")} />;
}
