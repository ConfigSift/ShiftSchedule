import type { NextConfig } from "next";

const noIndexPrefixes = [
  "dashboard",
  "restaurants",
  "manager",
  "schedule",
  "reports",
  "staff",
  "chat",
  "billing",
  "subscribe",
  "review-requests",
  "time-off",
  "blocked-days",
  "business-hours",
  "profile",
  "account",
  "persona",
  "reset-passcode",
  "setup",
  "onboarding",
];

const stripeEmbeddedRoutePrefixes = ["setup", "subscribe", "onboarding"];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  compiler: {
    removeConsole: {
      exclude: ['error'],
    },
  },
  allowedDevOrigins: [
    "http://192.168.1.4:3000",
    "http://169.254.5.254:3000",
    "http://localhost:3000",
  ],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.crewshyft.com" }],
        destination: "https://crewshyft.com/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "app.crewshyft.com" }],
        destination: "/dashboard",
      },
      {
        source: "/schedule",
        has: [{ type: "host", value: "app.crewshyft.com" }],
        destination: "/dashboard",
      },
    ];
  },
  async headers() {
    const noIndexHeaders = noIndexPrefixes.flatMap((prefix) => [
      {
        source: `/${prefix}`,
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
      {
        source: `/${prefix}/:path*`,
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
    ]);

    // Stripe embedded checkout payment methods (e.g. Cash App Pay) rely on popup flows.
    // Scope popup-friendly COOP/COEP only to payment-capable onboarding routes.
    const stripePopupHeaders = stripeEmbeddedRoutePrefixes.flatMap((prefix) => [
      {
        source: `/${prefix}`,
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "unsafe-none",
          },
        ],
      },
      {
        source: `/${prefix}/:path*`,
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "unsafe-none",
          },
        ],
      },
    ]);

    return [...noIndexHeaders, ...stripePopupHeaders];
  },
};

export default nextConfig;
