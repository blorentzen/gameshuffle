import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import { requireHubAccess } from "@/lib/capabilities/hub-access";
import { studioOwner } from "@/lib/studio/server";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { StudioScreen } from "@/components/studio/StudioScreen";
import { SETUP_PARTS } from "@/lib/studio/tools";
import "@/styles/studio.css";

type Props = { params: Promise<{ part: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).part;
  const p = SETUP_PARTS.find((x) => x.id === id);
  return { title: `${p?.label ?? "Setup"} · Studio`, robots: { index: false, follow: false } };
}

/** One part of Setup (Twitch, YouTube and Kick, Schedule, Mods): the screen it had in Account ▸ Streaming. */
export default async function StudioSetupPartPage({ params }: Props) {
  const id = (await params).part;
  const part = SETUP_PARTS.find((x) => x.id === id);
  if (!part) notFound();
  const { userId } = await requireHubAccess(`/hub/setup/${part.id}`);
  const owner = await studioOwner(userId);
  return (
    <div className="hub-page studio-page">
      <StudioHeader userId={userId} liveSlug={owner.liveSlug} />
      <Link href="/hub/setup" className="studio-back"><IconChevronLeft size={18} aria-hidden="true" />Setup</Link>
      <StudioScreen screen={part.screen} profileTimezone={owner.timezone} />
    </div>
  );
}
