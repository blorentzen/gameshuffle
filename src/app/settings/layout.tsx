import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { ModerationNotice } from "@/components/account/ModerationNotice";
import { SettingsNav } from "@/components/settings/SettingsNav";
import "@/styles/settings.css";

/**
 * /settings (journeys picks 2026-11-06, 8A): the list beside the open page on a laptop; on a phone the list is
 * /settings and each item opens on its own with a way back. Signed in only (the middleware sends visitors to sign in).
 */
export const metadata: Metadata = {
  title: { default: "Settings", template: "%s · Settings | GameShuffle" },
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="settings-page">
      <Container>
        <ModerationNotice />
        <div className="settings-layout">
          <SettingsNav />
          <div className="settings-layout__pane">{children}</div>
        </div>
      </Container>
    </main>
  );
}
