"use client";

import { useEffect, useRef, useState } from "react";
import { Navbar } from "@empac/cascadeds";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/auth/UserMenu";
import { CommsIcons } from "@/components/social/CommsIcons";
import { useAuth } from "@/components/auth/AuthProvider";
import { COMMUNITY_PUBLICLY_ENABLED } from "@/lib/community/flags";

/**
 * Top-level site nav. This is the CDS `Navbar` (it still renders the logo,
 * links, actions, and the mobile toggle/menu) wrapped in a thin scroll "shell"
 * that drives a customized presentation via CSS:
 *   - hero routes  → two frosted glass "pills" (links + actions) floating over
 *                    the hero; hide on scroll-down / reveal on scroll-up
 *   - other routes → a plain solid brand bar
 * The pills + float + scroll behavior are CSS on the CDS parts, not a fork of
 * the component. See `docs/cds-navbar-enhancements.md` for what CDS should add
 * to make this a first-class variant.
 *
 * Links: Apps · Tools · TCG · Features · GS Pro · Contact (Pricing folds into
 * Pro); Community appears for signed-in users once the flag flips.
 */
const NAV_LINKS = [
  { label: "Apps", href: "/apps" },
  { label: "Tools", href: "/tools" },
  { label: "TCG", href: "/pokemon-tcg" },
  { label: "Features", href: "/features" },
  { label: "GS Pro", href: "/gs-pro" },
  { label: "Contact", href: "/contact-us" },
];

/** Routes that render a full-bleed hero at the very top — the nav floats over
 *  these as frosted pills (dark translucent, so white text reads over light
 *  aurora heroes and dark image/video heroes alike), then pins on scroll. All
 *  forward-facing marketing + app/tool landing pages, for one consistent nav. */
const HERO_ROUTES = new Set([
  "/",
  "/apps",
  "/tools",
  "/features",
  "/gs-pro",
  "/beta",
  "/contact-us",
  "/pokemon-tcg",
  "/mario-kart-8-deluxe-randomizer",
  "/mario-kart-world-randomizer",
  "/competitive-mario-kart",
  "/mario-kart-tournaments",
  "/pokemon-tcg-companion",
  "/randomizers/mario-kart-8-deluxe",
  "/randomizers/mario-kart-world",
]);

export function SiteNavbar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const isHeroPage = HERO_ROUTES.has(pathname);

  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // "Armed" = the nav has been revealed while already past the hero, so a
  // subsequent hide should animate (slide up). The very first hide when
  // crossing the hero threshold stays instant to avoid a flash. Disarms back
  // at the top. All setState below runs in the scroll callback, not the body.
  const [armed, setArmed] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = 0;
    const onScroll = () => {
      const y = window.scrollY;
      // On hero pages the "solid" state kicks in after most of the hero;
      // elsewhere as soon as you leave the very top.
      const threshold = isHeroPage ? Math.max(140, window.innerHeight * 0.36) : 8;
      setScrolled(y > threshold);
      if (y <= threshold) {
        setHidden(false);
        setArmed(false);
      } else if (y > lastY.current + 4) {
        setHidden(true);
      } else if (y < lastY.current - 4) {
        setHidden(false);
        setArmed(true);
      }
      lastY.current = y;
    };
    // Defer the initial sync so state updates land in a callback (re-runs per
    // route to reset the hidden/scrolled state for the new page).
    const raf = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname, isHeroPage]);

  const showCommunity = !!user && COMMUNITY_PUBLICLY_ENABLED;
  // The auth link is appended so it shows in the CDS mobile menu (CDS renders
  // the mobile menu from `links`); on desktop we render our own grouped links
  // in the logo slot and hide CDS's desktop links group via CSS.
  const authLink = user
    ? { label: "Account", href: "/account" }
    : { label: "Log In", href: "/login" };
  const links = showCommunity
    ? [...NAV_LINKS, { label: "Community", href: "/community" }, authLink]
    : [...NAV_LINKS, authLink];

  const floating = isHeroPage && !scrolled;
  const shellClass = [
    "gs-nav-shell",
    isHeroPage ? "gs-nav-shell--hero" : "gs-nav-shell--plain",
    floating ? "gs-nav-shell--float" : "gs-nav-shell--solid",
    hidden ? "gs-nav-shell--hidden" : "",
    armed ? "gs-nav-shell--armed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className={shellClass}>
        <Navbar
          logo={
            <span className="gs-nav__primary">
              <Link href="/" className="gs-nav__brand" aria-label="GameShuffle home">
                <Image
                  src="/images/fg/logos/gameshuggle-wht.png"
                  alt="GameShuffle"
                  width={150}
                  height={40}
                  style={{ height: "auto" }}
                  priority
                />
              </Link>
              <span className="gs-nav__links">
                {NAV_LINKS.map((l) => (
                  <Link key={l.href} href={l.href} className={pathname === l.href ? "is-active" : undefined}>
                    {l.label}
                  </Link>
                ))}
                {showCommunity && (
                  <Link href="/community" className={pathname === "/community" ? "is-active" : undefined}>
                    Community
                  </Link>
                )}
              </span>
            </span>
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
      </div>

      {/* Non-hero pages: the nav is fixed, so reserve its height in flow. Hero
          pages intentionally let the hero sit under the floating pills. */}
      {!isHeroPage && <div className="gs-nav__spacer" aria-hidden />}
    </>
  );
}
