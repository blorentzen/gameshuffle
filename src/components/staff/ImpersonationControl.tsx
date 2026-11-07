"use client";

/**
 * Staff-only "View as" control: a badge in the bottom-right corner that opens a CDS Popover.
 *   - Me: your own account, as it is or as Free / GS Pro (the older tier cookies).
 *   - Visitor: the signed-out site while you stay signed in.
 *   - Persona (menus and account picks 2026-11-05, 6A): pick interests, a plan and whether sections you have nothing
 *     in show sample data; presets for the six personas. Never saved to your account (src/lib/preview).
 *   - Test accounts (dev database only): sign in as one of six seeded persona accounts with real activity.
 * Applying POSTs to /api/staff/impersonate (or /api/staff/persona-account) and reloads, so server-rendered pages,
 * the strip and capability checks all follow.
 */

import { useState } from "react";
import { Button, Chip, Popover } from "@empac/cascadeds";
import { INTERESTS, type Interest } from "@/lib/interests/rules";
import { PERSONA_PRESETS, PREVIEW_PLANS, presetOf, type PersonaPreview, type PreviewPlan } from "@/lib/preview/persona";
import type { DevPersonaAccount } from "@/lib/preview/devAccounts";
import type { SubscriptionTier } from "@/lib/subscription";

type Option = "default" | "pro" | "free" | "unauth" | "persona";
type Who = "me" | "visitor" | "persona";

interface ImpersonationControlProps {
  currentOption: Option;
  /** The preview in effect when `currentOption` is "persona". */
  persona: PersonaPreview | null;
  /** Test persona accounts, only on the dev database. */
  devAccounts: DevPersonaAccount[] | null;
}

/** A pressable CDS Chip; the picked one wears the primary color so it reads at a glance. */
function Pick({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return <Chip label={label} clickable selected={on} variant={on ? "primary" : "default"} onClick={onClick} />;
}

const BADGE: Record<Option, string> = { default: "Staff", pro: "As Pro", free: "As Free", unauth: "As visitor", persona: "As persona" };

export function ImpersonationControl({ currentOption, persona, devAccounts }: ImpersonationControlProps) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Who>(currentOption === "unauth" ? "visitor" : currentOption === "persona" ? "persona" : "me");
  const [myPlan, setMyPlan] = useState<"real" | "free" | "pro">(currentOption === "free" || currentOption === "pro" ? currentOption : "real");
  const [interests, setInterests] = useState<Set<Interest>>(() => new Set(persona?.interests ?? ["competitive"]));
  const [plan, setPlan] = useState<PreviewPlan>(persona?.plan ?? "free");
  const [sample, setSample] = useState(persona?.sample ?? true);
  const [working, setWorking] = useState<string | null>(null);

  const draft: PersonaPreview = { interests: INTERESTS.map((i) => i.id).filter((id) => interests.has(id)), plan, sample };
  const preset = presetOf(draft);

  const post = async (key: string, url: string, body: unknown) => {
    setWorking(key);
    try {
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } finally {
      window.location.reload();
    }
  };

  const apply = () => {
    if (who === "visitor") return post("apply", "/api/staff/impersonate", { option: "unauth" });
    if (who === "persona") return post("apply", "/api/staff/impersonate", { option: "persona", interests: draft.interests, plan, sample });
    return post("apply", "/api/staff/impersonate", { option: myPlan === "real" ? "default" : myPlan });
  };

  const toggleInterest = (id: Interest) => setInterests((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const applyPreset = (p: PersonaPreview) => { setInterests(new Set(p.interests)); setPlan(p.plan); setSample(p.sample); };

  const content = (
    <div className="view-as">
      <p className="view-as__title">View as</p>

      <div className="view-as__group" role="group" aria-label="Who">
        <Pick label="Me" on={who === "me"} onClick={() => setWho("me")} />
        <Pick label="Visitor" on={who === "visitor"} onClick={() => setWho("visitor")} />
        <Pick label="Persona" on={who === "persona"} onClick={() => setWho("persona")} />
      </div>

      {who === "me" && (
        <section className="view-as__section" aria-label="Plan">
          <p className="view-as__label">Plan</p>
          <div className="view-as__group">
            <Pick label="As I am" on={myPlan === "real"} onClick={() => setMyPlan("real")} />
            <Pick label="Free" on={myPlan === "free"} onClick={() => setMyPlan("free")} />
            <Pick label="GS Pro" on={myPlan === "pro"} onClick={() => setMyPlan("pro")} />
          </div>
        </section>
      )}

      {who === "visitor" && <p className="view-as__note">The signed-out site, while you stay signed in.</p>}

      {who === "persona" && (
        <>
          <section className="view-as__section" aria-label="Start from">
            <p className="view-as__label">Start from</p>
            <div className="view-as__group">
              {PERSONA_PRESETS.map((p) => (
                <Pick key={p.id} label={p.label} on={preset === p.id} onClick={() => applyPreset(p.preview)} />
              ))}
            </div>
          </section>
          <section className="view-as__section" aria-label="Interests">
            <p className="view-as__label">Interests</p>
            <div className="view-as__group">
              {INTERESTS.map((i) => (
                <Pick key={i.id} label={i.label} on={interests.has(i.id)} onClick={() => toggleInterest(i.id)} />
              ))}
            </div>
          </section>
          <section className="view-as__section" aria-label="Plan">
            <p className="view-as__label">Plan</p>
            <div className="view-as__group">
              {PREVIEW_PLANS.map((p) => (
                <Pick key={p.id} label={p.label} on={plan === p.id} onClick={() => setPlan(p.id)} />
              ))}
            </div>
          </section>
          <section className="view-as__section" aria-label="Data">
            <p className="view-as__label">Data</p>
            <div className="view-as__group">
              <Pick label="Mine" on={!sample} onClick={() => setSample(false)} />
              <Pick label="Sample where I have none" on={sample} onClick={() => setSample(true)} />
            </div>
          </section>
        </>
      )}

      <Button variant="primary" size="small" fullWidth loading={working === "apply"} disabled={working !== null} onClick={() => void apply()}>
        {who === "me" && myPlan === "real" ? "Back to my account" : "Show it"}
      </Button>

      {devAccounts && devAccounts.length > 0 && (
        <section className="view-as__section view-as__accounts" aria-label="Test accounts">
          <p className="view-as__label">Test accounts on dev</p>
          <p className="view-as__note">Sign in as one with real activity. Back to my account is at the top of every page.</p>
          <ul className="view-as__list">
            {devAccounts.map((a) => (
              <li key={a.handle} className="view-as__account">
                <span className="view-as__who"><strong>{a.name}</strong><span>{a.line}</span></span>
                <Button variant="secondary" size="small" loading={working === a.handle} disabled={working !== null}
                  onClick={() => void post(a.handle, "/api/staff/persona-account", { handle: a.handle })} aria-label={`Sign in as ${a.name}`}>
                  Sign in
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <a href="/staff/scenarios" className="view-as__link">Scenarios: visual QA across UI states</a>
    </div>
  );

  return (
    <div className="staff-impersonation-control">
      <Popover position="top" open={open} onOpenChange={setOpen} className="view-as-popover"
        trigger={<span className="staff-impersonation-control__badge">{BADGE[currentOption]}</span>}>
        {content}
      </Popover>
    </div>
  );
}

export type { Option as ImpersonationOption };
export type { SubscriptionTier };
