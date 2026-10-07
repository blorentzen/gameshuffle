"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { WaitlistCard } from "@/components/events/WaitlistCard";
import { TicketPurchase } from "@/components/events/TicketPurchase";
import type { EventType } from "@/lib/events/calendar";
import type { MyWaitlist } from "@/lib/events/waitlist";
import { LoadingLines } from "@/components/loading/LoadingLines";

type Info = { event: { type: EventType; id: string; title: string; startsAt: string | null; href: string }; me: MyWaitlist };

export function WaitlistOfferClient({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    fetch(`/api/waitlist/${token}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Info | null) => { if (j?.event) setInfo(j); else setMissing(true); })
      .catch(() => setMissing(true));
  }, [token]);

  if (missing) {
    return (
      <Container as="main" className="waitlist-offer">
        <h1 className="waitlist-offer__title">This link doesn&apos;t work</h1>
        <p>It may have been copied wrong. Open the event page to see where you stand.</p>
        <Link href="/"><Button variant="secondary">Go to GameShuffle</Button></Link>
      </Container>
    );
  }
  if (!info) return <Container as="main" className="waitlist-offer"><LoadingLines label="Loading" /></Container>;

  const { event, me } = info;
  const when = event.startsAt ? new Date(event.startsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const settled = me.status !== "offered" && me.status !== "waitlisted";
  return (
    <Container as="main" className="waitlist-offer">
      <p className="waitlist-offer__eyebrow">Waitlist</p>
      <h1 className="waitlist-offer__title">{event.title}</h1>
      {when && <p className="waitlist-offer__when">{when}</p>}
      <WaitlistCard type={event.type} eventId={event.id} signedIn={false} token={token} onPay={() => setPaying(true)}
        onChanged={() => window.location.reload()} />
      {paying && <TicketPurchase type={event.type} eventId={event.id} offerToken={token} />}
      {settled && (
        <p className="waitlist-offer__note">
          {me.status === "confirmed" || me.status === "registered" || me.status === "checked_in" || me.status === "going"
            ? "You're in. See you there!"
            : "There's no offer waiting on this link right now."}
        </p>
      )}
      <Link href={event.href} className="waitlist-offer__link">Open the event page</Link>
    </Container>
  );
}
