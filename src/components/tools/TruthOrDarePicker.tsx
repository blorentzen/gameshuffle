import Link from "next/link";
import { TRUTH_OR_DARE_SETS } from "@/data/truth-or-dare";

/** Set switcher — shown on every truth-or-dare page. */
export function TruthOrDarePicker({ currentSlug }: { currentSlug?: string }) {
  return (
    <section className="tier-templates">
      <h2 className="tier-templates__head">Pick a set</h2>
      <div className="tier-templates__grid">
        {TRUTH_OR_DARE_SETS.map((s) => (
          <Link
            key={s.slug}
            href={`/truth-or-dare/${s.slug}`}
            className={`tier-templates__link${currentSlug === s.slug ? " is-active" : ""}`}
          >
            {s.title}
          </Link>
        ))}
      </div>
    </section>
  );
}
