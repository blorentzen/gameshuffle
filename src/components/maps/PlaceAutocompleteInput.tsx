"use client";

/**
 * Address/venue field with Google Places autocomplete (modern Places API).
 * Shared across surfaces that take a physical location (board-game nights,
 * in-person tournaments).
 *
 * We drive our own input + suggestion dropdown via the Autocomplete Data API
 * (`AutocompleteSuggestion.fetchAutocompleteSuggestions`), rather than the
 * legacy `places.Autocomplete` widget — the legacy widget isn't enabled for API
 * keys created after March 2025. This also keeps the field a normal controlled
 * input so it prefills on edit and falls back to plain free-text when Maps is
 * unavailable.
 *
 * CDS note: the input is the CDS `Input`; only the suggestion dropdown is
 * bespoke (CDS has no Places-backed combobox). Flagged per AGENTS.md.
 */

import { useEffect, useRef, useState } from "react";
import { Input } from "@empac/cascadeds";
import { isGoogleMapsEnabled, loadGooglePlaces, type GooglePlacesApi, type GAutocompleteSuggestion } from "@/lib/maps/google";

export interface PlacePick { address: string; lat: number | null; lng: number | null }

interface Row { id: string; label: string; suggestion: GAutocompleteSuggestion }

export function PlaceAutocompleteInput({
  value,
  onChange,
  onPick,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  /** Fired when the user selects a suggestion (carries coords so callers that
   *  store a pin can skip a server geocode). */
  onPick: (pick: PlacePick) => void;
  placeholder?: string;
}) {
  const enabled = isGoogleMapsEnabled();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  // Surfaces a failure reason inline so it doesn't hide in the console.
  const [hint, setHint] = useState<string | null>(null);
  const placesRef = useRef<GooglePlacesApi | null>(null);
  const sessionRef = useRef<object | null>(null);
  const debounceRef = useRef<number | null>(null);
  // Suppress the fetch triggered by our own onChange right after a pick.
  const justPickedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      // Loudly explain the #1 cause: the NEXT_PUBLIC key must be present in the
      // CLIENT bundle, which means a redeploy (Vercel) or dev-server restart
      // AFTER the env var was added — server-side map embeds work without that.
      console.warn("[maps] autocomplete disabled — NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not in the client bundle. Redeploy (or restart `npm run dev`) after adding it.");
      return;
    }
    let cancelled = false;
    loadGooglePlaces()
      .then((places) => { if (!cancelled) { placesRef.current = places; console.info("[maps] Places library ready (autocomplete active)."); } })
      .catch((e) => {
        const msg = (e as Error)?.message || String(e);
        console.warn("[maps] Places library failed to load:", msg);
        if (cancelled) return;
        const HINTS: Record<string, string> = {
          gmaps_auth_failed: "Google rejected the key. Enable the Maps JavaScript API + Places API (New) for this project, and make sure the key's API-restriction list includes both.",
          gmaps_script_blocked: "The Maps script was blocked from loading (likely the site's Content-Security-Policy on this deploy). Redeploy so the updated CSP takes effect.",
          places_unavailable: "The Places library loaded but the new Places API isn't available — enable Places API (New) for this key.",
        };
        setHint(HINTS[msg] ?? `Address search couldn't load (${msg}). Check the Maps JavaScript API is enabled and the key allows this domain.`);
      });
    return () => { cancelled = true; if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [enabled]);

  const runSearch = (q: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const places = placesRef.current;
    if (!places || q.trim().length < 3) { setRows([]); setOpen(false); return; }
    debounceRef.current = window.setTimeout(async () => {
      try {
        if (!sessionRef.current) sessionRef.current = new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: sessionRef.current,
        });
        const next: Row[] = suggestions
          .filter((s) => s.placePrediction)
          .slice(0, 6)
          .map((s, i) => ({ id: String(i), label: s.placePrediction?.text?.toString() ?? "", suggestion: s }));
        setRows(next);
        setOpen(next.length > 0);
        setHint(null);
      } catch (e) {
        // Almost always "Places API (New) not enabled" or a referrer/key issue.
        const msg = (e as Error)?.message || String(e);
        console.warn("[maps] autocomplete request failed:", msg);
        setHint(`Address suggestions unavailable (${msg}). Most often this means the “Places API (New)” isn't enabled for this key in Google Cloud.`);
        setRows([]); setOpen(false);
      }
    }, 300);
  };

  const handleChange = (text: string) => {
    onChange(text);
    if (justPickedRef.current) { justPickedRef.current = false; return; }
    runSearch(text);
  };

  const pick = async (row: Row) => {
    const prediction = row.suggestion.placePrediction;
    setOpen(false);
    setRows([]);
    justPickedRef.current = true;
    if (!prediction) { onChange(row.label); return; }
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "displayName", "location"] });
      const address = place.formattedAddress || place.displayName || row.label;
      const loc = place.location;
      onChange(address);
      onPick({ address, lat: loc ? loc.lat() : null, lng: loc ? loc.lng() : null });
    } catch {
      onChange(row.label);
      onPick({ address: row.label, lat: null, lng: null });
    } finally {
      // A session ends when a place is selected — start a fresh one next time.
      sessionRef.current = null;
    }
  };

  // Keyless: the CDS Input, unchanged behavior.
  if (!enabled) {
    return <Input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
  }

  return (
    <div className="place-ac">
      <Input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (rows.length) setOpen(true); }}
        onBlur={() => { window.setTimeout(() => setOpen(false), 150); }}
        placeholder={placeholder}
      />
      {open && rows.length > 0 && (
        <ul className="place-ac__menu" role="listbox">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className="place-ac__opt" onMouseDown={(e) => { e.preventDefault(); void pick(r); }}>
                <span aria-hidden className="place-ac__pin">📍</span>
                <span className="place-ac__label">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="place-ac__hint">{hint}</p>}
    </div>
  );
}
