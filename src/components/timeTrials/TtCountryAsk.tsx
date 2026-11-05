"use client";

/**
 * Asked once on the time trials home (round 4, picks 2026-11-04): a player with times and no country picks one, so
 * their times count on their country's records. Closing it is "not now" for good; the add form still offers the
 * field until a country is set.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, FormField } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { countryCodes } from "@/lib/lounge/flags";
import { countryName } from "@/lib/lounge/countries";

export function TtCountryAsk({ suggest }: { suggest: string | null }) {
  const [shown, setShown] = useState(true);
  const [country, setCountry] = useState(suggest ?? "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const options = useMemo(() => countryCodes().filter((c) => /^[a-z]{2}$/.test(c)).map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label)), []);
  if (!shown) return null;

  const post = (body: Record<string, unknown>) => fetch("/api/time-trials/country", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  async function save() {
    if (!country) return;
    setBusy(true);
    try {
      const res = await post({ country });
      if (!res.ok) { toast.error("Your country couldn't be saved. Try again."); return; }
      toast.success(`Saved: ${countryName(country)}`);
      setShown(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Alert variant="info" title="Add your country" className="tt-country-ask" onClose={() => { setShown(false); void post({ notNow: true }); }}>
      <p>Your times then count on your country&apos;s records, with a flag by your name.</p>
      <form className="tt-country-ask__row" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <FormField label="Country" htmlFor="tt-country-ask">
          <Select id="tt-country-ask" value={country} onChange={(v) => setCountry(String(v))} options={options} searchable fullWidth />
        </FormField>
        <Button type="submit" variant="primary" loading={busy} disabled={!country}>Save</Button>
      </form>
    </Alert>
  );
}
