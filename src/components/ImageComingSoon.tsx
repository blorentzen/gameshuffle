/**
 * The placeholder wherever art isn't ready yet (beta randomizers launch before
 * their images do): the brand gradient, a picture icon and "Image coming soon".
 * For img-based slots, use the matching file /images/placeholders/image-coming-soon.svg.
 */
import { IconPhoto } from "@tabler/icons-react";

export const IMAGE_COMING_SOON = "/images/placeholders/image-coming-soon.svg";

export function ImageComingSoon({ label = "Image coming soon", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`image-coming-soon${compact ? " image-coming-soon--compact" : ""}`} role="img" aria-label={label}>
      <IconPhoto size={compact ? 28 : 44} stroke={1.5} aria-hidden />
      <span>{label}</span>
    </div>
  );
}
