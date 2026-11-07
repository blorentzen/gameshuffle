import type { Metadata } from "next";
import { TtStationRunner } from "@/components/tournament/tt/TtStationRunner";

export const metadata: Metadata = { title: "Station runner", robots: { index: false, follow: false } };

/**
 * A station's runner at an in-person time trial: the organizer's station link (?k= signs it) opens this page on the
 * runner's phone, chrome-free. Everything it shows comes from /api/tournament/[id]/tt/station, which checks the key.
 */
export default async function TtStationPage({ params, searchParams }: { params: Promise<{ id: string; n: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ id, n }, { k }] = await Promise.all([params, searchParams]);
  return <TtStationRunner tournamentId={id} n={Number(n)} k={k ?? ""} />;
}
