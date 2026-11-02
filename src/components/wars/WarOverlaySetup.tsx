"use client";

/**
 * The war overlay's setup page (overlay looks picks 2026-10-31, https://claude.ai/artifact/978WaHqftmK17ogWAWe19J; Britton:
 * plenty to customize, with GS Pro or the monthly Supporter level as the obvious way to unlock more). A live preview on a
 * stream frame, the choices, and the OBS link with its size.
 *   Free choices go into the link itself. Signed in, "Save to my account" makes the link ?look=<id>, and every change
 *   after that saves itself, so OBS never needs a new link.
 *   Paid choices (brand themes, your colors, fonts, no GameShuffle line) can be tried in the preview; without looks the
 *   link shows their free version and "Keep these looks" offers GS Pro or Supporter. The look waits in this browser
 *   while someone signs up or checks out, and comes back with them.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Accordion, Button, Chip, Switch } from "@empac/cascadeds";
import { IconCopy, IconDeviceFloppy, IconLock, IconPlayerPlay } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { LookColorPicker } from "@/components/tools/looks/LookColorPicker";
import { KeepLooksPanel } from "@/components/mmr/KeepLooksPanel";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import type { DraftPlan } from "@/lib/mmr/draft";
import {
  cleanLook, DEFAULT_WAR_LOOK, layoutInfo, lookParams, MOMENT_LABELS, paidUsed, PIECE_LABELS, WAR_BRANDINGS, WAR_COLORS, WAR_FONTS, WAR_LAYOUTS,
  WAR_SURFACES, warFontSheet, type WarLayout, type WarLook,
} from "@/lib/wars/look";
import type { WarLiveData } from "@/lib/wars/types";
import { DEMO_DIFFS, demoWar, type DemoMoment, type DemoTeam } from "@/lib/wars/demo";
import { WarBoard, type WarPop } from "./WarOverlay";

type TeamRef = DemoTeam;
type Demo = DemoMoment;

/** Where each layout goes on a Mario Kart stream, clear of the game's own item box, coins and place. */
const WHERE: Record<WarLayout, string> = {
  bug: "bottom center, between the coins and the place.",
  strip: "across the top, above the item box.",
  corner: "a top corner, next to a camera or alerts.",
  list: "a side column, beside the game.",
};

const DRAFT_KEY = (token: string) => `gs-war-look:${token}`;
const readDraft = (token: string): WarLook | null => {
  try { const raw = localStorage.getItem(DRAFT_KEY(token)); return raw ? cleanLook(JSON.parse(raw)) : null; } catch { return null; }
};
const writeDraft = (token: string, look: WarLook) => { try { localStorage.setItem(DRAFT_KEY(token), JSON.stringify(look)); } catch { /* private window */ } };
const clearDraft = (token: string) => { try { localStorage.removeItem(DRAFT_KEY(token)); } catch { /* private window */ } };

const STEPS = [
  { id: "obs", title: "In OBS", content: <ol className="wsu-steps"><li>In Sources, press + and pick Browser.</li><li>Paste the link into URL, and type the width and height shown here.</li><li>Press OK, then drag it where you want it. Drag a corner to make it bigger or smaller; it stays sharp.</li></ol> },
  { id: "slobs", title: "In Streamlabs", content: <ol className="wsu-steps"><li>In Sources, press + and pick Browser Source.</li><li>Paste the link into URL, and type the width and height shown here.</li><li>Press Done, then drag it where you want it.</li></ol> },
];

export function WarOverlaySetup({ token, siteUrl, channel, server, live, teams, signedIn, looksOk, saved, canSave, then, checkout, pro, streamWar }: {
  token: string;
  siteUrl: string;
  channel: string | null;
  server: string | null;
  live: WarLiveData | null;
  teams: { us: TeamRef; them: TeamRef };
  signedIn: boolean;
  looksOk: boolean;
  saved: { id: string; look: WarLook }[];
  canSave: boolean;
  then: string | null;
  checkout: { result: "success" | "canceled"; plan: string } | null;
  /** GS Pro, for the war on the account's GameShuffle overlay. */
  pro: boolean;
  /** The war channel on the account's GameShuffle overlay now, if any. */
  streamWar: { token: string; lookId: string | null } | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [gs, setGs] = useState(streamWar);
  const [gsBusy, setGsBusy] = useState(false);
  const [ids, setIds] = useState<Partial<Record<WarLayout, string>>>(() => Object.fromEntries(saved.map((s) => [s.look.layout, s.id])));
  const [look, setLook] = useState<WarLook>(() => saved.find((s) => s.look.layout === "bug")?.look ?? saved[0]?.look ?? DEFAULT_WAR_LOOK);
  const [demo, setDemo] = useState<Demo>("now");
  const [pop, setPop] = useState<WarPop | null>(null);
  const [busy, setBusy] = useState(false);
  const popId = useRef(0);
  const loaded = useRef(false);

  // A look left here before signing up or checking out comes back (once), then the address is tidied.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const draft = readDraft(token);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read from this browser once, after loading
    if (draft) setLook(draft);
    if (checkout?.result === "success") toast.success(looksOk ? "Your looks are on. Save the overlay to keep them." : "Thanks! Your looks turn on in a moment.");
    if (checkout?.result === "canceled") toast.info("Checkout closed. Your overlay is still here.");
    if (then || checkout) {
      const url = new URL(window.location.href);
      for (const k of ["then", "checkout", "plan", "session_id"]) url.searchParams.delete(k);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [token, checkout, then, looksOk, toast]);

  const used = paidUsed(look);
  const id = ids[look.layout] ?? null;
  const info = layoutInfo(look.layout);
  const link = id ? `${siteUrl}/war/${token}?look=${id}` : `${siteUrl}/war/${token}${lookParams(look).toString() ? `?${lookParams(look).toString()}` : ""}`;
  const set = <K extends keyof WarLook>(k: K, v: WarLook[K]) => setLook((l) => ({ ...l, [k]: v }));
  const pick = (layout: WarLayout) => setLook((l) => ({ ...l, layout }));

  const save = async (value: WarLook): Promise<boolean> => {
    const res = await fetch("/api/war/looks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ look: value }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { id?: string } | null;
    if (!data?.id) return false;
    setIds((m) => ({ ...m, [value.layout]: data.id }));
    return true;
  };
  // Once a layout's look is saved, every change saves itself (the OBS link stays the same).
  useAutosave(look, save, { ready: signedIn && canSave && !!id, toast: false });

  const saveFirst = async () => {
    setBusy(true);
    const ok = await save(look);
    setBusy(false);
    if (ok) { track(EVENTS.warLookSaved, { layout: look.layout }); toast.success("Saved. Changes here now show up in OBS by themselves."); clearDraft(token); }
    else toast.error("Couldn't save it. Try again in a moment.");
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success("Copied. Paste it into a Browser source."); }
    catch { toast.info("Select the link and copy it."); }
    track(EVENTS.warOverlayCopied, { layout: look.layout, saved: !!id });
  };

  // The war on the account's own GameShuffle overlay (GS Pro): the POST saves this look and points the piece at it.
  const onOverlay = gs?.token === token;
  const gsLayout = onOverlay ? WAR_LAYOUTS.find((l) => ids[l.id] && ids[l.id] === gs?.lookId) ?? null : null;
  const addToOverlay = async () => {
    setGsBusy(true);
    const res = await fetch("/api/war/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, look }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { lookId?: string; error?: string } | null;
    setGsBusy(false);
    if (data?.lookId) {
      const lookId = data.lookId;
      setIds((m) => ({ ...m, [look.layout]: lookId }));
      setGs({ token, lookId });
      clearDraft(token);
      track(EVENTS.warPieceAdded, { layout: look.layout });
      toast.success("It's on your GameShuffle overlay. Move it in Streaming ▸ Overlay ▸ Layout.");
    } else toast.error(data?.error === "pro_required" ? "That comes with GS Pro." : "Couldn't add it. Try again in a moment.");
  };
  const takeOff = async () => {
    const ok = await confirm({ title: "Take the war off your overlay?", body: "It leaves your GameShuffle overlay. The OBS link above keeps working.", confirmLabel: "Take it off" });
    if (!ok) return;
    const res = await fetch("/api/war/stream", { method: "DELETE" }).catch(() => null);
    if (res?.ok) { setGs(null); toast.success("Taken off your GameShuffle overlay."); }
    else toast.error("Couldn't change it. Try again in a moment.");
  };

  const playMoment = (d: Demo) => {
    setDemo(d);
    setPop(d === "race" ? { id: ++popId.current, diff: DEMO_DIFFS[6] } : null);
    if (d === "race") window.setTimeout(() => setPop(null), 2200);
  };

  const war = demo === "now" && live ? live : demoWar(teams, demo === "now" ? "now" : demo);
  const sheet = warFontSheet(look);
  const place = `wsu-place wsu-place--${look.layout}`;
  const where = channel ? `#${channel}${server ? ` in ${server}` : ""}` : "this channel";
  const teamLabel = (t: TeamRef) => t.name || t.tag;
  const fontOptions = useMemo(() => WAR_FONTS.map((f) => ({ value: f.id, label: `${f.label}${f.paid && !looksOk ? " (paid)" : ""}` })), [looksOk]);
  const lock = (paid: boolean) => (paid && !looksOk ? <IconLock size={14} aria-hidden /> : undefined);

  return (
    <div className="wsu">
      {sheet && <link rel="stylesheet" href={sheet} />}
      <header className="wsu-head">
        <p className="wsu-eyebrow">GameShuffle Competitive</p>
        <h1>War overlay for {where}</h1>
        <p className="wsu-lede">It follows every war in this channel, in OBS or Streamlabs. Pick how it looks, then copy the link below.</p>
      </header>

      <div className="wsu-grid">
        <div className="wsu-preview">
          <div className="wsu-stage">
            <div className="wsu-scroll" tabIndex={0} role="region" aria-label={`Preview of the ${info.label.toLowerCase()}, at the size it shows on stream`}>
              <div className={place}><WarBoard war={war} look={look} pop={pop} animate={!!pop} /></div>
            </div>
          </div>
          <div className="wsu-where">
            <div className={`wsu-map wsu-map--${look.layout}`} aria-hidden="true"><i className="wsu-map__item" /><i className="wsu-map__coins" /><i className="wsu-map__place" /><b /></div>
            <p className="wsu-help">Where it sits: {WHERE[look.layout]}</p>
          </div>
          <div className="wsu-try">
            <span className="wsu-try__label">{demo === "now" && live ? "Showing this channel's war." : "Showing a made-up war."} Try a moment:</span>
            <div className="wsu-chips">
              {(["race", "caught", "final"] as Demo[]).map((d) => (
                <Chip key={d} clickable selected={demo === d} onClick={() => playMoment(d)} icon={<IconPlayerPlay size={14} aria-hidden />} label={d === "race" ? "A race lands" : d === "caught" ? "Can't be caught" : "Final"} />
              ))}
              {demo !== "now" && <Chip clickable onClick={() => playMoment("now")} label="Back" />}
            </div>
          </div>
        </div>

        <div className="wsu-controls">
          <section className="wsu-group" aria-labelledby="wsu-layout">
            <h2 id="wsu-layout">Layout</h2>
            <div className="wsu-chips">{WAR_LAYOUTS.map((l) => <Chip key={l.id} clickable selected={look.layout === l.id} onClick={() => pick(l.id)} label={l.label} />)}</div>
            <p className="wsu-help">{info.where}. In OBS: {info.size[0]} wide, {info.size[1]} tall.</p>
          </section>

          <section className="wsu-group" aria-labelledby="wsu-look">
            <h2 id="wsu-look">Look</h2>
            <div className="wsu-chips">{WAR_SURFACES.map((s) => <Chip key={s.id} clickable selected={look.surface === s.id} onClick={() => set("surface", s.id)} label={s.label} />)}</div>
          </section>

          <section className="wsu-group" aria-labelledby="wsu-colors">
            <h2 id="wsu-colors">Colors</h2>
            <div className="wsu-chips">{WAR_COLORS.map((c) => <Chip key={c.id} clickable selected={look.colors === c.id} onClick={() => set("colors", c.id)} label={c.label} icon={lock(c.paid)} />)}</div>
            {look.colors === "custom" && (
              <div className="wsu-colors">
                <LookColorPicker label="First color" value={look.c1} onChange={(v) => set("c1", v)} presets={[{ value: "#8cc8f0", label: "Ice" }, { value: "#2b52d6", label: "Blue" }, { value: "#d9363e", label: "Red" }, { value: "#2fa36b", label: "Green" }]} />
                <LookColorPicker label="Second color" value={look.c2} onChange={(v) => set("c2", v)} presets={[{ value: "#f2c14e", label: "Gold" }, { value: "#c949e9", label: "Magenta" }, { value: "#ff7a2f", label: "Orange" }, { value: "#ffffff", label: "White" }]} />
              </div>
            )}
            {!looksOk && <p className="wsu-help"><IconLock size={14} aria-hidden /> Brand themes and your own colors come with GS Pro or Supporter looks. Try them here first.</p>}
          </section>

          <section className="wsu-group" aria-labelledby="wsu-font">
            <h2 id="wsu-font">Font for the numbers</h2>
            <Select options={fontOptions} value={look.font} onChange={(v) => set("font", (Array.isArray(v) ? v[0] : v) as WarLook["font"])} fullWidth aria-label="Font for the numbers" />
          </section>

          <section className="wsu-group" aria-labelledby="wsu-left">
            <h2 id="wsu-left">On the left</h2>
            <div className="wsu-chips">
              <Chip clickable selected={look.side === "us"} onClick={() => set("side", "us")} label={`${teamLabel(teams.us)} (this channel's team)`} />
              <Chip clickable selected={look.side === "them"} onClick={() => set("side", "them")} label={teamLabel(teams.them)} />
            </div>
            <p className="wsu-help">For the other team&apos;s stream, put their team on the left.</p>
          </section>

          <section className="wsu-group" aria-labelledby="wsu-pieces">
            <h2 id="wsu-pieces">What&apos;s on it</h2>
            <div className="wsu-switches">{PIECE_LABELS.map((p) => <Switch key={p.id} label={p.label} checked={look.pieces[p.id]} onChange={(e) => set("pieces", { ...look.pieces, [p.id]: e.target.checked })} />)}</div>
          </section>

          <section className="wsu-group" aria-labelledby="wsu-moments">
            <h2 id="wsu-moments">Moments</h2>
            <div className="wsu-switches">{MOMENT_LABELS.map((m) => <Switch key={m.id} label={m.label} checked={look.moments[m.id]} onChange={(e) => set("moments", { ...look.moments, [m.id]: e.target.checked })} />)}</div>
          </section>

          <section className="wsu-group" aria-labelledby="wsu-brand">
            <h2 id="wsu-brand">GameShuffle line</h2>
            <div className="wsu-chips">{WAR_BRANDINGS.map((b) => <Chip key={b.id} clickable selected={look.brand === b.id} onClick={() => set("brand", b.id)} label={b.label} icon={lock(b.paid)} />)}</div>
          </section>
        </div>
      </div>

      {!looksOk && used.length > 0 && (
        <div className="wsu-keep">
          <KeepLooksPanel used={used} guest={!signedIn} autoPlan={then === "pro" || then === "supporter" || then === "backer" || then === "free" ? (then as DraftPlan) : null} beforeLeave={() => writeDraft(token, look)} returnTo={`/war-overlay/${token}`} from="war-keep-looks" noun="overlay" />
        </div>
      )}

      <section className="wsu-link" aria-labelledby="wsu-link-title">
        <h2 id="wsu-link-title">Your OBS link</h2>
        <code className="wsu-url">{link}</code>
        <div className="wsu-link__row">
          <span>Width {info.size[0]} · Height {info.size[1]}</span>
          <div className="wsu-link__buttons">
            {signedIn && canSave && !id && <Button variant="secondary" iconBefore={IconDeviceFloppy} loading={busy} onClick={saveFirst}>Save to my account</Button>}
            <Button variant="primary" iconBefore={IconCopy} onClick={copy}>Copy link</Button>
          </div>
        </div>
        <p className="wsu-help">
          {id
            ? "Saved to your account: changes you make here show up in OBS by themselves."
            : signedIn
              ? "This link holds today's choices. Save to your account and later changes show up without a new link."
              : "This link holds today's choices. Sign in to save them, so later changes show up without a new link."}
          {!looksOk && used.length > 0 ? " Until you unlock looks, the link shows the free version." : ""}
        </p>
        <Accordion variant="flush" items={STEPS} />
      </section>

      <section className="wsu-link wsu-gs" aria-labelledby="wsu-gs-title">
        <h2 id="wsu-gs-title">On your GameShuffle overlay</h2>
        <p className="wsu-help">Already have the GameShuffle overlay in OBS? Put the war score on it instead of adding another source. It follows this channel in this look, and you move it in Streaming ▸ Overlay ▸ Layout.</p>
        {!signedIn ? (
          <p className="wsu-gs__line">Sign in with the account you stream from to add it. <ArrowLink href={`/login?redirect=${encodeURIComponent(`/war-overlay/${token}`)}`}>Sign in</ArrowLink></p>
        ) : !pro ? (
          <ProTrialPrompt compact from="war-overlay-piece" title="The war score on your GameShuffle overlay comes with GS Pro">
            <p>Its own OBS link above stays free.</p>
          </ProTrialPrompt>
        ) : !canSave ? null : onOverlay ? (
          <>
            <p className="wsu-gs__line">
              On your GameShuffle overlay{gsLayout ? ` as the ${gsLayout.label}` : ""}.
              {gsLayout && gsLayout.id === look.layout ? " Changes here show up there by themselves." : ""}
            </p>
            <div className="wsu-link__buttons">
              {gsLayout?.id !== look.layout && <Button variant="secondary" loading={gsBusy} onClick={addToOverlay}>Show the {info.label} there instead</Button>}
              <ArrowLink href="/account/streaming?tab=overlay-layout">Place it on your overlay</ArrowLink>
              <Button variant="ghost" onClick={takeOff}>Take it off</Button>
            </div>
          </>
        ) : (
          <div className="wsu-link__buttons">
            <Button variant="secondary" loading={gsBusy} onClick={addToOverlay}>Add to my GameShuffle overlay</Button>
            {gs && <span className="wsu-help">It replaces the war channel on it now.</span>}
          </div>
        )}
      </section>
    </div>
  );
}
