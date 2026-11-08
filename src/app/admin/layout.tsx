import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { ModerationNotice } from "@/components/account/ModerationNotice";
import { AdminNav } from "@/components/admin/AdminNav";
import { getRawAuthenticatedUser } from "@/lib/auth/raw";
import { isStaffRole } from "@/lib/subscription";
import "@/styles/settings.css";

/**
 * /admin, Platform admin for staff and admins (admin like Settings, picks 2026-11-08, all as recommended): Settings'
 * list beside the open view on a laptop; on a phone the list is /admin and each view opens on its own with a way
 * back. Anyone else is sent to Settings before any admin UI renders; each screen's own API checks the role too.
 * The old /account/platform?tab= addresses forward here.
 */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin | GameShuffle" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getRawAuthenticatedUser();
  if (!user) redirect("/login?redirect=/admin");
  if (!isStaffRole(user.role)) redirect("/settings");
  return (
    <main className="settings-page">
      <Container>
        <ModerationNotice />
        <div className="settings-layout">
          <AdminNav />
          <div className="settings-layout__pane">{children}</div>
        </div>
      </Container>
    </main>
  );
}
