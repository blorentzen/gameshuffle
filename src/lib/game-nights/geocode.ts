import "server-only";

/**
 * Geocode a free-text venue to coordinates via OpenStreetMap Nominatim — free,
 * no API key, privacy-friendly (no Google tracker on our public pages). Called
 * only at save time and best-effort: any failure returns null and the night
 * simply shows its text address without a map. Respects Nominatim's usage
 * policy with a real User-Agent + long result caching.
 */
export async function geocodePlace(
  place: string | null | undefined,
): Promise<{ lat: number; lng: number } | null> {
  const q = place?.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
      {
        headers: {
          "User-Agent": "GameShuffle/1.0 (+https://gameshuffle.co)",
          "Accept-Language": "en",
        },
        // Cache identical lookups (keyed on URL) for 30 days.
        next: { revalidate: 60 * 60 * 24 * 30 },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = Array.isArray(data) ? data[0] : null;
    const lat = first?.lat ? parseFloat(first.lat) : NaN;
    const lng = first?.lon ? parseFloat(first.lon) : NaN;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
