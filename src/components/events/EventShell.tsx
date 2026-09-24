"use client";

import Link from "next/link";
import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { Breadcrumb, Button, Carousel, CarouselItem, Container, Dropdown } from "@empac/cascadeds";
import type { MoreEvent } from "@/lib/events/moreTypes";
import { EventCard } from "./EventCard";
import { useToast } from "@/components/toast/ToastProvider";
import { googleCalendarUrl, icsPath, type EventType } from "@/lib/events/calendar";
import { buildEventJsonLd } from "@/lib/events/jsonld";
import { OrganizerCard, type OrganizerInfo } from "./OrganizerCard";

/**
 * The shared event page shell (Eventbrite's page shape, our content):
 *
 *   hero → breadcrumb → organizer bar (if you manage it) → badges + title +
 *   summary → when / where + add-to-calendar + share → [body | sticky action
 *   panel] → more from this organizer
 *
 * Tournaments and game nights both render inside it and supply their own body
 * (brackets, games on the table…) and their own action panel (register / RSVP /
 * lobby details). The shell owns everything that should look identical across
 * event types, so improvements land on both at once.
 */

export interface EventWhen {
  startsAt: string | null;
  /** Pre-formatted for the viewer (each page already has its own formatter). */
  label: string;
  /** Optional second line, e.g. "Doors 6:30 · races start 7:00" or "Every Saturday". */
  detail?: string | null;
}

export interface EventWhere {
  kind: "online" | "in_person" | "tba";
  label?: string | null;
  /** Anchor id of the map section in the body, when the page renders one. */
}

export interface EventHero {
  imageUrl?: string | null;
  /** Fallback when there is no image: a gradient (nights) or a stock image (tournaments). */
  gradient?: string | null;
  emoji?: string | null;
  fallbackImageUrl?: string | null;
}

export interface EventShellProps {
  type: EventType;
  id: string;
  title: string;
  /** One-line summary under the title. Long descriptions belong in the body. */
  summary?: string | null;
  hero: EventHero;
  /** Status / kind / game badges, rendered above the title. */
  badges?: ReactNode;
  breadcrumb: { label: string; href?: string }[];
  presentedBy?: { slug: string; name: string } | null;
  organizer: OrganizerInfo;
  organizerRoleLabel?: string;
  isOrganizer?: boolean;
  /** When set, shows the "you manage this" bar with a link. */
  manageHref?: string | null;
  manageLabel?: string;
  manageNote?: string;
  when: EventWhen;
  where: EventWhere;
  /** Location string for the calendar entry (falls back to where.label). */
  calendarLocation?: string | null;
  calendarDescription?: string | null;
  /** Absolute page URL for share + calendar. */
  pageUrl: string;
  /** Existing "Share to feed" control (GS-specific), rendered next to the share menu. */
  shareToFeed?: ReactNode;
  /** Good-to-know chips: duration, players, level, what to bring… */
  goodToKnow?: { label: string; value: string }[];
  /** Headline numbers shown in the action panel header. */
  panel?: { heading?: string; goingCount?: number | null; capacity?: number | null; closesLabel?: string | null };
  /** The action panel content (register / RSVP / lobby cards). */
  action: ReactNode;
  /** Structural duplicate of MoreEvent removed: the rail and its data source
   *  must agree, and they had already drifted (no coverUrl here). */
  moreFromOrganizer?: MoreEvent[];
  /** Structured data (schema.org Event) inputs the shell can't derive itself. */
  schema?: {
    status: "scheduled" | "cancelled" | "postponed" | "ended";
    registrationOpen?: boolean;
    price?: number | null;
    lat?: number | null;
    lng?: number | null;
    endsAt?: string | null;
  };
  style?: CSSProperties;
  children: ReactNode;
}

function shortDate(iso: string | null): string {
  if (!iso) return "Date TBA";
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * One "More from" card — the same EventCard the browse grid and rails use, so
 * an event looks like the same kind of object wherever you meet it.
 */
function moreCard(e: MoreEvent) {
  return (
    <EventCard
      key={`${e.type}-${e.id}`}
      href={e.href}
      title={e.title}
      seed={e.id}
      cover={e.coverUrl}
      emoji={e.type === "tournament" ? "🏆" : null}
      when={shortDate(e.startsAt)}
      meta={e.subtitle}
      priceFromCents={e.priceFromCents}
      countLabel={e.type === "tournament" ? "Tournament" : "Game night"}
    />
  );
}

export function EventShell(p: EventShellProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(p.pageUrl);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link");
    }
  }, [p.pageUrl, toast]);

  const nativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareText = [p.title, p.when.label].filter(Boolean).join(" · ");
  const shareItems = [
    { label: copied ? "Copied!" : "Copy link", onClick: () => void copyLink() },
    { label: "Share on X", onClick: () => window.open(`https://twitter.com/intent/tweet?${new URLSearchParams({ text: shareText, url: p.pageUrl })}`, "_blank", "noopener") },
    { label: "Share on Facebook", onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(p.pageUrl)}`, "_blank", "noopener") },
    ...(nativeShare ? [{ label: "More…", onClick: () => void navigator.share({ title: p.title, text: shareText, url: p.pageUrl }).catch(() => {}) }] : []),
  ];

  const gcal = googleCalendarUrl({
    type: p.type, id: p.id, title: p.title, startsAt: p.when.startsAt, url: p.pageUrl,
    description: p.calendarDescription ?? p.summary ?? null,
    location: p.calendarLocation ?? p.where.label ?? (p.where.kind === "online" ? "Online" : null),
  });
  const calendarItems = p.when.startsAt
    ? [
        { label: "Google Calendar", onClick: () => window.open(gcal!, "_blank", "noopener") },
        { label: "Apple Calendar / Outlook (.ics)", onClick: () => { window.location.href = icsPath(p.type, p.id); } },
      ]
    : [];

  const jsonLd = p.schema
    ? buildEventJsonLd({
        type: p.type, id: p.id, title: p.title, url: p.pageUrl,
        description: p.calendarDescription ?? p.summary ?? null,
        imageUrl: p.hero.imageUrl ?? p.hero.fallbackImageUrl ?? null,
        startsAt: p.when.startsAt, endsAt: p.schema.endsAt ?? null,
        status: p.schema.status,
        attendance: p.where.kind === "online" ? "online" : "in_person",
        locationName: p.where.kind === "online" ? null : p.where.label ?? null,
        lat: p.schema.lat ?? null, lng: p.schema.lng ?? null,
        organizer: { name: p.organizer.displayName, url: p.organizer.username ? `${p.pageUrl.split("/").slice(0, 3).join("/")}/u/${p.organizer.username}` : null },
        price: p.schema.price ?? null,
        capacity: p.panel?.capacity ?? null, goingCount: p.panel?.goingCount ?? null,
        registrationOpen: p.schema.registrationOpen,
      })
    : null;

  const whereIcon = p.where.kind === "online" ? "🌐" : "📍";
  const whereLabel = p.where.kind === "online" ? "Online" : p.where.label || (p.where.kind === "tba" ? "Location to be announced" : "In person");
  const spots = p.panel?.capacity != null && p.panel.goingCount != null ? Math.max(0, p.panel.capacity - p.panel.goingCount) : null;

  return (
    <main className="event-shell" style={p.style}>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      )}
      {/* Hero: image, else the type's designed fallback. Fixed height, cover-cropped. */}
      {p.hero.imageUrl || p.hero.fallbackImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.hero.imageUrl || p.hero.fallbackImageUrl || ""} alt="" className="event-shell__hero event-shell__hero--img" />
      ) : (
        <div className="event-shell__hero" style={{ background: p.hero.gradient ?? "var(--brand-gradient, linear-gradient(135deg, var(--primary-600), var(--accent-500)))" }}>
          {p.hero.emoji && <span className="event-shell__hero-emoji" aria-hidden>{p.hero.emoji}</span>}
        </div>
      )}

      <Container>
        <div className="event-shell__crumbs">
          <Breadcrumb items={p.breadcrumb} />
        </div>

        {p.manageHref && (
          <div className="comp-card event-shell__managebar">
            <span>{p.manageNote ?? (p.isOrganizer ? "You're the organizer" : "You help run this event")}</span>
            <Link href={p.manageHref} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="small">{p.manageLabel ?? "Manage"}</Button>
            </Link>
          </div>
        )}

        <header className="event-shell__head">
          {p.badges && <div className="event-shell__badges">{p.badges}</div>}
          <h1 className="event-shell__title">{p.title}</h1>
          {p.summary && <p className="event-shell__summary">{p.summary}</p>}
          {p.presentedBy && (
            <p className="event-shell__presented">
              Presented by <Link href={`/c/${p.presentedBy.slug}`}>{p.presentedBy.name}</Link>
            </p>
          )}

          <div className="event-shell__facts">
            <div className="event-shell__fact">
              <span className="event-shell__fact-icon" aria-hidden>📅</span>
              <span className="event-shell__fact-body">
                <span className="event-shell__fact-main">{p.when.label}</span>
                {p.when.detail && <span className="event-shell__fact-sub">{p.when.detail}</span>}
              </span>
              {calendarItems.length > 0 && (
                <Dropdown
                  align="start"
                  trigger={<Button variant="ghost" size="small">Add to calendar</Button>}
                  items={calendarItems}
                />
              )}
            </div>
            <div className="event-shell__fact">
              <span className="event-shell__fact-icon" aria-hidden>{whereIcon}</span>
              <span className="event-shell__fact-body">
                <span className="event-shell__fact-main">{whereLabel}</span>
              </span>
            </div>
          </div>

          <div className="event-shell__actions">
            <Dropdown align="start" trigger={<Button variant="secondary" size="small">Share</Button>} items={shareItems} />
            {p.shareToFeed}
          </div>
        </header>

        <div className="tournament-layout event-shell__layout">
          <div className="tournament-layout__main event-shell__main">
            <div className="comp-card event-shell__organizer-card">
              <OrganizerCard organizer={p.organizer} roleLabel={p.organizerRoleLabel ?? (p.presentedBy ? "Run by" : "Hosted by")} isYou={!!p.isOrganizer} />
            </div>

            {p.goodToKnow && p.goodToKnow.length > 0 && (
              <div className="comp-card event-shell__gtk">
                <h2 className="event-shell__h2">Good to know</h2>
                <div className="event-shell__gtk-grid">
                  {p.goodToKnow.map((d) => (
                    <div key={d.label} className="event-shell__gtk-item">
                      <span className="event-shell__gtk-label">{d.label}</span>
                      <span className="event-shell__gtk-value">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {p.children}
          </div>

          <aside className="tournament-layout__aside event-shell__aside" id="event-action">
            {p.panel && (p.panel.heading || p.panel.goingCount != null) && (
              <div className="event-shell__panel-head">
                {p.panel.heading && <span className="event-shell__panel-heading">{p.panel.heading}</span>}
                {/* Count lives in Good to know. Only the states that change what
                    the button means are repeated here. */}
                {spots != null && spots > 0 && spots <= 5 && (
                  <span className="event-shell__panel-urgent">{spots} spot{spots === 1 ? "" : "s"} left</span>
                )}
                {spots === 0 && <span className="event-shell__panel-urgent">Full</span>}
                {p.panel.closesLabel && <span className="event-shell__panel-closes">{p.panel.closesLabel}</span>}
              </div>
            )}
            {p.action}
          </aside>
        </div>

        {p.moreFromOrganizer && p.moreFromOrganizer.length > 0 && (
          <section className="event-shell__more">
            <h2 className="event-shell__h2">More from {p.organizer.displayName || "this organizer"}</h2>
            {/* Past four the row starts wrapping into a short second line, which
                reads worse than sliding. CDS Carousel takes over there. */}
            {p.moreFromOrganizer.length > 4 ? (
              <Carousel
                slidesToShow={{ mobile: 1, tablet: 2, desktop: 4 }}
                gap={12}
                showArrows
                showDots={false}
                touch
                keyboard
                className="event-shell__more-carousel"
              >
                {p.moreFromOrganizer.map((e) => (
                  <CarouselItem key={`${e.type}-${e.id}`}>{moreCard(e)}</CarouselItem>
                ))}
              </Carousel>
            ) : (
              <div className="event-shell__more-row">{p.moreFromOrganizer.map(moreCard)}</div>
            )}
          </section>
        )}
      </Container>

      {/* Mobile: the action panel stacks below the body, so give thumbs a jump. */}
      <a href="#event-action" className="event-shell__jump">
        {p.panel?.heading ?? "Sign up"}{spots === 0 ? " · Full" : spots != null && spots <= 5 ? ` · ${spots} left` : ""}
      </a>
    </main>
  );
}
