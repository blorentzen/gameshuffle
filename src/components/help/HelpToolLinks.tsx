import { ArrowLink } from "@/components/ui/ArrowLink";

/**
 * The tools a help article explains, linked right under its heading (SEO pass 2026-11-05: search showed some
 * how-to articles above the randomizers themselves, so the article sends people straight on).
 */
export function HelpToolLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <p className="help-tools">
      {links.map((l) => <ArrowLink key={l.href} href={l.href}>{l.label}</ArrowLink>)}
    </p>
  );
}
