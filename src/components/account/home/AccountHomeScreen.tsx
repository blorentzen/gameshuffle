"use client";

/**
 * You ▸ Your home (menus and account picks 2026-11-05, 4A): the account's front page. First steps that fit your
 * interests (until they're done), what you're here for (the same tiles as sign-up, saved as they change), your games,
 * and the sections of your account: yours first, the rest under More, so nothing is out of reach.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Chip } from "@empac/cascadeds";
import { IconCheck } from "@tabler/icons-react";
import { AdminScreen, AdminSection } from "@/components/account/admin/AdminKit";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { InterestSettings } from "@/components/interests/InterestPicker";
import { useProfileStore } from "@/components/account/profile/ProfileStore";
import { ACCOUNT_SECTIONS, type AccountNavSection } from "@/lib/account/nav";
import type { Interest } from "@/lib/interests/rules";
import "@/styles/account-home.css";

interface Step { id: string; label: string; href: string; done: boolean }
interface State { interests: Interest[]; steps: Step[] }

/** Sections for these interests first (in the tiles' order), then everything else. */
export function sectionsByInterest(interests: Interest[]): { yours: AccountNavSection[]; more: AccountNavSection[] } {
  const all = ACCOUNT_SECTIONS.filter((s) => s.kind === "interest");
  const yours = all.filter((s) => s.interests?.some((i) => interests.includes(i)));
  return { yours, more: all.filter((s) => !yours.includes(s)) };
}

export function AccountHomeScreen() {
  const [state, setState] = useState<State | null>(null);
  const [failed, setFailed] = useState(false);
  const { fields, loading } = useProfileStore();

  useEffect(() => {
    let live = true;
    void fetch("/api/account/interests?steps=1", { cache: "no-store" }).then((r) => r.json()).catch(() => null)
      .then((j: { ok?: boolean; interests?: Interest[] | null; suggested?: Interest[]; steps?: Step[] } | null) => {
        if (!live) return;
        if (!j?.ok) { setFailed(true); return; }
        setState({ interests: j.interests ?? j.suggested ?? [], steps: j.steps ?? [] });
      });
    return () => { live = false; };
  }, []);

  const { yours, more } = sectionsByInterest(state?.interests ?? []);
  const open = state?.steps.filter((s) => !s.done).length ?? 0;

  return (
    <AdminScreen title="Your home" intro="What you're here for decides what you see first on GameShuffle. Change it any time.">
      {failed && <p className="acct-note">This page couldn&apos;t be loaded. Try again in a moment.</p>}
      {!failed && !state && <p className="acct-note" role="status">Loading…</p>}

      {state && open > 0 && (
        <AdminSection title="Your first steps">
          <ol className="acct-home__steps">
            {state.steps.map((s, i) => (
              <li key={s.id} className={s.done ? "is-done" : undefined}>
                <span className="acct-home__num" aria-hidden="true">{s.done ? <IconCheck size={14} stroke={3} /> : i + 1}</span>
                <Link href={s.href}>{s.label}</Link>
                {s.done && <span className="sr-only"> (done)</span>}
              </li>
            ))}
          </ol>
        </AdminSection>
      )}

      {state && (
        <AdminSection title="What you're here for" intro="Pick any. Your menus, your home and this account follow it.">
          <InterestSettings initial={state.interests} onChange={(interests) => setState((s) => (s ? { ...s, interests } : s))} />
        </AdminSection>
      )}

      <AdminSection title="Your games" actions={<ArrowLink href="/account?tab=games">Change your games</ArrowLink>}>
        {!loading && fields.favoriteGames.length === 0 && (
          <p className="acct-note">Pick the games you play, so your randomizers and game night ideas come first.</p>
        )}
        {fields.favoriteGames.length > 0 && (
          <div className="acct-home__games">
            {fields.favoriteGames.map((g) => <Chip key={g} label={g} />)}
          </div>
        )}
      </AdminSection>

      {state && (
        <AdminSection title="Your sections">
          {yours.length > 0 ? (
            <ul className="acct-home__sections">
              {yours.map((s) => (
                <li key={s.route}>
                  <ArrowLink href={s.route}>{s.label}</ArrowLink>
                  <span>{s.line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="acct-note">Pick what you&apos;re here for and its sections come first.</p>
          )}
          {more.length > 0 && (
            <>
              <h3 className="acct-home__more">More</h3>
              <ul className="acct-home__sections acct-home__sections--more">
                {more.map((s) => (
                  <li key={s.route}>
                    <ArrowLink href={s.route}>{s.label}</ArrowLink>
                    <span>{s.line}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </AdminSection>
      )}
    </AdminScreen>
  );
}
