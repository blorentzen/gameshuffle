import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import { requireHubAccess } from "@/lib/capabilities/hub-access";
import { studioOwner } from "@/lib/studio/server";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { StudioScreen } from "@/components/studio/StudioScreen";
import { OverlayLinkCopy } from "@/components/studio/OverlayLinkCopy";
import { IconTile } from "@/components/ui/IconTile";
import { studioTool } from "@/lib/studio/tools";
import "@/styles/studio.css";

type Props = { params: Promise<{ tool: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = studioTool((await params).tool);
  return { title: `${t?.label ?? "Tool"} · Studio`, robots: { index: false, follow: false } };
}

/**
 * One stream tool (journeys picks 2026-11-06, 10A): what it is, how chat uses it, its overlay piece and the overlay
 * link, then its settings (the screen it had in Account ▸ Streaming).
 */
export default async function StudioToolPage({ params }: Props) {
  const t = studioTool((await params).tool);
  if (!t) notFound();
  const { userId } = await requireHubAccess(`/hub/tools/${t.id}`);
  const owner = await studioOwner(userId);
  return (
    <div className="hub-page studio-page">
      <StudioHeader userId={userId} liveSlug={owner.liveSlug} />
      <Link href="/hub/tools" className="studio-back"><IconChevronLeft size={18} aria-hidden="true" />All tools</Link>
      <section className={`studio-toolhead${t.pic ? " studio-toolhead--pic" : ""}`} aria-label={t.label}>
        <div className="studio-toolhead__words">
          <div className="studio-toolhead__name"><IconTile icon={t.icon} tone={t.tone} size="lg" /><div><p className="studio-toolhead__title">{t.label}</p><p>{t.line}</p></div></div>
          {t.chat && <p className="studio-toolhead__chat">In chat: <code>{t.chat}</code></p>}
          <OverlayLinkCopy />
        </div>
        {t.pic && (
          <div className="studio-frame">
            {/* eslint-disable-next-line @next/next/no-img-element -- the tool's overlay piece, filmed for the guide */}
            <img src={t.pic} alt={`${t.label} on the overlay`} />
          </div>
        )}
      </section>
      <StudioScreen screen={t.screen} profileTimezone={owner.timezone} />
    </div>
  );
}
