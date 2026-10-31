import type { ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";

/**
 * A FAQ that shows questions only and opens an answer on tap (Britton's pick,
 * 2026-10-19, https://claude.ai/artifact/QaSjiFxbYHkNBAQq53xvpq). Built on the
 * native disclosure element because every answer must stay in the server HTML
 * for search and the FAQPage structured data, and CDS Accordion only mounts an
 * item once it has been opened (so every FAQ used to be forced open). Swap to
 * CDS Accordion once it has a keep-mounted option (on the CascadeDS fix list).
 * Styled to match the CDS bordered accordion. Server component, no JS.
 */
export function FaqList({ items, className }: { items: { q: string; a: ReactNode }[]; className?: string }) {
  return (
    <div className={`faq-list${className ? ` ${className}` : ""}`}>
      {items.map((f) => (
        <details key={f.q} className="faq-list__item">
          <summary className="faq-list__q">
            <span>{f.q}</span>
            <IconChevronDown className="faq-list__icon" size={20} stroke={2} aria-hidden />
          </summary>
          <div className="faq-list__a">{f.a}</div>
        </details>
      ))}
    </div>
  );
}
