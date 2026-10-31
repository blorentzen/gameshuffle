"use client";

/**
 * Trainer Road's path in the browser (phase 2 step 1, picks 2026-10-23,
 * https://claude.ai/artifact/6Bbdmob4u66QwdHdnxFaoC): the region page's path box (badges in order, the
 * League, the end-game battle, Continue) and the front page's trainer card with the next trainer.
 * Progress is the account's (GET /api/trainer-road?path=); signed out, the path still shows, with a
 * line about the free account that keeps it.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconCheck, IconLock, IconSwords } from "@tabler/icons-react";
import { ArrowLink } from "@/components/ui/ArrowLink";
import type { RoadPathView, RoadProgressView, RoadStepView } from "@/lib/originals/duel/roadView";
import { TrainerArt } from "../TrainerArt";
import { RoadTrainerCard } from "./RoadCard";
import { RoadEncounterCard } from "./RoadEncounter";
import { RoadBagLine } from "./RoadMart";

export function useRoadPath(region: string | null, refresh = 0): { progress: RoadProgressView | null; path: RoadPathView | null; loaded: boolean } {
  const [state, setState] = useState<{ progress: RoadProgressView | null; path: RoadPathView | null; loaded: boolean }>({ progress: null, path: null, loaded: false });
  useEffect(() => {
    if (!region) return;
    let live = true;
    void fetch(`/api/trainer-road?path=${encodeURIComponent(region)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { progress: RoadProgressView | null; path: RoadPathView | null } | null) => { if (live) setState({ progress: b?.progress ?? null, path: b?.path ?? null, loaded: true }); })
      .catch(() => { if (live) setState((s) => ({ ...s, loaded: true })); });
    return () => { live = false; };
  }, [region, refresh]);
  return state;
}

const stateWord = (s: RoadStepView["state"]) => (s === "done" ? "done" : s === "next" ? "next" : s === "locked" ? "not open yet" : "to come");

function Face({ step, size }: { step: RoadStepView; size: "sm" | "md" }) {
  return (
    <span className={`road-path__face road-path__face--${size} is-${step.state}`} aria-hidden="true">
      {step.picture ? <TrainerArt picture={step.picture} shape="round" /> : <span className="road-path__initial">{step.name.charAt(0)}</span>}
      {step.state === "done" && <span className="road-path__tick"><IconCheck size={12} /></span>}
    </span>
  );
}

/** The region page's path: badges in order, the League, the end-game battle and the next trainer. */
export function RoadPathBox({ region, signUpHref }: { region: string; signUpHref: string }) {
  const router = useRouter();
  const { progress, path, loaded } = useRoadPath(region);
  if (!loaded || !path) return null;
  const signedIn = !!progress;
  const nextHere = progress?.next && progress.next.region === region ? progress.next : null;
  const lead = !signedIn
    ? null
    : path.cleared ? `${path.regionName} cleared.`
    : !path.open ? `Clear ${path.openedBy} to open ${path.regionName} on your path. Free play is open: duel anyone below any time.`
    : null;
  const word = path.gymWord;
  const gymsDone = path.gyms.filter((s) => s.state === "done").length;
  return (
    <section className="road-path road-quiet" aria-labelledby="road-path-title">
      <div className="road-path__head">
        <h2 id="road-path-title" className="road-section__title">{signedIn ? `Your ${path.regionName} path` : `The ${path.regionName} path`}</h2>
        <p className="road-path__sub">{path.game}: {path.gyms.length} {word}s in order, the {path.leagueLabel} back to back, then the end-game battle. Clearing it opens the next region.</p>
        {lead && <p className="road-path__lead">{lead}</p>}
        {!signedIn && <p className="road-path__lead"><Link href={signUpHref}>Make a free account</Link> to follow the path: your {word}s, the League and your trainer level stay with you.</p>}
        {signedIn && <RoadBagLine region={region} signedIn />}
      </div>

      <div className="road-path__part">
        <p className="road-path__label">{word === "badge" ? "Badges" : "Grand trials"} <span>{gymsDone} of {path.gyms.length}</span></p>
        <ol className="road-path__gyms">
          {path.gyms.map((s) => (
            <li key={s.team}>
              <Link href={s.href} className={`road-path__step is-${s.state}`} aria-label={`${s.label}: ${stateWord(s.state)}`}>
                <Face step={s} size="md" />
                <span className="road-path__name">{s.name}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>

      <div className="road-path__part">
        <p className="road-path__label">{path.leagueLabel} <span>{path.leagueDone ? "Won" : `${Math.min(path.leagueStep, path.league.length)} of ${path.league.length}`}</span></p>
        <ol className="road-path__league">
          {path.league.map((s) => (
            <li key={s.team}>
              <Link href={s.href} className={`road-path__step road-path__step--row is-${s.state}`} aria-label={`${path.leagueLabel}, ${s.label}, ${s.name}: ${stateWord(s.state)}`}>
                <Face step={s} size="sm" />
                <span className="road-path__name">{s.name}</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="road-path__note">Back to back: lose one and you start again from {path.league[0].name}.</p>
      </div>

      <div className="road-path__part">
        <p className="road-path__label">The end-game battle</p>
        <Link href={path.endgame.href} className={`road-path__step road-path__step--row is-${path.endgame.state}`} aria-label={`The end-game battle, ${path.endgame.name}: ${stateWord(path.endgame.state)}`}>
          <Face step={path.endgame} size="sm" />
          <span className="road-path__name">{path.endgame.name}</span>
          {path.endgame.state === "locked" && <IconLock size={14} aria-hidden="true" />}
        </Link>
      </div>

      {progress?.encounter && progress.encounter.region === region ? (
        <RoadEncounterCard e={progress.encounter} from="path" />
      ) : nextHere && (
        <div className="road-path__go">
          <Button variant="primary" iconBefore={IconSwords} onClick={() => router.push(nextHere.href)}>Continue: {nextHere.name}</Button>
          <span className="road-path__nextline">{nextHere.label}</span>
        </div>
      )}
    </section>
  );
}

/** The front page: your trainer card and the next trainer on your path; signed out, what the path is. */
export function RoadHubPath({ signUpHref }: { signUpHref: string }) {
  const router = useRouter();
  const { progress, loaded } = useRoadPath("current");
  if (!loaded) return null;
  if (!progress) {
    return (
      <section className="road-hubpath road-flat" aria-labelledby="road-hubpath-title">
        <h2 id="road-hubpath-title" className="road-section__title">Follow the road</h2>
        <p className="road-path__sub">Each region follows one game: its Gym Leaders in order, the League back to back, then an end-game battle that opens the next region. Kanto comes first, Paldea last. Every win levels up your trainer card.</p>
        <p className="road-path__lead"><Link href={signUpHref}>Make a free account</Link> to start the road. You can still duel any trainer without one.</p>
      </section>
    );
  }
  const next = progress.next;
  return (
    <section className="road-hubpath" aria-labelledby="road-hubpath-title">
      <h2 id="road-hubpath-title" className="road-section__title">Your road</h2>
      <div className="road-hubpath__grid">
        <RoadTrainerCard p={progress} />
        <div className="road-hubpath__next">
          {progress.encounter ? (
            <RoadEncounterCard e={progress.encounter} from="hub" />
          ) : next ? (
            <>
              <p className="road-path__label">Next on your path</p>
              <div className="road-hubpath__who">
                <span className="road-path__face road-path__face--md is-next" aria-hidden="true">{next.picture ? <TrainerArt picture={next.picture} shape="round" /> : <span className="road-path__initial">{next.name.charAt(0)}</span>}</span>
                <div>
                  <p className="road-hubpath__name">{next.name}</p>
                  <p className="road-path__nextline">{next.label}</p>
                </div>
              </div>
              <Button variant="primary" iconBefore={IconSwords} onClick={() => router.push(next.href)}>Continue: {next.name}</Button>
              <ArrowLink href={`/pokemon-trainers/${next.region}`}>{`Your ${next.regionName} path`}</ArrowLink>
            </>
          ) : (
            <p className="road-path__lead">Every region cleared. Every trainer is still open for stars and the boards.</p>
          )}
        </div>
      </div>
    </section>
  );
}
