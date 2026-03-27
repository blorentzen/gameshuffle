export function BetaBanner() {
  return (
    <div className="beta-banner">
      <span className="beta-banner__badge">Beta</span>
      <span className="beta-banner__text">
        This feature is a work in progress — things may change as we refine the experience.{" "}
        <a href="/contact-us" className="beta-banner__link">Share feedback</a>
      </span>
    </div>
  );
}
