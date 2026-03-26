import Image from "next/image";

export function EmpacBanner() {
  return (
    <div className="gs-empac-banner__wrapper">
      <div className="gs-empac-banner">
        <Image
          src="/images/empacjs/empac/white/empac-emblem.svg"
          alt="Empac"
          width={24}
          height={24}
        />
        <a href="https://empac.co/" target="_blank" rel="noopener noreferrer">
          Apps by Empac
        </a>
      </div>
    </div>
  );
}
