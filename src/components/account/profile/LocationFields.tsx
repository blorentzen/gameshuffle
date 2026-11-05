"use client";

/**
 * Region or location, and the account's country (time trials round 4, picks 2026-11-04, 2A and 6A). The location is a
 * place search at city or region level (never an address), and stays free text if you'd rather type; picking a place
 * sets your country. The country is the account's one country: a flag on time trials boards and national records,
 * shared with time trials and the Competitive bot. Profiles show the place, never a map.
 */

import { useEffect, useMemo, useState } from "react";
import { AdminField } from "@/components/account/admin/AdminKit";
import { PlaceAutocompleteInput } from "@/components/maps/PlaceAutocompleteInput";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { countryCodes } from "@/lib/lounge/flags";
import { countryName } from "@/lib/lounge/countries";

export function LocationFields({ location, onLocation }: { location: string; onLocation: (text: string) => void }) {
  const [ready, setReady] = useState(false);
  const [country, setCountry] = useState("");
  const toast = useToast();
  const codes = useMemo(() => new Set(countryCodes().filter((c) => /^[a-z]{2}$/.test(c))), []);
  const options = useMemo(() => [{ value: "", label: "Not set" }, ...[...codes].map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label))], [codes]);

  useEffect(() => {
    let live = true;
    fetch("/api/account/country").then((r) => r.json()).then((j: { ok?: boolean; ready?: boolean; country?: string | null }) => {
      if (!live || !j.ok) return;
      setReady(!!j.ready);
      setCountry(j.country ?? "");
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  async function saveCountry(next: string) {
    const was = country;
    if (next === was) return;
    setCountry(next);
    const res = await fetch("/api/account/country", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country: next || null }) });
    if (res.ok) toast.success(next ? `Country: ${countryName(next)}` : "Country cleared");
    else { setCountry(was); toast.error("Your country couldn't be saved. Try again."); }
  }

  return (
    <>
      <AdminField label="Region or location" helper={ready ? "A city or region. Picking one from the list sets your country." : undefined}>
        {(id) => (
          <PlaceAutocompleteInput
            id={id}
            regions
            value={location}
            onChange={onLocation}
            onPick={(p) => { if (ready && p.country && codes.has(p.country)) void saveCountry(p.country); }}
            placeholder="Portland, Oregon"
          />
        )}
      </AdminField>
      {ready && (
        <AdminField label="Country" helper="Shows as a flag on time trials boards and puts your times on your country's records.">
          {(id) => <Select id={id} value={country} options={options} onChange={(v) => void saveCountry(String(v))} searchable fullWidth />}
        </AdminField>
      )}
    </>
  );
}
