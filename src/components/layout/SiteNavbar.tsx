"use client";

import { useEffect, useRef, useState } from "react";
import { Navbar } from "@empac/cascadeds";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/auth/UserMenu";
import { CommsIcons } from "@/components/social/CommsIcons";
import { NavSupport } from "@/components/layout/NavSupport";
import { NavMenu, type NavItem, type NavSection } from "@/components/layout/NavMenu";
import { COMMUNITY_LINKS, PILLARS, isVisible, pillarsFor, primaryItems, type Pillar } from "@/lib/nav/pillars";
import { PhoneMenu } from "@/components/layout/PhoneMenu";
import { cleanInterests, type Interest } from "@/lib/interests/rules";
import { effectiveTier, isStaffRole, normalizeTier } from "@/lib/subscription";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

/**
 * Top-level site nav. This is the CDS `Navbar` (it still renders the logo,
 * links, actions, and the mobile toggle/menu) wrapped in a thin scroll "shell"
 * that drives a customized presentation via CSS:
 *   - hero routes  → two frosted glass "pills" (links + actions) floating over
 *                    the hero; hide on scroll-down / reveal on scroll-up
 *   - other routes → a plain solid brand bar
 * The pills + float + scroll behavior are CSS on the CDS parts, not a fork of
 * the component.
 *
 * IA (menus and account picks 2026-11-05): five worlds from src/lib/nav/pillars.ts (Play, Pokémon, Compete, Host,
 * Stream), the same order for everyone on desktop, plus Merch once visitors can see the shop. On phones (1024px and
 * narrower) the menu button opens PhoneMenu: your stuff, then the worlds with your interests first and open.
 * Stream's account tools appear once you stream.
 */
/** Routes that render a full-bleed hero at the very top — the nav floats over
 *  these as frosted pills (dark translucent, so white text reads over light
 *  aurora heroes and dark image/video heroes alike), then pins on scroll. All
 *  forward-facing marketing + app/tool landing pages, for one consistent nav. */
const HERO_ROUTES = new Set([
  "/",
  "/home",
  "/welcome",
  "/mmr-card",
  "/ranked",
  "/lounge",
  "/time-trials",
  "/time-trials/import",
  "/game-nights/halloween-party-games",
  "/game-nights/christmas-party-games",
  "/apps",
  "/tools",
  "/gs-pro",
  "/beta",
  "/for-streamers",
  "/for-streamers/current",
  "/for-streamers/aspiring",
  "/for-organizers",
  "/gs-circuit",
  "/contact-us",
  "/pokemon-tcg",
  "/game-nights",
  "/tournament",
  "/competitive-mario-kart",
  "/mario-kart-tournaments",
  "/pokemon-tcg-companion",
  "/randomizers",
  "/randomizers/mario-kart-8-deluxe",
  "/randomizers/mario-kart-world",
  "/randomizers/mario-party-superstars",
  "/randomizers/mario-party",
  "/randomizers/mario-party-2",
  "/randomizers/mario-party-3",
  "/randomizers/super-mario-party-jamboree",
  "/randomizers/kirby-air-riders",
  "/randomizers/splatoon-3",
  "/randomizers/super-smash-bros-ultimate",
  "/randomizers/pokemon",
  "/randomizers/pokemon-stadium",
  "/randomizers/goldeneye-007",
  "/randomizers/pokemon-firered-leafgreen",
  "/randomizers/mario-kart-64",
  "/randomizers/perfect-dark",
  "/randomizers/overwatch",
  "/randomizers/marvel-rivals",
  "/host-a-tournament",
  "/guides",
  "/communities",
  // The Originals all open on the violet brand band.
  "/daily",
  "/daily-dex",
  "/daily-trivia",
  "/daily-duel",
  "/weekly",
  "/chat-brain",
  "/trivia",
  "/shop",
  // Also open on BrowseHero (they rendered a solid bar above it until 2026-10-19).
  "/discord",
  "/support",
  "/credits",
  "/support/thanks",
]);

/** Detail routes that lead with a full-bleed hero but cannot be listed in
 *  HERO_ROUTES because the id is dynamic. Only the bare detail page qualifies —
 *  `/game-nights/create` and `/tournament/<id>/manage` are ordinary pages. */
const HERO_DETAIL: { prefix: string; notIds: Set<string> }[] = [
  { prefix: "/game-nights/", notIds: new Set(["create", "tools"]) },
  { prefix: "/tournament/", notIds: new Set(["create", "sandbox", "championship"]) },
  // One hub per competitive game (/competitive/<game>); the lounge beneath it
  // has more segments and stays an ordinary page.
  { prefix: "/competitive/", notIds: new Set() },
  // A shared Chat Brain question (/chat-brain/q/<id>) opens on the same band.
  { prefix: "/chat-brain/q/", notIds: new Set() },
  // A shared result (/r/<code>) opens on its game's band.
  { prefix: "/r/", notIds: new Set() },
  // A lounge player's season (/lounge/<name>); /lounge/find only redirects. Head-to-head pages are below.
  { prefix: "/lounge/", notIds: new Set(["find", "compare"]) },
  // A war's page (/wars/<slug>).
  { prefix: "/wars/", notIds: new Set() },
  // A player's profile (/u/<name>): the room's front window opens on its dark header.
  { prefix: "/u/", notIds: new Set() },
  // A game space (/games/<id>): it opens on the game's art.
  { prefix: "/games/", notIds: new Set() },
  // A community (/c/<slug>): it opens on its banner band (the solid nav sat on top of it, a bar of blue over the art).
  { prefix: "/c/", notIds: new Set() },
];

function isHeroPath(pathname: string): boolean {
  if (HERO_ROUTES.has(pathname)) return true;
  // Trainer Road: the front page, each region and each trainer open on the band.
  if (/^\/pokemon-trainers(\/[^/]+){0,2}$/.test(pathname)) return true;
  // Team series (the GS Summer Series): its page.
  if (pathname === "/summer-series" || /^\/series\/[^/]+$/.test(pathname)) return true;
  // Time trials: each game's page and each track's board.
  if (/^\/time-trials(\/[^/]+){1,2}$/.test(pathname)) return true;
  // Lounge head-to-head (/lounge/compare/<a>/<b>) opens on the same band.
  if (/^\/lounge\/compare\/[^/]+\/[^/]+$/.test(pathname)) return true;
  // A lounge: its standings, a player's season, a table and the staff page.
  if (/^\/ranked\/[^/]+(\/staff|\/(players|tables)\/[^/]+)?$/.test(pathname)) return true;
  for (const { prefix, notIds } of HERO_DETAIL) {
    if (!pathname.startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length);
    // Exactly one segment, and not one of the non-detail pages.
    if (rest && !rest.includes("/") && !notIds.has(rest)) return true;
  }
  return false;
}

/** `shop`: visitors can see the shop (open or Coming soon), so the nav links to it. `previewInterests`: a staff persona
 *  preview's interests (src/lib/preview), which win over the account's own. */
export function SiteNavbar({ shop = false, previewInterests = null }: { shop?: boolean; previewInterests?: Interest[] | null }) {
  const { user } = useAuth();
  const pathname = usePathname();
  // Event detail pages open on a hero image. They were rendering the 64px nav
  // spacer instead, so the artwork started below a white band — and when the
  // nav hid on scroll-down that band was left empty, which read as broken.
  const isHeroPage = isHeroPath(pathname);

  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // "Armed" = the nav has been revealed while already past the hero, so a
  // subsequent hide should animate (slide up). The very first hide when
  // crossing the hero threshold stays instant to avoid a flash. Disarms back
  // at the top. All setState below runs in the scroll callback, not the body.
  const [armed, setArmed] = useState(false);
  const lastY = useRef(0);

  // The Stream workspace dropdown only appears for actual streamers (a Twitch
  // integration row), so we never show account-gated dashboards to the public.
  const [isStreamer, setIsStreamer] = useState(false);
  // Whether the account already pays, so the upgrade row and the Go Pro button
  // disappear once they have. Fetched alongside the streamer check rather than
  // in a second effect — the nav should cost one round trip, not two.
  const [isPaid, setIsPaid] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  // The account's interests put its worlds first in the phone menu (fetched with the paid check, one round trip).
  const [ownInterests, setOwnInterests] = useState<Interest[]>([]);
  const interests = previewInterests ?? ownInterests;
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // Defer so the reset lands in a callback, not the effect body.
      const id = requestAnimationFrame(() => {
        if (!cancelled) { setIsStreamer(false); setIsPaid(false); setIsStaff(false); setOwnInterests([]); }
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(id);
      };
    }
    const supabase = createClient();
    void Promise.all([
      supabase.from("twitch_connections").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("users").select("subscription_tier, role, circuit_status").eq("id", user.id).maybeSingle(),
      // Interests stay private to the server (the browser role can't read the column).
      fetch("/api/account/interests?nav=1", { cache: "no-store" }).then((r) => r.json()).catch(() => null) as Promise<{ interests?: string[] } | null>,
    ]).then(([tw, u, nav]) => {
      if (cancelled) return;
      setIsStreamer(!!tw.data);
      const row = u.data as { subscription_tier?: string | null; role?: string | null; circuit_status?: string | null } | null;
      setOwnInterests(cleanInterests(nav?.interests ?? []));
      // Staff read as paid too — showing them an upgrade prompt is noise.
      const paidPro = effectiveTier({ tier: normalizeTier(row?.subscription_tier), role: row?.role ?? null }) !== "free";
      const paidCircuit = !!row?.circuit_status && ["active", "trialing", "past_due"].includes(row.circuit_status);
      setIsPaid(paidPro || paidCircuit);
      setIsStaff(isStaffRole(row?.role ?? null));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  // Publish how much room the nav takes right now, so sticky bars, sidebars and
  // section pickers sit just below it and slide with it (globals.css
  // --gs-nav-offset): 64px while it shows, 0 while it's tucked away.
  useEffect(() => {
    document.documentElement.style.setProperty("--gs-nav-offset", hidden ? "0px" : "64px");
  }, [hidden]);

  // Nav groups come from the pillar map so the nav, footer, homepage and
  // sitemap cannot drift apart. The pillar was renamed Organize -> Compete:
  // far more people want to ENTER a tournament than run one, so it is named
  // for the majority intent and organising is an action inside it.
  const navCtx = { signedIn: !!user, isStreamer, isStaff: false, shop };
  const pillarSections = (p: Pillar): NavSection[] => {
    const groups = primaryItems(p, navCtx);
    const sections: NavSection[] = groups.map((g) => ({
      // Heading only when there is more than one group LEFT — a pillar whose
      // other groups were all filtered out does not need a heading above its
      // own name.
      heading: groups.length > 1 ? g.heading : undefined,
      items: g.items.map((i) => ({ label: i.label, href: i.href })),
    }));
    // Paid sits INSIDE the pillar it extends rather than in a nav bucket of its
    // own: Circuit under Compete, Pro under Stream. A single "pricing" bucket
    // would also force a streamer past organizer pricing to reach theirs.
    // Hidden once the account already pays — nobody needs selling twice.
    if (p.upgrade && !isPaid && sections.length > 0) {
      sections[sections.length - 1].items.push({
        label: p.upgrade.label,
        href: p.upgrade.href,
        highlight: true,
        detail: p.upgrade.blurb,
      });
    }
    return sections;
  };

  // The phone menu (PhoneMenu): your stuff first, then the worlds (your interests first and open), then the rest.
  const ownLinks: NavItem[] = [
    // Your home is the signed-in home; /account opens Settings, which has its own row (Britton, 2026-11-07: "Your
    // home" landing on Settings read wrong). Same as the account menu on wide screens: Home, then Settings.
    { label: "Your home", href: "/home" },
    ...(interests.includes("competitive") ? [{ label: "Competitive", href: "/account/competitive" }] : []),
    ...(interests.includes("pokemon") ? [{ label: "My Cards", href: "/account/pokemon?tab=my-cards" }] : []),
    ...(interests.includes("home") || interests.includes("events") ? [{ label: "Your events", href: "/account/events" }] : []),
    ...(interests.includes("stream") ? [{ label: "Studio", href: "/hub" }] : []),
    { label: "Messages", href: "/comms?tab=messages" },
    { label: "Settings", href: "/settings" },
    // Staff reach Platform admin here too (picks 2026-11-08: the phone menu had no way in).
    ...(isStaff ? [{ label: "Admin", href: "/admin" }] : []),
  ];
  const you = user
    ? { heading: "Your stuff", items: ownLinks }
    : { heading: "Account", items: [{ label: "Log in", href: "/login" }, { label: "Sign up", href: "/signup" }, { label: "New here? Start here", href: "/welcome" }] };
  const worlds = pillarsFor(interests).map(({ pillar, mine }) => ({ id: pillar.id, label: pillar.label, sections: pillarSections(pillar), mine: !!user && mine }));
  const extra: NavSection[] = [
    // Support first, then GS Pro (support first plan, 2026-10-19; the bar's heart hides on phones).
    { heading: "Support and GS Pro", items: [{ label: "Support GameShuffle", href: "/support" }, ...(!isPaid ? [{ label: "GS Pro", href: "/gs-pro" }] : [])] },
    { heading: "Community", items: COMMUNITY_LINKS.filter((i) => isVisible(i, navCtx)).map((i) => ({ label: i.label, href: i.href })) },
  ];

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
              <Link href={user ? "/home" : "/"} className="gs-nav__brand" aria-label="GameShuffle home">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/fg/logos/gameshuffle-wht.svg"
                  alt="GameShuffle"
                  width={158}
                  height={22}
                  style={{ height: "auto" }}
                />
              </Link>
              <span className="gs-nav__links">
                {PILLARS.map((p) => (
                  <NavMenu key={p.id} label={p.label} sections={pillarSections(p)} pathname={pathname} />
                ))}
                {/* Merch (pick 13: the address stays /shop), once visitors can see the shop. */}
                {shop && <Link href="/shop" className={pathname.startsWith("/shop") ? "is-active" : undefined}>Merch</Link>}
              </span>
            </span>
          }
          links={[]}
          actions={
            <>
              {/* Comms (bell + chat) are signed-in only — rendering the wrapper
                  when signed out left an empty span whose flex gap pushed a
                  hollow space to the left of the auth buttons. */}
              {user && (
                <span className="navbar-comms">
                  <CommsIcons />
                </span>
              )}
              {/* Support leads (support first plan, 2026-10-19): a heart "Support"
                  button for visitors and free accounts where "Go Pro" used to be,
                  a thank-you heart for members and supporters. GS Pro keeps its
                  row in the Stream pillar and its walls. */}
              <NavSupport signedIn={!!user} paid={isPaid} />
              <span className="navbar-usermenu">
                <UserMenu />
              </span>
              <PhoneMenu you={you} worlds={worlds} extra={extra} />
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
