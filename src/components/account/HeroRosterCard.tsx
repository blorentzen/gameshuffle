"use client";

/**
 * Platform ▸ Health: the hero roster check (Overwatch, Marvel Rivals) on
 * demand. The same check runs monthly from /api/cron/hero-rosters and alerts
 * staff when a hero is new or gone; this card runs it now and shows the
 * result. Fixing a difference means editing src/data/heroes/*.ts.
 */

import { useState } from "react";
import { Alert, Badge, Button, Card } from "@empac/cascadeds";
import { IconListCheck } from "@tabler/icons-react";
import type { RosterCheck } from "@/lib/heroes/rosterCheck";

export function HeroRosterCard() {
  const [checks, setChecks] = useState<RosterCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    const j = await fetch("/api/admin/hero-rosters", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (j?.ok) setChecks(j.checks); else setFailed(true);
  };

  return (
    <Card variant="outlined" padding="medium" className="roster-check">
      <div className="roster-check__head">
        <h3 className="roster-check__title"><IconListCheck size={18} aria-hidden /> Hero rosters</h3>
        <Button variant="secondary" size="small" loading={busy} onClick={() => void run()}>{checks ? "Check again" : "Check now"}</Button>
      </div>
      <p className="dbot-muted">Compares the Overwatch and Marvel Rivals randomizers with the publishers&apos; hero pages. Runs on the 1st of each month and alerts staff when a hero is new or gone.</p>
      {failed && <Alert variant="error">Couldn&apos;t run the check. Try again in a moment.</Alert>}
      {checks && (
        <ul className="roster-check__list">
          {checks.map((c) => (
            <li key={c.game}>
              <span className="roster-check__game">
                <strong>{c.label}</strong>
                {c.error ? <Badge size="small" variant="error">Couldn&apos;t check</Badge>
                  : c.missing.length || c.extra.length ? <Badge size="small" variant="warning">Needs an update</Badge>
                  : <Badge size="small" variant="success">Matches</Badge>}
              </span>
              <span className="dbot-muted">
                {c.error ? c.error : `${c.official} on the official page, ${c.ours} in GameShuffle`}
                {c.missing.length > 0 && <>. New: {c.missing.map((h) => `${h.name} (${h.role})`).join(", ")}</>}
                {c.extra.length > 0 && <>. Gone from the page: {c.extra.join(", ")}</>}
                {c.upcoming.length > 0 && <>. Coming soon in our data: {c.upcoming.join(", ")}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
