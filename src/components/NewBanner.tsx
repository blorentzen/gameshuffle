import { Badge } from "@empac/cascadeds";

/** Above a tool that just launched: it works, and parts may still change. */
export function NewBanner() {
  return (
    <div className="new-banner">
      <Badge variant="info" size="small">New</Badge>
      <span className="new-banner__text">
        Just launched, and still growing: some parts may change as we refine it.{" "}
        <a href="/contact-us" className="new-banner__link">Share feedback</a>
      </span>
    </div>
  );
}
