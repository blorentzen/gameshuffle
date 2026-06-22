import { Badge } from "@empac/cascadeds";

export function BetaBanner() {
  return (
    <div className="beta-banner">
      <Badge variant="info" size="small">Beta</Badge>
      <span className="beta-banner__text">
        This feature is a work in progress — things may change as we refine the experience.{" "}
        <a href="/contact-us" className="beta-banner__link">Share feedback</a>
      </span>
    </div>
  );
}
