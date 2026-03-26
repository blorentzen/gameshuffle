import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Preserve SEO equity from old URLs
      {
        source: "/mario-kart-8-deluxe-randomizer",
        destination: "/randomizers/mario-kart-8-deluxe",
        permanent: true,
      },
      {
        source: "/mario-kart-8-deluxe-randomizer/",
        destination: "/randomizers/mario-kart-8-deluxe",
        permanent: true,
      },
      // Catch the short slug too
      {
        source: "/randomizers/mario-kart-8",
        destination: "/randomizers/mario-kart-8-deluxe",
        permanent: true,
      },
      {
        source: "/mario-kart-world-randomizer",
        destination: "/randomizers/mario-kart-world",
        permanent: true,
      },
      {
        source: "/mario-kart-world-randomizer/",
        destination: "/randomizers/mario-kart-world",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
