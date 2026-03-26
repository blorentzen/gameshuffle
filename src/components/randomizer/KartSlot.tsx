import { getImagePath } from "@/lib/images";

interface KartSlotProps {
  label: string;
  name: string | null;
  imageSrc: string | null;
}

export function KartSlot({ label, name, imageSrc }: KartSlotProps) {
  return (
    <li className="kart-slot">
      <img
        src={imageSrc ? getImagePath(imageSrc) : "/images/fg/itembox.png"}
        alt={name || label}
      />
      <span>{name || "???"}</span>
    </li>
  );
}
