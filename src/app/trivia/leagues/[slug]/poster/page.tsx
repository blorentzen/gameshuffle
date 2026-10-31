import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Container } from "@empac/cascadeds";
import { SITE_URL } from "@/lib/seo";
import { leagueBySlug, leagueUrl, nextNight, settingsOf } from "@/lib/trivia/leagues";
import { PrintButton } from "@/components/ui/PrintButton";
import "@/styles/trivia-seo.css";

export const metadata: Metadata = { title: "League poster", robots: { index: false, follow: false } };

function when(iso: string, tz: string | null, opts: Intl.DateTimeFormatOptions): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz ?? "America/Los_Angeles", ...opts }).format(new Date(iso)); }
  catch { return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", ...opts }).format(new Date(iso)); }
}

/** A printable poster for the venue: the league, the weekly night and a QR code to the league page. */
export default async function LeaguePosterPage({ params }: { params: Promise<{ slug: string }> }) {
  const league = await leagueBySlug((await params).slug);
  if (!league || league.status === "archived") notFound();
  const s = settingsOf(league);
  const next = await nextNight(league);
  const url = `${SITE_URL}${leagueUrl(league.slug)}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, width: 260, color: { dark: "#0b0d14", light: "#ffffff" } });
  const slot = next ? `Every ${when(next.startsAt, next.timezone, { weekday: "long" })} · ${when(next.startsAt, next.timezone, { hour: "numeric", minute: "2-digit" })}` : `${s.weeks}-week season`;

  return (
    <main>
      <Container>
        <div className="league-poster-page">
          <p className="trivia-muted league-poster-page__hint">Print this page for the venue. Only the poster prints.</p>
          <PrintButton label="Print the poster" />
          <div className="league-poster">
            <p className="league-poster__eyebrow">Trivia league</p>
            <h1 className="league-poster__title">{league.title}</h1>
            <p className="league-poster__slot">{slot}</p>
            <p className="league-poster__line">Teams of up to {s.teamSize} · free to play · answer on your phone</p>
            <div className="league-poster__qr" aria-label="QR code to the league page" role="img" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="league-poster__line">Scan for the standings and to enter a team</p>
            <p className="league-poster__url">gameshuffle.co{leagueUrl(league.slug)}</p>
          </div>
        </div>
      </Container>
    </main>
  );
}
