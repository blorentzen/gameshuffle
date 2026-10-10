"use client";

/**
 * Account ▸ Theming: Theme · Profile page · Walk-up song. How your public
 * surfaces look (profile, live page, overlay). Your own dashboard's light or
 * dark setting is in Settings ▸ General. Brand themes, skins and custom CSS
 * are GS Pro; the accent color, status, links and layout are free.
 */

import Link from "next/link";
import { Button, ColorPicker, Select } from "@empac/cascadeds";
import { AdminField, AdminScreen, AdminSection, SaveStatus } from "@/components/account/admin/AdminKit";
import { useProfileStore } from "@/components/account/profile/ProfileStore";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { ProOnly } from "@/components/billing/ProOnly";
import { ThemeProPrompt } from "@/components/account/ThemeProPrompt";
import { ThemeTab } from "@/components/account/ThemeTab";
import { ProfileSkinEditor } from "@/components/account/ProfileSkinEditor";
import { ProfileCssEditor } from "@/components/account/ProfileCssEditor";
import { PersonalSurfacesBar } from "@/components/account/PersonalSurfacesBar";
import { ProfileStatusEditor } from "@/components/account/ProfileStatusEditor";
import { ProfileLinksEditor } from "@/components/account/ProfileLinksEditor";
import { ProfileLayoutEditor } from "@/components/account/ProfileLayoutEditor";
import { AnthemSettings } from "@/components/account/AnthemSettings";
import { PROFILE_ACCENTS } from "@/lib/profile/accents";

/** CDS Select hides its label for "", so "none" stands in for an empty choice. */
const NONE = "none";

export function ThemingThemeScreen() {
  const { loading, fields, set, extras, status } = useProfileStore();
  return (
    <AdminScreen
      title="Theme"
      intro={<>How your profile, live page and overlay look. GameShuffle&apos;s own screens keep your light or dark setting in <Link href="/account?tab=settings">Settings</Link>.</>}
      actions={extras.persoAvailable ? <SaveStatus status={status} /> : undefined}
    >
      {loading ? <LoadingLines label="Loading" /> : (
        <>
          <PersonalSurfacesBar username={fields.username || null} isStreamer={extras.hasTwitchConnection} />
          {/* One place for color (Britton, 2026-10-10): a free account picks
              one color; GS Pro picks a brand theme instead, which takes over
              from that color everywhere (owner-theme.ts skips the accent once
              a brand theme is on). */}
          <AdminSection title="Colors" intro="The color of your links, buttons and highlights on your profile, live page and overlay.">
            <ProOnly
              fallback={
                <>
                  {extras.persoAvailable && (
                    <div className="admin-field">
                      <span className="admin-field__label" id="your-color-label">Your color</span>
                      <div className="theme-your-color" aria-labelledby="your-color-label">
                        <ColorPicker
                          variant="inline"
                          size="small"
                          aria-label="Your color"
                          presets={PROFILE_ACCENTS.map((a) => ({ value: a.color, label: a.label }))}
                          value={PROFILE_ACCENTS.find((a) => a.key === fields.accent)?.color ?? ""}
                          onChange={(hex) => {
                            const pick = PROFILE_ACCENTS.find((a) => a.color.toLowerCase() === hex.toLowerCase());
                            if (pick) set({ accent: pick.key });
                          }}
                        />
                        {fields.accent && <Button variant="ghost" size="small" onClick={() => set({ accent: "" })}>Use GameShuffle blue</Button>}
                      </div>
                      <p className="admin-field__help">Free. With GS Pro you can pick a full brand theme instead.</p>
                    </div>
                  )}
                  <ThemeProPrompt />
                </>
              }
            >
              <ThemeTab bare />
            </ProOnly>
          </AdminSection>
        </>
      )}
      <ProOnly fallback={null}>
        <ProfileSkinEditor />
      </ProOnly>
      <ProOnly fallback={null}>
        <ProfileCssEditor />
      </ProOnly>
    </AdminScreen>
  );
}

export function ThemingProfilePageScreen() {
  const { loading, fields, set, extras, status } = useProfileStore();
  return (
    <AdminScreen
      title="Profile page"
      intro="What sits at the top of your profile, the links you show and how the page is laid out."
      actions={extras.persoAvailable ? <SaveStatus status={status} /> : undefined}
    >
      <ProfileStatusEditor suggestions={fields.favoriteGames} />
      {loading ? <LoadingLines label="Loading" /> : extras.persoAvailable && (
        <AdminSection title="Pinned to your profile">
          <div className="admin-form-grid">
            <AdminField label="Pinned post">
              {(id) => (
                <Select
                  id={id}
                  fullWidth
                  value={fields.pinnedPostId || NONE}
                  onChange={(v) => { const s = String(v); set({ pinnedPostId: s === NONE ? "" : s }); }}
                  options={[{ value: NONE, label: extras.myPosts.length ? "None" : "No posts yet" }, ...extras.myPosts.map((p) => ({ value: p.id, label: p.label }))]}
                />
              )}
            </AdminField>
            <AdminField label="Favorite TCG card" helper={extras.myCards.length ? undefined : <>Showcase a card in <Link href="/account/stuff?tab=my-cards">My Collection</Link> first.</>}>
              {(id, d) => (
                <Select
                  id={id}
                  aria-describedby={d}
                  fullWidth
                  value={fields.featuredCardId || NONE}
                  onChange={(v) => { const s = String(v); set({ featuredCardId: s === NONE ? "" : s }); }}
                  options={[{ value: NONE, label: "None" }, ...extras.myCards.map((c) => ({ value: c.id, label: c.label }))]}
                />
              )}
            </AdminField>
          </div>
        </AdminSection>
      )}
      <ProfileLinksEditor />
      <ProfileLayoutEditor />
    </AdminScreen>
  );
}

export function ThemingWalkupScreen() {
  return (
    <AdminScreen
      title="Walk-up song"
      intro="Your own walk-up song: a stream-safe track and a 10 to 15 second moment that plays when you show up in a streamer's chat, if you and that streamer both have walk-up songs on."
    >
      <AnthemSettings bare />
    </AdminScreen>
  );
}
