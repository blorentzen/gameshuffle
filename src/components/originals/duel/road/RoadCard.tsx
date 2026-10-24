/**
 * The trainer card (Trainer Road phase 2, picks 2026-10-23): level and XP, badges, regions cleared,
 * trainers beaten and this month's stars, the day you started under them, on a card whose color steps up with
 * the big milestones (bronze, silver, gold, holo), like the trainer cards in FireRed and LeafGreen. Each
 * region's villain-team story battle won adds that team's mark (road encounters, picks 2026-10-24).
 * No hooks, so the profile page draws it on the server and Trainer Road in the browser.
 */

import { Avatar, Progress } from "@empac/cascadeds";
import { IconCheck, IconLock } from "@tabler/icons-react";
import type { RoadProgressView } from "@/lib/originals/duel/roadView";
import { TrainerArt } from "../TrainerArt";

const started = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
const n = (v: number) => v.toLocaleString("en-US");

export function RoadTrainerCard({ p, regions = true }: { p: RoadProgressView; regions?: boolean }) {
  const initials = p.name.split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();
  const xpLine = p.need ? `${n(p.into)} of ${n(p.need)} XP to level ${p.level + 1}` : "Top level";
  return (
    <section className={`road-card road-card--${p.color}`} aria-label={`${p.name}'s trainer card`}>
      <div className="road-card__head">
        <Avatar src={p.avatar ?? undefined} alt="" initials={initials} size="large" />
        <div className="road-card__who">
          <p className="road-card__name">{p.name}</p>
          <p className="road-card__color">{p.champion ? "Trainer Road Champion" : `${p.colorLabel} card`}</p>
        </div>
        <p className="road-card__level"><span>Level</span><b>{p.level}</b></p>
      </div>
      <div className="road-card__xp">
        <Progress value={p.need ? p.into : 1} max={p.need || 1} size="small" label={xpLine} className="road-card__bar" />
        <p className="road-card__xpline">{xpLine}</p>
      </div>
      <dl className="road-card__stats">
        <div><dt>Badges</dt><dd>{p.badges}</dd></div>
        <div><dt>Regions cleared</dt><dd>{p.regionsCleared} of {p.regions.length}</dd></div>
        <div><dt>Trainers beaten</dt><dd>{n(p.trainersBeaten)}</dd></div>
        <div><dt>Stars this month</dt><dd>{n(p.starsThisMonth)}</dd></div>
      </dl>
      {p.marks?.length > 0 && (
        <div className="road-card__marks">
          <p className="road-card__marks-label">Villain teams beaten</p>
          <ul className="road-card__marks-list">
            {p.marks.map((m) => (
              <li key={m.region} className="road-card__mark">
                <span className="road-card__mark-art" aria-hidden="true">{m.picture ? <TrainerArt picture={m.picture} shape="round" /> : m.name.charAt(5)}</span>
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {regions && (
        <ul className="road-card__regions" aria-label="Regions">
          {p.regions.map((r) => (
            <li key={r.region} className={`road-card__region${r.cleared ? " is-cleared" : r.open ? " is-open" : ""}`}>
              {r.cleared ? <IconCheck size={14} aria-hidden="true" /> : !r.open ? <IconLock size={14} aria-hidden="true" /> : null}
              <span>{r.name}</span>
              <span className="sr-only">{r.cleared ? ", cleared" : r.open ? `, ${r.badges} of ${r.gyms} ${r.region === "alola" ? "grand trials" : "badges"}` : ", not open yet"}</span>
            </li>
          ))}
        </ul>
      )}
      {p.startedAt && <p className="road-card__since">Started {started(p.startedAt)}</p>}
    </section>
  );
}
