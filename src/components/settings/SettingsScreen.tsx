"use client";

/**
 * One Settings page's body (journeys picks 2026-11-06, 8A): the Account screens it already had, by item, with CDS
 * Tabs (`?tab=`) where an item has several (Profile, Purchases). ProfileStore loads the profile once and autosaves it
 * for every profile screen, as in Account.
 */

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@empac/cascadeds";
import { IconChevronLeft } from "@tabler/icons-react";
import { ProfileStoreProvider, useProfileStore } from "@/components/account/profile/ProfileStore";
import { ProfileAboutScreen, ProfileFriendsScreen, ProfileGamesScreen, ProfileHandlesScreen } from "@/components/account/profile/ProfileScreens";
import { ThemingProfilePageScreen, ThemingThemeScreen, ThemingWalkupScreen } from "@/components/account/theming/ThemingScreens";
import { PlansScreen, SettingsGeneralScreen, SettingsNotificationsScreen, SettingsPrivacyScreen, SettingsSecurityScreen } from "@/components/account/settings/SettingsScreens";
import { TrialOfferBanner } from "@/components/account/TrialOfferBanner";
import { InviteFriendsScreen } from "@/components/account/invite/InviteFriendsScreen";
import { SupportScreen } from "@/components/account/support/SupportScreen";
import { GifsTab } from "@/components/account/stuff/GifsTab";
import { TicketsTab } from "@/components/account/TicketsTab";
import { ShopOrdersTab } from "@/components/account/ShopOrdersTab";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { settingsItem } from "@/lib/settings/items";

type Screens = Record<string, () => ReactNode>;

const PROFILE: Screens = {
  about: () => <ProfileAboutScreen />,
  games: () => <ProfileGamesScreen />,
  gamertags: () => <ProfileHandlesScreen />,
  friends: () => <ProfileFriendsScreen />,
  theme: () => <ThemingThemeScreen />,
  page: () => <ThemingProfilePageScreen />,
  walkup: () => <ThemingWalkupScreen />,
  gifs: () => <GifsTab />,
};

const SINGLE: Screens = {
  account: () => <SettingsGeneralScreen />,
  security: () => <SettingsSecurityScreen />,
  notifications: () => <SettingsNotificationsScreen />,
  privacy: () => <SettingsPrivacyScreen />,
  invite: () => <InviteFriendsScreen />,
  plans: () => <PlansScreen />,
  support: () => <SupportScreen />,
};

export function SettingsScreen(props: { item: string; timeZone: string | null; showShopOrders: boolean; username: string | null; index?: boolean }) {
  return (
    <ProfileStoreProvider>
      <Suspense>
        <Body {...props} />
      </Suspense>
    </ProfileStoreProvider>
  );
}

function Body({ item, timeZone, showShopOrders, username, index = false }: { item: string; timeZone: string | null; showShopOrders: boolean; username: string | null; index?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const def = settingsItem(item);
  const tabScreens: Screens | null = item === "profile" ? PROFILE
    : item === "purchases" ? { tickets: () => <TicketsTab timeZone={timeZone} />, ...(showShopOrders ? { orders: () => <ShopOrdersTab /> } : {}) }
    : null;
  const tabs = (def?.tabs ?? []).filter((t) => tabScreens?.[t.id]);
  const asked = params.get("tab");
  const active = tabs.find((t) => t.id === asked)?.id ?? tabs[0]?.id ?? null;
  const screen = tabScreens && active ? tabScreens[active]() : SINGLE[item]?.() ?? null;

  return (
    <div className={`settings-pane${index ? " settings-pane--index" : ""}`}>
      {/* Phones: the list is its own page, so each item leads back to it. */}
      <Link href="/settings" className="settings-pane__back"><IconChevronLeft size={18} aria-hidden="true" />Settings</Link>
      {/* The trial offer once, where Settings opens, not above every setting (and never above Support or Plans). */}
      {(index || item === "general") && <TrialBanner />}
      {item === "profile" && username && (
        <p className="settings-pane__note">Your picture, banner and colors can also be changed on <ArrowLink href={`/u/${username}`}>your profile</ArrowLink>, where you see them as you go.</p>
      )}
      {tabs.length > 1 ? (
        <div className="platform-view">
          <Tabs
            variant="underline"
            activeTab={active ?? undefined}
            onChange={(id) => router.replace(`/settings/${item}?tab=${id}`, { scroll: false })}
            tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: t.id === active ? <div className="platform-view__body">{screen}</div> : null }))}
          />
        </div>
      ) : screen}
    </div>
  );
}

/** The one-time trial offer, as in Account (not on Plans itself). */
function TrialBanner() {
  const router = useRouter();
  const { extras } = useProfileStore();
  return <TrialOfferBanner isEligible={extras.trialEligible} onLearnMore={() => router.push("/settings/plans")} />;
}
