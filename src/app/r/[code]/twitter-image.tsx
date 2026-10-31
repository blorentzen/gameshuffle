import { loadShare } from "@/lib/share/store";
import { renderShareCard } from "@/lib/share/render";

/** The same card for X (twitter:image). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A GameShuffle result";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const share = await loadShare((await params).code);
  if (!share) return new Response("Not found", { status: 404 });
  const png = await renderShareCard(share.data, "wide");
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=300" } });
}
