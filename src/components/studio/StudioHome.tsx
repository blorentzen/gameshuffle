import Link from "next/link";
import { IconCheck } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { STUDIO_TOOLS, type StudioTool } from "@/lib/studio/tools";
import type { SetupStep } from "@/lib/streaming/setup";

/** Studio Home's setup progress (journeys picks 2026-11-06, 11A): how far along, each step, and Continue. */
export function SetupProgress({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const pct = Math.round((done / steps.length) * 100);
  return (
    <section className="studio-setup" aria-labelledby="studio-setup-title">
      <span className="studio-setup__ring" style={{ "--pct": `${pct}%` } as React.CSSProperties} aria-hidden="true"><span>{done}/{steps.length}</span></span>
      <div className="studio-setup__main">
        <h2 id="studio-setup-title">Finish setting up</h2>
        <p>{steps.length - done === 1 ? "One step left" : `${steps.length - done} steps left`} before chat can play on stream.</p>
        <ul className="studio-setup__steps">
          {steps.map((s) => (
            <li key={s.id} className={s.done ? "is-done" : s.id === next?.id ? "is-next" : undefined}>
              {s.done && <IconCheck size={14} stroke={3} aria-hidden="true" />}{s.label}<span className="sr-only">{s.done ? " (done)" : ""}</span>
            </li>
          ))}
        </ul>
      </div>
      {next && <Link href={next.href} className="studio-setup__go">Continue</Link>}
    </section>
  );
}

export function ToolCard({ t }: { t: StudioTool }) {
  return (
    <Link href={`/hub/tools/${t.id}`} className="studio-tool">
      <span className="studio-tool__pic" style={t.pic ? { backgroundImage: `url(${t.pic})` } : undefined}>
        <IconTile icon={t.icon} tone={t.tone} className="studio-tool__tile" />
      </span>
      <span className="studio-tool__body">
        <b>{t.label}</b>
        <span>{t.line}</span>
        {t.chat && <code>{t.chat}</code>}
      </span>
    </Link>
  );
}

/** Your tools on Studio Home: the live games as picture cards, then the way to every tool. */
export function StudioTools() {
  const games = STUDIO_TOOLS.filter((t) => t.group === "games");
  return (
    <section className="studio-tools" aria-labelledby="studio-tools-title">
      <div className="hub-panel__head">
        <h2 id="studio-tools-title" className="hub-panel__title">Your tools</h2>
        <ArrowLink href="/hub/tools" className="hub-panel__link">All tools</ArrowLink>
      </div>
      <div className="studio-tools__grid">{games.map((t) => <ToolCard key={t.id} t={t} />)}</div>
    </section>
  );
}
