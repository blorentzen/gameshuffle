import {
  type GameAsset,
  DEFAULT_PLACEHOLDER_COLOR,
  resolveAsset,
} from "@/lib/images";

interface AssetImageProps {
  asset: GameAsset;
  className?: string;
  style?: React.CSSProperties;
}

export function AssetImage({ asset, className, style }: AssetImageProps) {
  const src = resolveAsset(asset);

  if (!src) {
    return (
      <div
        className={className}
        style={{
          backgroundColor: asset.placeholderColor || DEFAULT_PLACEHOLDER_COLOR,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.15,
          ...style,
        }}
        role="img"
        aria-label={asset.alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={asset.alt}
      className={className}
      style={style}
    />
  );
}
