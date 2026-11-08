import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { IconChevronLeft } from "@tabler/icons-react";
import { ModerationNotice } from "@/components/account/ModerationNotice";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { isStaffRequest } from "@/lib/auth/raw";
import "@/styles/settings.css";

/**
 * The /account pages that open from Settings (Studio, Discord servers, Competitive Mario Kart, Pokémon, and the
 * pages that only forward): Settings' navigation, the list beside the page on a laptop and the page alone with a way
 * back on a phone (Britton, 2026-11-07: they still had the old account sidebar). Platform admin has its own layout.
 */
export default async function AccountSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="settings-page">
      <Container>
        <ModerationNotice />
        <div className="settings-layout">
          <SettingsNav staff={await isStaffRequest()} />
          <div className="settings-layout__pane">
            <div className="settings-pane">
              <Link href="/settings" className="settings-pane__back"><IconChevronLeft size={18} aria-hidden="true" />Settings</Link>
              {children}
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
