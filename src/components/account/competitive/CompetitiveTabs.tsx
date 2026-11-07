"use client";

/**
 * Account ▸ Competitive (menus and account picks 2026-11-05, 4A): one screen for competitive Mario Kart. Your lounge
 * names, your time trial times, your MMR card and any review access, each with a link to its tool. Parts filled in
 * by a staff persona preview are marked Sample (src/lib/account/competitive.ts).
 */

import { Badge, Button } from "@empac/cascadeds";
import { useRouter } from "next/navigation";
import { SectionTabs } from "@/components/account/SectionTabs";
import { AdminScreen, AdminSection } from "@/components/account/admin/AdminKit";
import { ArrowLink } from "@/components/ui/ArrowLink";
import type { CompetitiveSummary } from "@/lib/account/competitive";
import "@/styles/account-home.css";

const GAME: Record<string, string> = { mk8dx: "Mario Kart 8 Deluxe", mkworld12p: "Mario Kart World (12 players)", mkworld24p: "Mario Kart World (24 players)" };
const Sample = ({ on }: { on: boolean }) => (on ? <Badge variant="warning" size="small">Sample</Badge> : null);

function CompetitiveScreen({ s }: { s: CompetitiveSummary }) {
  const router = useRouter();
  return (
    <AdminScreen title="Competitive Mario Kart" intro="Your lounge, your times and your MMR card, with a way into each.">
      <AdminSection title="Lounge" actions={<Sample on={s.loungeSample} />}>
        {s.lounge.length ? (
          <ul className="acct-comp__list">
            {s.lounge.map((l) => (
              <li key={l.game}>
                <ArrowLink href={`/lounge/${encodeURIComponent(l.name)}?game=${l.game}`}>{l.name}</ArrowLink>
                <span>{GAME[l.game] ?? l.game}{l.mmr != null ? ` · ${l.mmr.toLocaleString("en-US")} MMR` : ""}{l.division ? ` · ${l.division}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="acct-note">Confirm your lounge name with Discord and your season shows on your profile, your MMR card and the boards.</p>
        )}
        <div><Button variant="secondary" size="small" onClick={() => router.push("/lounge")}>{s.lounge.length ? "Lounge stats" : "Confirm your lounge name"}</Button></div>
      </AdminSection>

      <AdminSection title="Time trials" actions={<Sample on={s.timesSample} />}>
        <p className="acct-note">
          {s.times ? `${s.times} time${s.times === 1 ? "" : "s"} on the boards.` : "Add a time from a screenshot, or bring yours over from Quaxly."}
        </p>
        <div className="acct-comp__links">
          {s.times > 0 && s.username && <ArrowLink href={`/time-trials/players/${s.username}`}>Your times</ArrowLink>}
          <ArrowLink href="/time-trials/import">Add or import times</ArrowLink>
          <ArrowLink href="/time-trials">All the boards</ArrowLink>
        </div>
      </AdminSection>

      <AdminSection title="MMR card" actions={<Sample on={s.mmrSample} />}>
        <p className="acct-note">
          {s.mmrCard ? `Your card shows ${s.mmrCard.loungeName ?? "your lounge name"} live on stream and on your profile.` : "Your lounge MMR on stream, live, with a moment every event. Free."}
        </p>
        <div><Button variant="secondary" size="small" onClick={() => router.push("/mmr-card")}>{s.mmrCard ? "Open the studio" : "Make your MMR card"}</Button></div>
      </AdminSection>

      {s.review && (
        <AdminSection title="Review access">
          <p className="acct-note">{s.review}</p>
          <div><ArrowLink href="/time-trials/review">Times waiting for review</ArrowLink></div>
        </AdminSection>
      )}
    </AdminScreen>
  );
}

export function CompetitiveTabs({ summary }: { summary: CompetitiveSummary }) {
  return <SectionTabs route="/account/competitive" screens={{ competitive: () => <CompetitiveScreen s={summary} /> }} />;
}
