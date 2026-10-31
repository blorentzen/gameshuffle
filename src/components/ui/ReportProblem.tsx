import { ArrowLink } from "@/components/ui/ArrowLink";
import { reportHref } from "@/lib/contact/report";

/**
 * "Is something wrong? Let us know": one quiet line at the foot of a page with facts on it, linking
 * to the contact form about that page (src/lib/contact/report.ts). Server-safe.
 */
export function ReportProblem({ about, page, className }: {
  /** What the page is, in the team's inbox ("Viola on Trainer Road"). */
  about: string;
  /** The page's own path. */
  page: string;
  className?: string;
}) {
  return (
    <p className={`report-problem${className ? ` ${className}` : ""}`}>
      Is something wrong? <ArrowLink href={reportHref(about, page)}>Let us know</ArrowLink>
    </p>
  );
}
