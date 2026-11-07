import type { Metadata } from "next";
import { requireHubAccess } from "@/lib/capabilities/hub-access";
import { studioOwner } from "@/lib/studio/server";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { ToolCard } from "@/components/studio/StudioHome";
import { STUDIO_TOOLS, TOOL_GROUPS } from "@/lib/studio/tools";
import "@/styles/studio.css";

export const metadata: Metadata = { title: "Tools · Studio", robots: { index: false, follow: false } };

/** /hub/tools: every stream tool, by what it's for; each opens its own page. */
export default async function StudioToolsPage() {
  const { userId } = await requireHubAccess("/hub/tools");
  const owner = await studioOwner(userId);
  return (
    <div className="hub-page studio-page">
      <StudioHeader userId={userId} liveSlug={owner.liveSlug} />
      {TOOL_GROUPS.map((g) => (
        <section key={g.id} className="studio-tools" aria-labelledby={`tools-${g.id}`}>
          <h2 id={`tools-${g.id}`} className="hub-panel__title">{g.label}</h2>
          <div className="studio-tools__grid">{STUDIO_TOOLS.filter((t) => t.group === g.id).map((t) => <ToolCard key={t.id} t={t} />)}</div>
        </section>
      ))}
    </div>
  );
}
