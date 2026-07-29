/**
 * GS token icon — the brand token asset, sized to sit inline next to a number
 * like the 🪙 emoji it replaces. Decorative (the adjacent number carries the
 * meaning), so it's aria-hidden. Use in JSX/visual surfaces only; chat + toast
 * message *strings* (Twitch/Discord) keep the 🪙 emoji since they're plain text.
 */

const TOKEN_SRC = "https://cdn.empac.co/gameshuffle/images/standard/gs-token.png";

export function TokenIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={TOKEN_SRC}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      style={{
        display: "inline-block",
        verticalAlign: "-0.15em",
        width: size,
        height: size,
      }}
    />
  );
}
