import { loadShare } from "@/lib/share/store";
import { renderShareCard } from "@/lib/share/render";
import { MMR_PICTURE_CACHE, sharedMmrPicture } from "@/lib/mmr/sharePicture";

/** The result's link preview: the player's own card (src/lib/share). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A GameShuffle result";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const share = await loadShare(code);
  if (!share) return new Response("Not found", { status: 404 });
  const mp = share.data.parts[0]?.kind === "mmr" ? share.data.parts[0] : null;
  if (mp) {
    const pic = await sharedMmrPicture(code, mp, "wide");
    return pic ? new Response(new Uint8Array(pic), { headers: { "Content-Type": "image/png", "Cache-Control": MMR_PICTURE_CACHE } }) : new Response("Unavailable", { status: 503 });
  }
  const png = await renderShareCard(share.data, "wide");
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=300" } });
}
