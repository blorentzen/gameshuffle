"use client";

/**
 * "Help us sort the answers": the one-time, optional audience step shown after
 * someone's first Chat Brain answer. Age group, gender and country, each with a
 * "prefer not to say", so boards can be recounted for an audience ("what people
 * aged 18 to 24 said"). Signed-in choices save to the account; signed-out ones
 * stay in the browser and travel with each answer. Never shown next to anyone's
 * answer.
 *
 * `useAudienceStep()` says whether to show it (not yet asked) and gives the
 * signed-out choices to send with answers.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Chip, Select } from "@empac/cascadeds";
import { IconUsersGroup } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { AGE_BANDS, COUNTRY_CODES, GENDERS, countryName } from "@/lib/chatbrain/audience";
import { EVENTS, track } from "@/lib/analytics/events";
import { loadLocalAudience, saveLocalAudience, type LocalAudience } from "@/lib/chatbrain/anon";

export function useAudienceStep() {
  const { user } = useAuth();
  const [asked, setAsked] = useState<boolean | null>(null);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [local, setLocal] = useState<LocalAudience | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/chat-brain/audience", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!alive || !j?.ok) return;
      setSuggested(j.suggestedCountry ?? null);
      if (user) setAsked(!!j.asked);
      else { const l = loadLocalAudience(); setLocal(l); setAsked(!!l); }
    }).catch(() => { if (alive) setAsked(true); });
    return () => { alive = false; };
  }, [user]);

  const done = useCallback((l: LocalAudience | null) => { setAsked(true); if (l) setLocal(l); }, []);
  return { needsAsking: asked === false, suggested, localAudience: user ? null : local, done, signedIn: !!user };
}

const NOT_SAID = "none";

export function AudienceStep({ suggested, signedIn, onDone }: { suggested: string | null; signedIn: boolean; onDone: (local: LocalAudience | null) => void }) {
  const toast = useToast();
  const [age, setAge] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [country, setCountry] = useState<string>(suggested ?? NOT_SAID);
  const [busy, setBusy] = useState(false);

  const countryOptions = useMemo(() => [
    { value: NOT_SAID, label: "Prefer not to say" },
    ...COUNTRY_CODES.map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label)),
  ], []);

  const finish = async (skip: boolean) => {
    const choice: LocalAudience = skip
      ? { ageBand: null, gender: null, country: null, countryChosen: true }
      : { ageBand: age, gender: gender === NOT_SAID ? null : gender, country: country === NOT_SAID ? null : country, countryChosen: true };
    setBusy(true);
    try {
      if (signedIn) {
        const j = await fetch("/api/chat-brain/audience", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(choice) }).then((r) => r.json()).catch(() => null);
        if (!j?.ok) { toast.error("Couldn't save that. Try again."); return; }
        onDone(null);
      } else {
        saveLocalAudience(choice);
        onDone(choice);
      }
      track(EVENTS.brainAudienceSaved, { skipped: skip });
      if (!skip) toast.success("Thanks! Your next answers count toward those boards.");
    } finally { setBusy(false); }
  };

  return (
    <div className="audience-step" role="group" aria-labelledby="audience-step-title">
      <div className="audience-step__head">
        <span className="audience-step__icon" aria-hidden><IconUsersGroup size={20} stroke={1.75} /></span>
        <div>
          <p id="audience-step-title" className="audience-step__title">Help us sort the answers</p>
          <p className="audience-step__note">Optional. It lets us build boards like &quot;what people aged 18 to 24 said&quot;. It&apos;s never shown with your answer.</p>
        </div>
      </div>
      <div className="audience-step__row">
        <span className="audience-step__label">Age</span>
        <div className="audience-step__chips">
          {AGE_BANDS.map((b) => <Chip key={b} size="small" label={b === "55+" ? "55+" : b.replace("-", " to ")} clickable selected={age === b} onClick={() => setAge(age === b ? null : b)} />)}
        </div>
      </div>
      <div className="audience-step__row">
        <span className="audience-step__label">Gender</span>
        <div className="audience-step__chips">
          {GENDERS.map((g) => <Chip key={g.value} size="small" label={g.label} clickable selected={gender === g.value} onClick={() => setGender(gender === g.value ? null : g.value)} />)}
          <Chip size="small" label="Prefer not to say" clickable selected={gender === NOT_SAID} onClick={() => setGender(gender === NOT_SAID ? null : NOT_SAID)} />
        </div>
      </div>
      <div className="audience-step__row">
        <span className="audience-step__label">Country</span>
        <div className="audience-step__select">
          <Select options={countryOptions} value={country} onChange={(v) => setCountry(String(v))} searchable aria-label="Country" />
        </div>
      </div>
      <div className="party-row">
        <Button size="small" variant="primary" disabled={busy} onClick={() => void finish(false)}>Save</Button>
        <Button size="small" variant="ghost" disabled={busy} onClick={() => void finish(true)}>Skip</Button>
      </div>
    </div>
  );
}
