"use client";

/** Your country on your own times page (round 3 pick 6A): one pick, saved as you choose it. */

import { useMemo, useState } from "react";
import { FormField } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { countryName } from "@/lib/lounge/countries";

export function TtCountryPicker({ initial, codes }: { initial: string | null; codes: string[] }) {
  const [country, setCountry] = useState(initial ?? "");
  const toast = useToast();
  const options = useMemo(() => [{ value: "", label: "Not set" }, ...codes.map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label))], [codes]);
  async function save(next: string) {
    const was = country;
    setCountry(next);
    const res = await fetch("/api/time-trials/country", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country: next || null }) });
    if (res.ok) toast.success(next ? `Saved: ${countryName(next)}` : "Country cleared");
    else { setCountry(was); toast.error("Your country couldn't be saved. Try again."); }
  }
  return (
    <FormField label="Your country" htmlFor="tt-my-country" helperText="For the country boards and national records.">
      <Select id="tt-my-country" value={country} options={options} onChange={(v) => void save(String(v))} searchable fullWidth />
    </FormField>
  );
}
