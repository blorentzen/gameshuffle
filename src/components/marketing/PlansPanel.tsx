import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconBroadcast, IconHeart, IconTrophy, IconUserCheck, type Icon } from "@tabler/icons-react";
import { RowPanel, type RowTone } from "@/components/marketing/RowPanel";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { circuitLaunchState } from "@/lib/tournaments/circuit-resolve";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { TrialNote } from "@/components/billing/TrialNote";
import { supportLevel } from "@/lib/support/rules";

/**
 * One panel for what comes after the free tools: a free account, GS Circuit
 * and GS Pro (Britton's picks, 2026-10-19, https://claude.ai/artifact/QaSjiFxbYHkNBAQq53xvpq).
 * Under the tool on every randomizer page and before the FAQ on the landing
 * pages; each page words the rows for itself. One surface with thin lines
 * between rows (the containers rule), three across on wide screens. GS Circuit
 * says "free during preview" until its billing switch launches it. Server
 * component: the buttons know who's signed in. A page with nothing for an
 * organizer can take the Supporter level as its third row instead (the
 * speedrun page, launch picks 2026-11-10: its looks come with Supporter too).
 */
export type PlanRow = "account" | "circuit" | "pro" | "supporter";
interface RowCopy { name: string; body: string }

const DEFAULTS: Record<PlanRow, RowCopy> = {
  account: { name: "Save your setups", body: "A free account keeps your favorite setups and lets you play for points with your group." },
  circuit: { name: "Run bigger events", body: "Fields of 64 or 256, championship seasons, co-organizers, your branding and live standings." },
  pro: { name: "Put it on your stream", body: "Chat rolls along, viewers join your lobby, and it all shows on your OBS overlay." },
  supporter: { name: "Support GameShuffle", body: "Keep the free games free, and get every look on your overlays and profile." },
};

const ICONS: Record<PlanRow, Icon> = { account: IconUserCheck, circuit: IconTrophy, pro: IconBroadcast, supporter: IconHeart };
const TONES: Record<PlanRow, RowTone> = { account: "blue", circuit: "teal", pro: "magenta", supporter: "red" };
const SUPPORTER_PRICE = `$${(supportLevel("supporter")?.cents ?? 300) / 100}`;

export async function PlansPanel({ title, intro, rows, copy = {}, cta = {}, from, id }: {
  title: string;
  intro?: string;
  rows: PlanRow[];
  /** This page's wording for any row. */
  copy?: Partial<Record<PlanRow, RowCopy>>;
  /** A row's own button in place of the default (e.g. "Start a tournament" on a tournament page). */
  cta?: Partial<Record<PlanRow, { label: string; href: string }>>;
  /** Where the clicks come from, for the upgrade analytics ("randomizer-mario-party"). */
  from: string;
  id?: string;
}) {
  const launched = rows.includes("circuit") ? !!(await circuitLaunchState()).launchedAt : false;
  // One short label per row (eyebrow rule, 2026-10-20); the trial and preview facts close the row's text.
  const eyebrow: Record<PlanRow, string> = { account: "Free account", circuit: "GS Circuit", pro: "GS Pro", supporter: "Supporter" };
  const note: Record<PlanRow, React.ReactNode> = {
    account: null,
    circuit: launched ? null : " Free during the preview.",
    pro: <TrialNote trial=" 14 days free." outside=" In the US for now." />,
    supporter: null,
  };
  const action = (row: PlanRow) => {
    const own = cta[row];
    if (own) {
      return (
        <Link href={own.href} style={{ textDecoration: "none" }}>
          <Button variant={row === "pro" ? "primary" : "secondary"} size="small">{own.label}</Button>
        </Link>
      );
    }
    if (row === "account") {
      return <AuthAwareCTA variant="secondary" size="small" overrides={{
        anon: { label: "Make a free account", href: "/signup" },
        free: { label: "Open saved setups", href: "/account/events?tab=setups" },
        pro: { label: "Open saved setups", href: "/account/events?tab=setups" },
      }} />;
    }
    if (row === "pro") {
      return <AuthAwareCTA variant="primary" size="small" trackFrom={from} overrides={{
        anon: { label: "Try GS Pro free", href: "/gs-pro" },
        free: { label: "Try GS Pro free", href: "/gs-pro" },
        pro: { label: "Open your stream hub", href: "/hub" },
      }} />;
    }
    if (row === "supporter") {
      return (
        <Link href={`/support?level=supporter&from=${encodeURIComponent(from)}#give`} className={tagged(EVENTS.supportClicked, { from })} style={{ textDecoration: "none" }}>
          <Button variant="secondary" size="small">Support for {SUPPORTER_PRICE} a month</Button>
        </Link>
      );
    }
    return (
      <Link href="/gs-circuit" className={tagged(EVENTS.circuitClicked, { from })} style={{ textDecoration: "none" }}>
        <Button variant="secondary" size="small">See GS Circuit</Button>
      </Link>
    );
  };
  const headingId = `${id ?? "plans"}-title`;
  return (
    <section className="plans-panel" aria-labelledby={headingId} id={id}>
      <div className="plans-panel__head">
        <h2 id={headingId} className="plans-panel__title">{title}</h2>
        {intro && <p className="plans-panel__intro">{intro}</p>}
      </div>
      <RowPanel
        rows={rows.map((row) => {
          const c = { ...DEFAULTS[row], ...copy[row] };
          return { key: row, Icon: ICONS[row], tone: TONES[row], eyebrow: eyebrow[row], title: c.name, text: <>{c.body}{note[row]}</>, action: action(row) };
        })}
      />
    </section>
  );
}
