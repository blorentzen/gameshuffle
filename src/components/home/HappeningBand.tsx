"use client";

/**
 * "What's happening on GameShuffle" (room picks 2026-11-05: air + discovery, then motion + balance, all A): the
 * worlds as tabs (CDS Tabs, pills), each with three slots from src/lib/home/happening.ts (what's happening, one new
 * thing, things for you to do; "Start something" when it's quiet).
 *
 * Motion with intention (1A, 2A, 5A): when the band moves to another world its cards are dealt in one after another
 * while the tab you picked fills (and the last one empties); live things carry a breathing dot; nothing moves with
 * reduced motion. It changes world only when you pick one (it used to roll on by itself every 6 seconds; Britton,
 * 2026-11-07: no auto scrolling). Each tab fills in place: a white pill that slid between tabs looked broken, since the
 * tabs' text changed color before the pill arrived (Britton, 2026-11-07: fill/unfill instead of jumping between).
 *
 * Alive, not overwhelming (Britton's note): signed in, it asks for fresh things every 3 minutes while it's on screen.
 * Something new in one of your worlds gets a dot on its tab and "Just now" on its card, at most one a check, and a
 * world you're looking at only changes when you next come to it.
 *
 * Signed in, a world you don't follow offers "More of this" (adds its interest; the tab's "New to you" goes and the
 * foot says so, with Undo) and "Not for me" (hidden in this browser, Undo in a toast). Event cards share their
 * picture with the page they open (React's <ViewTransition>, 3A).
 */

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, ViewTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Tabs } from "@empac/cascadeds";
import {
  IconArrowsShuffle, IconBroadcast, IconCards, IconChartBar, IconCheck, IconClock, IconDeviceTv, IconDice5, IconFlag, IconFlame,
  IconPlus, IconPokeball, IconQuestionMark, IconRoute, IconSitemap, IconSofa, IconSwords, IconUsersGroup, IconX, type Icon,
} from "@tabler/icons-react";
import { TrainerArt } from "@/components/originals/duel/TrainerArt";
import { useToast } from "@/components/toast/ToastProvider";
import { PILLARS, PILLAR_INTERESTS, type PillarId } from "@/lib/nav/pillars";
import type { Interest } from "@/lib/interests/rules";
import type { Happening, HappeningWorld, ToneIcon } from "@/lib/home/happening";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/duel-art.css";
import "@/styles/happening.css";

const WORLD_ICON: Record<PillarId, Icon> = { play: IconDice5, pokemon: IconPokeball, compete: IconFlag, host: IconSofa, stream: IconBroadcast };
const TONE_DEFAULT = { shuffle: IconArrowsShuffle, dex: IconPokeball, fire: IconFlame, duel: IconSwords, teal: IconClock, magenta: IconUsersGroup } as const;
const GLYPH: Record<ToneIcon, Icon> = {
  dice: IconDice5, flag: IconFlag, pokeball: IconPokeball, sofa: IconSofa, broadcast: IconBroadcast, clock: IconClock, question: IconQuestionMark,
  bracket: IconSitemap, tv: IconDeviceTv, flame: IconFlame, cards: IconCards, route: IconRoute, users: IconUsersGroup, chart: IconChartBar,
};
const SLOT_LABEL = { new: "New", do: "For you", start: "Start" } as const;
const STEP_MS = 6000;
const CHECK_MS = 3 * 60_000;

const SKIP_KEY = "gs-band-skip";
const listeners = new Set<() => void>();
const readSkip = () => { try { return localStorage.getItem(SKIP_KEY) ?? ""; } catch { return ""; } };
const noopSubscribe = () => () => {};
const readStored = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeSkip = (ids: string[]) => { try { localStorage.setItem(SKIP_KEY, ids.join(",")); } catch { /* private mode */ } listeners.forEach((l) => l()); };

/** The shared name an event's picture carries into its page (the page wraps its header picture in the same name). */
export const eventArtName = (id: string) => (id.startsWith("t:") ? `event-art-t-${id.slice(2)}` : id.startsWith("n:") ? `event-art-n-${id.slice(2)}` : null);

/**
 * One card: a link, or (`onPress`) a button for something that starts in one tap (a night with friends). Pictures are
 * our own art, a game's key art or box art, a trainer's card picture, or a Pokémon card's art window (`card`, credited).
 */
export function HappeningCard({ h, from, fresh = false, k = 0, onPress, track: trackAs = "band" }: {
  h: Happening; from: string; fresh?: boolean; k?: number;
  onPress?: () => void;
  /** Where the click is counted ("band" by default; "next" for the picks after the dailies). */
  track?: string;
}) {
  const art = h.art;
  const Glyph = art.kind === "tone" ? (art.icon ? GLYPH[art.icon] : TONE_DEFAULT[art.tone]) : null;
  const vt = eventArtName(h.id);
  const picture = art.kind === "img"
    // eslint-disable-next-line @next/next/no-img-element -- our own art, box art, or an event's cover
    ? <img className={`hap__img${art.light ? " hap__img--light" : ""}`} src={art.src} alt="" loading="lazy" style={art.focus ? { objectPosition: art.focus } : undefined} />
    : art.kind === "trainer" ? <TrainerArt picture={art.picture} shape="banner" className="hap__img" />
      : art.kind === "card" ? (
        <span className={`hap__img hap__card${art.fullArt ? " hap__card--full" : ""}`} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- a Scrydex card image (medium), cropped to its art in CSS */}
          <img src={art.src} alt="" loading="lazy" />
        </span>
      ) : art.kind === "inset" ? (
        <span className={`hap__inset hap__inset--${art.fit}${art.images.length > 1 ? " hap__inset--pair" : ""}`} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own course and character art (small files, kept small) */}
          {art.images.map((src) => <img key={src} src={src} alt="" loading="lazy" />)}
        </span>
      ) : null;
  const slot = h.slot && h.slot !== "happening" ? h.slot : null;
  const tone = art.kind === "tone" || art.kind === "inset" ? ` hap--${art.tone}` : "";
  const className = `hap hap--${art.kind}${tone}${slot ? ` hap--${slot}` : ""}${onPress ? " hap--press" : ""}`;
  const count = () => track(EVENTS.homeSectionClicked, { to: `${trackAs}-${trackAs === "band" ? `${h.world}-${slot ?? "happening"}` : h.id.replace(/^next:/, "")}`, from });
  const body = (
    <>
      {picture && (vt ? <ViewTransition name={vt} share="event-art">{picture}</ViewTransition> : picture)}
      {Glyph && <span className="hap__glyph" aria-hidden="true"><Glyph size={24} stroke={1.8} /></span>}
      {h.faces && h.faces.length > 0 && (
        <span className="hap__faces" aria-hidden="true">
          {h.faces.map((f) => <Avatar key={f.name} size="small" src={f.avatar ?? undefined} initials={f.name.slice(0, 1).toUpperCase()} alt="" />)}
        </span>
      )}
      {slot && <span className={`hap__slot hap__slot--${slot}`}>{h.kicker === "New merch" ? "Merch" : SLOT_LABEL[slot]}</span>}
      <span className="hap__txt">
        <span className="hap__kick">
          {h.live && <span className="hap__live">Live</span>}
          {fresh ? "Just now" : h.kicker}
          {h.sample && <Badge variant="warning" size="small">Sample</Badge>}
        </span>
        <b className="hap__title">{h.title}</b>
        <span className="hap__line">{h.line}</span>
        {art.kind === "card" && <span className="hap__credit">Card art: {art.credit}</span>}
      </span>
    </>
  );
  return onPress
    ? <button type="button" className={className} style={{ "--k": k } as CSSProperties} onClick={() => { count(); onPress(); }}>{body}</button>
    : <Link href={h.href} className={className} style={{ "--k": k } as CSSProperties} onClick={count}>{body}</Link>;
}

export function HappeningBand({ worlds: initial, tone, signedIn, interests = [], heading, sub, order, remember, extra }: {
  worlds: HappeningWorld[];
  tone: "dark" | "light";
  signedIn: boolean;
  interests?: Interest[];
  /** An h2 for the band (visitors); the signed-in header names it with an aria-label. */
  heading?: string;
  /** A line under the heading. */
  sub?: string;
  /** A fixed order for the worlds (the front page: Play, Pokémon, Compete, Host, Stream); else the band's own. */
  order?: PillarId[];
  /** Remember the picked world in this browser under this key, and open on it next time (nothing is sent). */
  remember?: string;
  /** More for each world under its cards: the front page's four tool rows (front page picks 2026-11-07, 2A). */
  extra?: Partial<Record<PillarId, ReactNode>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const root = useRef<HTMLElement>(null);
  const skipRaw = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, readSkip, () => "");
  const skipped = new Set(skipRaw.split(",").filter(Boolean));
  // What's on screen, and what came in since (a world takes it in when you next come to it).
  const [shown, setShown] = useState(initial);
  const [incoming, setIncoming] = useState<HappeningWorld[] | null>(null);
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const visible = shown.filter((w) => w.mine || !skipped.has(w.id));
  const worlds = order ? [...visible].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : visible;
  // The remembered world (read after the first paint, so the server and the first render agree on the first world).
  const stored = useSyncExternalStore(noopSubscribe, () => (remember ? readStored(remember) : null), () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const active = picked ?? (stored && worlds.some((w) => w.id === stored) ? stored : worlds[0]?.id ?? "");
  const [dealt, setDealt] = useState(0);
  const [followed, setFollowed] = useState<Record<string, Interest[]>>({});
  const current = worlds.some((w) => w.id === active) ? active : worlds[0]?.id ?? "";
  const activeRef = useRef(current);
  useEffect(() => { activeRef.current = current; }, [current]);

  // A world comes on screen: it takes in what came in for it, and its cards are dealt in.
  const go = (id: string) => {
    if (id === current) return;
    const next = incoming?.find((w) => w.id === id);
    if (next) setShown((list) => list.map((w) => (w.id === id ? next : w)));
    setPicked(id);
    if (remember) { try { localStorage.setItem(remember, id); } catch { /* private mode */ } }
    setDealt((n) => n + 1);
    // Its "new" dot clears once you've moved on from it again (you saw it).
    window.setTimeout(() => setFresh((f) => { if (!f[id]) return f; const rest = { ...f }; delete rest[id]; return rest; }), STEP_MS);
  };

  // Every 3 minutes while on screen: anything new in your worlds (at most one marked a check).
  useEffect(() => {
    if (!signedIn) return;
    const known = new Set(initial.flatMap((w) => w.items.map((h) => h.id)));
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const j = (await fetch("/api/home/band", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { worlds?: HappeningWorld[] } | null;
      const got = j?.worlds;
      if (!got?.length) return;
      const newest = got.filter((w) => w.mine).flatMap((w) => w.items.filter((h) => !known.has(h.id) && (!h.slot || h.slot === "happening")).map((h) => ({ w: w.id, h })))
        .sort((a, b) => b.h.weight - a.h.weight)[0];
      got.forEach((w) => w.items.forEach((h) => known.add(h.id)));
      setIncoming(got);
      // Worlds you aren't looking at take it in now; the one on screen waits until you come back to it.
      setShown((list) => list.map((w) => (w.id === activeRef.current ? w : got.find((x) => x.id === w.id) ?? w)));
      if (newest) setFresh((f) => ({ ...f, [newest.w]: newest.h.id }));
    };
    const t = window.setInterval(() => void check(), CHECK_MS);
    return () => window.clearInterval(t);
    // Once per page: `initial` is the first paint's band.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  if (!worlds.length) return null;

  const save = (list: Interest[]) => fetch("/api/account/interests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interests: list }) }).then((r) => r.ok).catch(() => false);
  async function follow(world: PillarId) {
    const add = PILLAR_INTERESTS[world][0];
    if (!(await save([...new Set([...interests, add])]))) { toast.error("That didn't save. Try again."); return; }
    track(EVENTS.homeSectionClicked, { to: `band-follow-${world}` });
    // The band shows it took (its "New to you" goes, the foot says so); the room follows a moment later.
    setFollowed((f) => ({ ...f, [world]: interests }));
    window.setTimeout(() => router.refresh(), 1800);
  }
  async function undoFollow(world: PillarId) {
    const before = followed[world];
    if (!before || !(await save(before))) return;
    setFollowed((f) => { const rest = { ...f }; delete rest[world]; return rest; });
    router.refresh();
  }
  function skip(world: PillarId) {
    const list = [...skipped, world];
    writeSkip(list);
    track(EVENTS.homeSectionClicked, { to: `band-skip-${world}` });
    const name = PILLARS.find((p) => p.id === world)?.label ?? world;
    toast.info(`${name} won't show here.`, { action: { label: "Undo", onClick: () => writeSkip(list.filter((x) => x !== world)) } });
  }

  const tabs = worlds.map((w) => {
    const Glyph = WORLD_ICON[w.id];
    const href = PILLARS.find((p) => p.id === w.id)?.href ?? "/";
    return {
      id: w.id,
      label: w.label,
      icon: <Glyph size={18} stroke={2} aria-hidden="true" />,
      badge: w.newToYou && !followed[w.id] ? "New to you" : fresh[w.id] && w.id !== current ? "New" : undefined,
      content: (
        <div className="band__slide">
          <ul className={`band__row band__row--${Math.min(w.items.length, 3)}${dealt ? " band__row--deal" : ""}`} key={`${w.id}-${dealt}`}>
            {w.items.map((h, k) => <li key={h.id}><HappeningCard h={h} from={signedIn ? "home" : "visitor"} fresh={fresh[w.id] === h.id} k={k} /></li>)}
          </ul>
          {extra?.[w.id]}
          <div className="band__foot">
            {signedIn && !w.mine && (followed[w.id]
              ? <span className="band__took" role="status"><IconCheck size={18} stroke={2.5} aria-hidden="true" />{w.label} is on your home now. <button type="button" className="band__undo" onClick={() => void undoFollow(w.id)}>Undo</button></span>
              : (
                <>
                  <span>You don&apos;t follow {w.label} yet.</span>
                  <Button variant="secondary" size="small" className="band__chip" iconBefore={IconPlus} onClick={() => void follow(w.id)}>More of this</Button>
                  <Button variant="ghost" size="small" className="band__chip" iconBefore={IconX} onClick={() => skip(w.id)}>Not for me</Button>
                </>
              ))}
            <Link href={href} className="band__all">All of {w.label}</Link>
          </div>
        </div>
      ),
    };
  });

  return (
    <section
      ref={root}
      className={`band band--${tone}`}
      aria-label={heading ? undefined : "What's happening on GameShuffle"}
      aria-labelledby={heading ? "band-title" : undefined}
    >
      {heading && <h2 id="band-title" className="band__title">{heading}</h2>}
      {sub && <p className="band__sub">{sub}</p>}
      <Tabs tabs={tabs} activeTab={current} onChange={go} variant="pills" className="band__tabs" />
    </section>
  );
}
