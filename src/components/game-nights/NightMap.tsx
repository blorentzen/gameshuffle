/**
 * Venue map for a game night — an OpenStreetMap embed (no API key, no
 * Google tracker on our public page) with a marker, plus a "Get directions"
 * link that opens the viewer's maps app. Rendered only when the night has
 * geocoded coords; the text address still shows without it.
 */
export function NightMap({
  lat,
  lng,
  place,
}: {
  lat: number;
  lng: number;
  place: string | null;
}) {
  // Prefer the Google Maps Embed when a key is configured (needs the Maps Embed
  // API enabled); otherwise a keyless OpenStreetMap embed. Both are pin-only.
  const gkey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const d = 0.006;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const embedSrc = gkey
    ? `https://www.google.com/maps/embed/v1/place?key=${gkey}&q=${lat},${lng}&zoom=15`
    : `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const dest = encodeURIComponent(place || `${lat},${lng}`);
  const googleHref = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  // Apple Maps opens natively on iOS/macOS; falls back to the web map elsewhere.
  const appleHref = `https://maps.apple.com/?daddr=${dest}`;

  return (
    <div className="bgn-map">
      <iframe
        className="bgn-map__frame"
        src={embedSrc}
        title={place ? `Map of ${place}` : "Venue map"}
        loading="lazy"
        // Google's referrer-restricted key rejects an empty referer, so the
        // Google embed must send our origin; OSM needs no referer at all.
        referrerPolicy={gkey ? "strict-origin-when-cross-origin" : "no-referrer"}
      />
      <div className="bgn-map__directions-row">
        <a className="bgn-map__directions" href={googleHref} target="_blank" rel="noopener noreferrer">
          Google Maps →
        </a>
        <a className="bgn-map__directions" href={appleHref} target="_blank" rel="noopener noreferrer">
          Apple Maps →
        </a>
      </div>
    </div>
  );
}
