import WarImage from "./opengraph-image";

/** The same picture for X (twitter:image). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Mario Kart war's score";

export default function Image(props: { params: Promise<{ slug: string }> }) {
  return WarImage(props);
}
