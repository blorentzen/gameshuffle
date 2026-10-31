"use client";

/**
 * What the paste reader understands (pasting picks 2026-10-30, 4A), folded under the paste box: the
 * places people copy their times from, the line shapes it reads, and a searchable list of the short
 * names it knows for the game picked.
 */

import { useMemo, useState } from "react";
import { Accordion, Input } from "@empac/cascadeds";
import { IconSearch } from "@tabler/icons-react";
import { shortNames } from "@/lib/timeTrials/quaxly";
import type { TtGame } from "@/lib/timeTrials/tracks";

export function TtPasteHelp({ game }: { game: TtGame }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => shortNames(game), [game]);
  const t = q.trim().toLowerCase();
  const shown = t ? all.filter((r) => r.abbr.toLowerCase().includes(t) || r.name.toLowerCase().includes(t)) : all;
  return (
    <Accordion
      variant="flush"
      className="tt-pastehelp"
      items={[{
        id: "help",
        title: "What the reader understands",
        content: (
          <div className="tt-pastehelp__body">
            <div>
              <h3>Where to copy your times from</h3>
              <ul className="tt-pastehelp__list">
                <li><b>Quaxly</b>: its reply to <code>{game === "mk8dx" ? "/dx display_time" : "/display_time"}</code>, or Save to GameShuffle on it.</li>
                {game === "mkworld" && <li><b>MKCentral</b>: the button above brings your timesheet over.</li>}
                <li><b>The Players&apos; Page</b> (mariokart64.com): select the times table on your profile and paste it.</li>
                {game === "mk8dx" && <li><b>MKLeaderboards</b>: the times table on your profile.</li>}
                <li><b>A spreadsheet</b>: a track column and a time column.</li>
              </ul>
              <h3>Lines it reads</h3>
              <pre className="tt-pastehelp__fmt">{game === "mk8dx" ? "MKS 1:36.990\nMario Kart Stadium - 1:36.990\n200cc  Water Park  1:31.420\nMario Kart Stadium<tab>1'34\"352" : "MBC 1:47.342\nMario Bros. Circuit - 1:47.342\nCrown City<tab>1'58\"000"}</pre>
              <p className="tt-note">One time per line, with the track&apos;s name or short name on it. A heading like &ldquo;200cc&rdquo; or &ldquo;No items&rdquo; sets the rest. Lines it can&apos;t match go to AI, and anything left you pick by hand.</p>
            </div>
            <div>
              <h3>Short names it knows ({all.length})</h3>
              <label htmlFor="tt-abbr-q" className="sr-only">Find a short name</label>
              <Input id="tt-abbr-q" size="small" value={q} onChange={(e) => setQ(e.target.value)} iconBefore={IconSearch} placeholder="Find a short name or track" autoComplete="off" fullWidth />
              <ul className="tt-pastehelp__abbr">
                {shown.slice(0, 60).map((r) => <li key={r.abbr}><code>{r.abbr}</code> {r.name}</li>)}
              </ul>
              {shown.length > 60 && <p className="tt-note">{shown.length - 60} more. Search to find one.</p>}
              {!shown.length && <p className="tt-note">None match. The reader also knows every track by its full name.</p>}
            </div>
          </div>
        ),
      }]}
    />
  );
}
