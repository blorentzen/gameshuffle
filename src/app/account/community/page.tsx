import { redirect } from "next/navigation";

/**
 * Moved: Stream Setup and Community & Chat are one Streaming section since
 * 2026-10-09. Forwards with every query param (tab ids are unchanged).
 */
export default async function MovedToStreaming({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v != null) qs.set(k, v);
  }
  const query = qs.toString();
  redirect(`/account/streaming${query ? `?${query}` : ""}`);
}
