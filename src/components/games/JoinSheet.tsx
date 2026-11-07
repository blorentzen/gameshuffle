"use client";

/**
 * The sign-up sheet for game spaces (journeys picks 2026-11-06, 4A): a visitor taps an action (Join, check in, add a
 * time, write a post, react) and, instead of leaving for /signup, a sheet over the page shows what they tapped and
 * what a free account keeps, with Discord, Twitch (and Facebook when on), email and Log in. Every way back returns to
 * the space with `?then=<action>` (plus any `params`, such as the tab), and the space finishes it (`useThen`): checked
 * in, joined, the add form open, the composer ready, the reaction sent. A new account then gets "What brings you
 * here?" in a window (`NewMemberSheet`). CDS Modal, shown as a sheet from the bottom on phones.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, Modal } from "@empac/cascadeds";
import { IconMail } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { startOAuth } from "@/lib/auth/oauth";
import { useSignInProviders } from "@/lib/auth/providers";
import { InterestSettingsLoader } from "@/components/interests/InterestPicker";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/join-sheet.css";

/** join, checkin, tt-day, tt-cup, addtime, post, react: whatever the page finishes with `useThen`. */
export type SpaceAction = string;

export interface SheetContext {
  /** What they tapped ("I won a race with it"). */
  title: string;
  /** Under it ("Combo of the day · 10 tokens"). */
  line?: string;
  img?: string | null;
}

export function JoinSheet({ open, onClose, space, action, heading, body, context, params }: {
  open: boolean;
  onClose: () => void;
  space: string;
  action: SpaceAction;
  heading: string;
  body: string;
  context?: SheetContext;
  /** More of the address to come back to, such as `{ tab: "posts" }`. */
  params?: Record<string, string>;
}) {
  const providers = useSignInProviders();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const back = `/games/${space}?${new URLSearchParams({ ...params, then: action })}`;
  const enc = encodeURIComponent(back);

  async function oauth(id: (typeof providers)[number]["id"]) {
    setBusy(id);
    setProblem(null);
    track(EVENTS.signupStarted, { from: `space-sheet-${action}`, provider: id });
    const failed = await startOAuth(id, `${window.location.origin}/auth/callback?redirect=${enc}`, { surface: "space-sheet" });
    if (failed) { setProblem(failed); setBusy(null); }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={heading} size="small" className="join-sheet">
      <div className="join-sheet__body">
        {context && (
          <div className="join-sheet__ctx">
            {/* eslint-disable-next-line @next/next/no-img-element -- our game art */}
            {context.img && <img src={context.img} alt="" />}
            <span><b>{context.title}</b>{context.line && <small>{context.line}</small>}</span>
          </div>
        )}
        <p>{body}</p>
        <div className="join-sheet__ways">
          {providers.map((p) => (
            <Button key={p.id} variant="primary" fullWidth disabled={!!busy} onClick={() => void oauth(p.id)} className={`join-sheet__oauth join-sheet__oauth--${p.id}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the provider's mark */}
              <img src={p.icon} alt="" width={20} height={20} />
              {busy === p.id ? "Opening…" : `Continue with ${p.label}`}
            </Button>
          ))}
          <a className="join-sheet__email" href={`/signup?redirect=${enc}`} onClick={() => track(EVENTS.signupStarted, { from: `space-sheet-${action}`, provider: "email" })}>
            <IconMail size={20} stroke={1.8} aria-hidden="true" />Use email
          </a>
        </div>
        {problem && <p className="join-sheet__problem" role="alert">{problem}</p>}
        <p className="join-sheet__fine">Have an account? <a href={`/login?redirect=${enc}`}>Log in</a></p>
      </div>
    </Modal>
  );
}

/** "Join free" for visitors: opens the sheet for joining this space (the game band, the space's slots row). */
export function JoinFreeButton({ space, name, className, children }: { space: string; name: string; className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`join-free-btn${className ? ` ${className}` : ""}`} onClick={() => setOpen(true)} aria-haspopup="dialog">{children ?? "Join free"}</button>
      <JoinSheet
        open={open} onClose={() => setOpen(false)} space={space} action="join"
        heading={`Join the ${name} space`}
        body="Free. Your times, builds and streaks stay here, and you hear when a cup or a night starts."
      />
    </>
  );
}

const noop = () => () => {};
/** One run per page load and action, however many buttons use it (Join is in the header and the sticky bar). */
const handled = new Set<string>();

/** The action to finish after signing in (`?then=` on the space), read after hydration. */
export function useThenParam(): string | null {
  return useSyncExternalStore(noop, () => new URLSearchParams(window.location.search).get("then"), () => null);
}

/**
 * Runs `run` once when the page came back from the sheet with `?then=<action>` and the viewer is signed in, then takes
 * `then` out of the address so a reload doesn't do it twice.
 */
export function useThen(action: SpaceAction, signedIn: boolean, run: () => void) {
  const then = useThenParam();
  const done = useRef(false);
  const latest = useRef(run);
  useEffect(() => { latest.current = run; });
  useEffect(() => {
    if (done.current || !signedIn || then !== action || handled.has(action)) return;
    done.current = true;
    handled.add(action);
    const t = window.setTimeout(() => {
      latest.current();
      const url = new URL(window.location.href);
      url.searchParams.delete("then");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }, 0);
    return () => window.clearTimeout(t);
  }, [then, action, signedIn]);
}

/** After the sheet brought a brand-new account back (made in the last 15 minutes): "What brings you here?". */
export function NewMemberSheet() {
  const { user } = useAuth();
  const then = useThenParam();
  const [closed, setClosed] = useState(false);
  const created = user?.created_at ? Date.parse(user.created_at) : 0;
  const [now] = useState(() => Date.now());
  const fresh = !!then && !!user && created > 0 && now - created < 15 * 60_000;
  return (
    <Modal isOpen={fresh && !closed} onClose={() => setClosed(true)} title="What brings you here?" size="medium" className="join-sheet join-sheet--interests">
      <div className="join-sheet__body">
        <p>Pick any. Your home and menus follow it, and you can change it in Settings.</p>
        <InterestSettingsLoader />
        <Button variant="primary" fullWidth onClick={() => setClosed(true)}>Done</Button>
      </div>
    </Modal>
  );
}
