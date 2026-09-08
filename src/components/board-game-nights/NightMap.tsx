/**
 * Venue map for a board-game night — an OpenStreetMap embed (no API key, no
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
  // A small bounding box around the point so the embed frames the venue.
  const d = 0.006;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const embedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    place || `${lat},${lng}`,
  )}`;

  return (
    <div className="bgn-map">
      <iframe
        className="bgn-map__frame"
        src={embedSrc}
        title={place ? `Map of ${place}` : "Venue map"}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <a
        className="bgn-map__directions"
        href={directionsHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        Get directions →
      </a>
    </div>
  );
}
