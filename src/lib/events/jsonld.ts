/**
 * schema.org `Event` JSON-LD for the shared event shell (client-safe, pure).
 *
 * One builder for tournaments and game nights so both qualify for Google's
 * event rich results with the same fields: dates, attendance mode, location
 * (Place or VirtualLocation), organizer, image, a free/paid Offer with
 * availability, capacity. Only public data goes in.
 */

import type { EventType } from "./calendar";
import { eventEnd } from "./calendar";

export interface EventJsonLdInput {
  type: EventType;
  id: string;
  title: string;
  description?: string | null;
  url: string;
  imageUrl?: string | null;
  startsAt: string | null;
  endsAt?: string | null;
  status: "scheduled" | "cancelled" | "postponed" | "ended";
  attendance: "online" | "in_person" | "mixed";
  /** Place name / address for in-person events. */
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  organizer?: { name: string; url?: string | null } | null;
  /** Ticket price in USD; 0 or undefined = free. */
  price?: number | null;
  capacity?: number | null;
  goingCount?: number | null;
  /** Registration open? Drives Offer.availability. */
  registrationOpen?: boolean;
}

export function buildEventJsonLd(e: EventJsonLdInput): Record<string, unknown> | null {
  if (!e.startsAt) return null; // no date → not a valid Event
  const end = eventEnd({ type: e.type, startsAt: e.startsAt, endsAt: e.endsAt ?? null });
  const soldOut = e.capacity != null && e.goingCount != null && e.goingCount >= e.capacity;

  const location =
    e.attendance === "online"
      ? { "@type": "VirtualLocation", url: e.url }
      : {
          "@type": "Place",
          name: e.locationName || "In person",
          ...(e.locationName ? { address: e.locationName } : {}),
          ...(e.lat != null && e.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng } } : {}),
        };

  const statusMap = {
    scheduled: "https://schema.org/EventScheduled",
    cancelled: "https://schema.org/EventCancelled",
    postponed: "https://schema.org/EventPostponed",
    ended: "https://schema.org/EventScheduled",
  } as const;
  const modeMap = {
    online: "https://schema.org/OnlineEventAttendanceMode",
    in_person: "https://schema.org/OfflineEventAttendanceMode",
    mixed: "https://schema.org/MixedEventAttendanceMode",
  } as const;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${e.url}#event`,
    name: e.title,
    ...(e.description ? { description: e.description.slice(0, 500) } : {}),
    url: e.url,
    ...(e.imageUrl ? { image: [e.imageUrl] } : {}),
    startDate: e.startsAt,
    ...(end ? { endDate: end } : {}),
    eventStatus: statusMap[e.status],
    eventAttendanceMode: modeMap[e.attendance],
    location,
    ...(e.organizer ? { organizer: { "@type": "Person", name: e.organizer.name, ...(e.organizer.url ? { url: e.organizer.url } : {}) } } : {}),
    ...(e.capacity != null ? { maximumAttendeeCapacity: e.capacity } : {}),
    ...(e.capacity != null && e.goingCount != null ? { remainingAttendeeCapacity: Math.max(0, e.capacity - e.goingCount) } : {}),
    isAccessibleForFree: !(e.price && e.price > 0),
    offers: {
      "@type": "Offer",
      url: e.url,
      price: e.price && e.price > 0 ? e.price.toFixed(2) : "0",
      priceCurrency: "USD",
      availability: e.status === "cancelled" || e.status === "ended" || e.registrationOpen === false
        ? "https://schema.org/SoldOut"
        : soldOut
          ? "https://schema.org/SoldOut"
          : "https://schema.org/InStock",
    },
  };
}
