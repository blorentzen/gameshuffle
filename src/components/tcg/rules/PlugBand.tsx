import type { ReactNode } from "react";
import { IconCards, type Icon } from "@tabler/icons-react";
import { IconField, type ArtCategory } from "@/components/events/EventHeaderArt";
import { IconTile, type TileTone } from "@/components/ui/IconTile";

/**
 * A plug for one of our own tools in the middle of an article (design round 3,
 * Britton's pick 2026-10-20): a dark navy band like the site's headers, with
 * the drifting glyph field, a 56px tile, a short eyebrow, the title, one line
 * and the buttons. It reads as a step out of the article, not part of it.
 * Used by the rules pages and the rules hub; the trivia articles' boxes share
 * its class (`.rules-page__companion`), so they wear the band too.
 * Server-safe (the glyph field is a client component).
 */
export function PlugBand({ id, title, children, actions, icon = IconCards, tone = "red", eyebrow = "From GameShuffle", field = "tcg" }: {
  /** The heading's id (the section is labelled by it, and it seeds the glyph field). */
  id: string;
  title: string;
  /** The one line under the title. */
  children: ReactNode;
  /** The band's buttons: a primary, then a ghost (styled for the dark band). */
  actions: ReactNode;
  icon?: Icon;
  tone?: TileTone;
  /** One short label. */
  eyebrow?: string;
  field?: ArtCategory;
}) {
  return (
    <section className="rules-page__companion plug-band" aria-labelledby={id}>
      <IconField category={field} seed={id} opacity={0.12} className="plug-band__field" />
      <IconTile icon={icon} tone={tone} size="lg" className="plug-band__tile" />
      <div className="plug-band__copy">
        <p className="plug-band__eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
        <p>{children}</p>
        <div className="rules-page__actions">{actions}</div>
      </div>
    </section>
  );
}
