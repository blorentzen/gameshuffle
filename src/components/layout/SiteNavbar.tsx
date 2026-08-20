"use client";

import { Navbar } from "@empac/cascadeds";
import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "@/components/auth/UserMenu";
import { CommsIcons } from "@/components/social/CommsIcons";
import { useAuth } from "@/components/auth/AuthProvider";
import { COMMUNITY_PUBLICLY_ENABLED } from "@/lib/community/flags";

/**
 * Top-level marketing nav. CDS `Navbar` takes a flat link list (no
 * dropdowns), so this is a small, scannable set:
 *   - Apps        → /apps (the dedicated app index / hub)
 *   - Tools       → /tools (free, no-account utilities like the wheel spinner)
 *   - TCG         → /pokemon-tcg (singles + decks shop, companion, guides)
 *   - GS Pro      → /gs-pro (Pro pitch + pricing, the conversion surface)
 *   - Features    → /features (per-feature deep-dive)
 *   - Contact     → /contact-us
 * Pricing intentionally folds into GS Pro — the only paid product is Pro.
 */
const NAV_LINKS = [
  { label: "Apps", href: "/apps" },
  { label: "Tools", href: "/tools" },
  { label: "TCG", href: "/pokemon-tcg" },
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

  // Community is the signed-in social home (find players, messages, presence).
  // Hidden until launch — staff reach it directly by URL (the page allows them).
  const links =
    user && COMMUNITY_PUBLICLY_ENABLED
      ? [...NAV_LINKS, { label: "Community", href: "/community" }, authLink]
      : [...NAV_LINKS, authLink];

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
      links={links}
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
