/**
 * Client-side Google Maps JS API loader (singleton). Loads the `places` library
 * once and resolves the shared `google` global. No-ops with a rejected promise
 * when no key is configured, so callers fall back to the keyless experience
 * (OpenStreetMap embed + free-text address).
 *
 * Uses the modern Places library (AutocompleteSuggestion / Place), which is the
 * path available to keys created after March 2025 — the legacy
 * `places.Autocomplete` widget is not enabled for new keys.
 *
 * Env: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (browser key, HTTP-referrer restricted).
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export function isGoogleMapsEnabled(): boolean {
  return !!KEY;
}

// Minimal shapes of what we use off the modern Places API.
export interface GLatLng { lat: () => number; lng: () => number }
export interface GPlace {
  formattedAddress?: string | null;
  displayName?: string | null;
  location?: GLatLng | null;
  fetchFields: (opts: { fields: string[] }) => Promise<unknown>;
}
export interface GPlacePrediction {
  toPlace: () => GPlace;
  text?: { toString: () => string };
}
export interface GAutocompleteSuggestion {
  placePrediction: GPlacePrediction | null;
}
export interface GooglePlacesApi {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: {
      input: string;
      sessionToken?: object;
      includedPrimaryTypes?: string[];
    }) => Promise<{ suggestions: GAutocompleteSuggestion[] }>;
  };
}
export interface GoogleMapsApi {
  maps: {
    importLibrary: (name: string) => Promise<unknown>;
    places?: GooglePlacesApi;
  };
}

declare global {
  interface Window {
    google?: GoogleMapsApi;
    gm_authFailure?: () => void;
  }
}

/** Set true if Google rejects the key/API (vs. the script being blocked, e.g. by
 *  CSP). Lets callers tell an auth/enablement problem from a load problem. */
export let googleMapsAuthFailed = false;

let promise: Promise<GooglePlacesApi> | null = null;

/** Resolves the modern Places library (AutocompleteSuggestion / sessions). */
export function loadGooglePlaces(): Promise<GooglePlacesApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"));
  if (!KEY) return Promise.reject(new Error("no_key"));
  if (promise) return promise;

  // Google calls this global when authentication fails (API not enabled, key
  // invalid, referrer/API restriction) — distinct from the script not loading.
  window.gm_authFailure = () => {
    googleMapsAuthFailed = true;
    console.error("[maps] Google rejected the key (gm_authFailure): enable the Maps JavaScript API + Places API (New) and confirm the key's API restrictions include them.");
  };

  promise = new Promise<GooglePlacesApi>((resolve, reject) => {
    const use = async () => {
      try {
        const g = window.google;
        if (!g?.maps?.importLibrary) return reject(new Error(googleMapsAuthFailed ? "gmaps_auth_failed" : "gmaps_load_failed"));
        const places = (await g.maps.importLibrary("places")) as GooglePlacesApi;
        if (places?.AutocompleteSuggestion) resolve(places);
        else reject(new Error("places_unavailable"));
      } catch {
        reject(new Error(googleMapsAuthFailed ? "gmaps_auth_failed" : "gmaps_load_failed"));
      }
    };
    const existing = document.getElementById("gmaps-js") as HTMLScriptElement | null;
    if (typeof window.google?.maps?.importLibrary === "function") { void use(); return; }
    if (existing) {
      existing.addEventListener("load", () => void use());
      existing.addEventListener("error", () => reject(new Error("gmaps_script_blocked")));
      return;
    }
    const script = document.createElement("script");
    script.id = "gmaps-js";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&libraries=places&loading=async&callback=__gmapsReady`;
    // The callback fires once core is ready — more reliable than the load event.
    (window as unknown as Record<string, () => void>).__gmapsReady = () => void use();
    script.addEventListener("load", () => { /* callback drives readiness; keep as a fallback */ setTimeout(() => { if (typeof window.google?.maps?.importLibrary === "function") void use(); }, 0); });
    script.addEventListener("error", () => reject(new Error("gmaps_script_blocked")));
    document.head.appendChild(script);
  });
  return promise;
}
