"use client";

import { Navbar } from "@empac/cascadeds";
import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "@/components/auth/UserMenu";
import { CommsIcons } from "@/components/social/CommsIcons";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Top-level marketing nav. CDS `Navbar` takes a flat link list (no
 * dropdowns), so this is a small, scannable set:
 *   - Apps    → /apps (the dedicated app index / hub)
 *   - Tools   → /tools (free, no-account utilities like the wheel spinner)
 *   - GS Pro  → /gs-pro (Pro pitch + pricing, the conversion surface)
 *   - Features→ /features (per-feature deep-dive)
 *   - Contact → /contact-us
 * Pricing intentionally folds into GS Pro — the only paid product is Pro.
 */
const NAV_LINKS = [
  { label: "Apps", href: "/apps" },
  { label: "Tools", href: "/tools" },
  { label: "Features", href: "/features" },
  { label: "GS Pro", href: "/gs-pro" },
  { label: "Contact", href: "/contact-us" },
];

export function SiteNavbar() {
  const { user } = useAuth();

  // The auth link is appended so it appears in the mobile hamburger menu
  // (CDS only renders `links` there, not `actions`). On desktop it's hidden
  // via CSS — the UserMenu in `actions` covers login/account there.
  const authLink = user
    ? { label: "Account", href: "/account" }
    : { label: "Log In", href: "/login" };

  return (
    <Navbar
      logo={
        <Link href="/">
          <Image
            src="/images/fg/logos/gameshuggle-wht.png"
            alt="GameShuffle"
            width={150}
            height={40}
            style={{ height: "auto" }}
            priority
          />
        </Link>
      }
      links={[...NAV_LINKS, authLink]}
      actions={
        <>
          <span className="navbar-comms">
            <CommsIcons />
          </span>
          <span className="navbar-usermenu">
            <UserMenu />
          </span>
        </>
      }
    />
  );
}
