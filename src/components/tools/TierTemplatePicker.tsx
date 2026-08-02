import Link from "next/link";
import { TIER_TEMPLATES } from "@/data/tier-templates";

/**
 * Template switcher — shown on the blank maker and on every template page so a
 * user can jump to another template or a blank board at any time. Each board
 * has its own storage, so switching never loses the one you left.
 */
export function TierTemplatePicker({ currentSlug }: { currentSlug?: string }) {
  return (
    <section className="tier-templates">
      <h2 className="tier-templates__head">Switch template</h2>
      <div className="tier-templates__grid">
        <Link
          href="/tier-list-maker"
          className={`tier-templates__link${!currentSlug ? " is-active" : ""}`}
        >
          Blank
        </Link>
        {TIER_TEMPLATES.map((t) => (
          <Link
            key={t.slug}
            href={`/tier-list-maker/${t.slug}`}
            className={`tier-templates__link${currentSlug === t.slug ? " is-active" : ""}`}
          >
            {t.title}
          </Link>
        ))}
      </div>
    </section>
  );
}
