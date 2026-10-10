"use client";

/**
 * Account section (/account): Profile · Theming · Settings · Plans & billing,
 * each a view with tabs (src/lib/account/nav.ts). The screens live in
 * src/components/account/{profile,theming,settings}/; ProfileStore loads the
 * profile once and autosaves it for all of them. Old `?tab=` ids still work,
 * and tabs that belong to another section are sent there by SectionTabs.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SectionTabs, type ScreenMap } from "@/components/account/SectionTabs";
import { ProfileStoreProvider, useProfileStore } from "@/components/account/profile/ProfileStore";
import { ProfileAboutScreen, ProfileFriendsScreen, ProfileGamesScreen, ProfileHandlesScreen } from "@/components/account/profile/ProfileScreens";
import { ThemingProfilePageScreen, ThemingThemeScreen, ThemingWalkupScreen } from "@/components/account/theming/ThemingScreens";
import { PlansScreen, SettingsGeneralScreen, SettingsNotificationsScreen, SettingsPrivacyScreen, SettingsSecurityScreen } from "@/components/account/settings/SettingsScreens";
import { TrialOfferBanner } from "@/components/account/TrialOfferBanner";

const SCREENS: ScreenMap = {
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
};

export default function AccountPage() {
  return (
    <ProfileStoreProvider>
      <Suspense>
        <TrialBanner />
      </Suspense>
      <SectionTabs route="/account" screens={SCREENS} />
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
