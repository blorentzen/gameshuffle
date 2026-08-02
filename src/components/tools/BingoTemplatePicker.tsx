import Link from "next/link";
import { BINGO_TEMPLATES } from "@/data/bingo-templates";

/**
 * Template switcher — shown on the blank generator and every template page so a
 * user can jump to another card or a blank one at any time. Each board has its
 * own storage, so switching never loses the one you left.
 */
export function BingoTemplatePicker({ currentSlug }: { currentSlug?: string }) {
  return (
    <section className="tier-templates">
      <h2 className="tier-templates__head">Switch template</h2>
      <div className="tier-templates__grid">
        <Link
          href="/bingo-card-generator"
          className={`tier-templates__link${!currentSlug ? " is-active" : ""}`}
        >
          Blank
        </Link>
        {BINGO_TEMPLATES.map((t) => (
          <Link
            key={t.slug}
            href={`/bingo-card-generator/${t.slug}`}
            className={`tier-templates__link${currentSlug === t.slug ? " is-active" : ""}`}
          >
            {t.title}
          </Link>
        ))}
      </div>
    </section>
  );
}
