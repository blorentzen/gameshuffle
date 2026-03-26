import type { CompetitiveConfig } from "@/data/competitive-types";

interface CompetitiveInfoProps {
  config: CompetitiveConfig;
}

export function CompetitiveInfo({ config }: CompetitiveInfoProps) {
  return (
    <div className="competitive-info">
      {config.tier_list_url && (
        <div className="competitive-info__item">
          <span className="filter-group__label">
            <b>Tier List Source</b>
          </span>
          <a
            href={config.tier_list_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {config.tier_list_url}
          </a>
          {config.tier_list_updated && (
            <span className="competitive-info__date">
              Updated {config.tier_list_updated}
            </span>
          )}
        </div>
      )}
      {config.community_links.length > 0 && (
        <div className="competitive-info__item">
          <span className="filter-group__label">
            <b>Community Resources</b>
          </span>
          <div className="competitive-info__links">
            {config.community_links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="competitive-info__link"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
