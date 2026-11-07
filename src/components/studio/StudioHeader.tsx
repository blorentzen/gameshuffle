import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconExternalLink } from "@tabler/icons-react";
import { NewSessionButton } from "@/components/hub/NewSessionButton";
import { TokenAllowanceBadge } from "@/components/hub/TokenAllowanceBadge";
import { StudioNav } from "./StudioNav";

/** The Studio's header on each of its pages: the title, the live page, a test and a new stream, then the tabs. */
export function StudioHeader({ userId, liveSlug, sub }: { userId: string; liveSlug: string | null; sub?: string }) {
  return (
    <header className="studio-head">
      <div className="studio-head__top">
        <div className="studio-head__title">
          <h1>Studio</h1>
          <TokenAllowanceBadge ownerUserId={userId} />
          {sub && <p>{sub}</p>}
        </div>
        <div className="studio-head__acts">
          {liveSlug && <Link href={`/live/${encodeURIComponent(liveSlug)}`} target="_blank" rel="noopener noreferrer"><Button variant="secondary"><IconExternalLink size={18} aria-hidden="true" /> Live page</Button></Link>}
          {/* A practice stream: works like a real one but never ends or wraps up on its own. */}
          <NewSessionButton defaultTest variant="secondary" />
          <NewSessionButton />
        </div>
      </div>
      <StudioNav />
    </header>
  );
}
