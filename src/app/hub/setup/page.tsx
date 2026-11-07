import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { requireHubAccess } from "@/lib/capabilities/hub-access";
import { studioOwner } from "@/lib/studio/server";
import { streamSetup, type SetupStep } from "@/lib/streaming/setup";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { SetupGuide } from "@/components/studio/SetupGuide";
import { SETUP_PARTS } from "@/lib/studio/tools";
import "@/styles/studio.css";

export const metadata: Metadata = { title: "Setup · Studio", robots: { index: false, follow: false } };

/** /hub/setup: the guided steps (journeys 11A), then your connections and schedule. */
export default async function StudioSetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { userId } = await requireHubAccess("/hub/setup");
  const [owner, steps, sp] = await Promise.all([studioOwner(userId), streamSetup(userId).catch(() => [] as SetupStep[]), searchParams]);
  return (
    <div className="hub-page studio-page">
      <StudioHeader userId={userId} liveSlug={owner.liveSlug} />
      <SetupGuide initial={steps} start={(sp.step as SetupStep["id"]) ?? null} />
      <section className="studio-parts" aria-labelledby="studio-parts-title">
        <h2 id="studio-parts-title" className="hub-panel__title">Connections and schedule</h2>
        <ul>
          {SETUP_PARTS.map((p) => (
            <li key={p.id}>
              <Link href={`/hub/setup/${p.id}`}><span><b>{p.label}</b><small>{p.line}</small></span><IconChevronRight size={18} aria-hidden="true" /></Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
