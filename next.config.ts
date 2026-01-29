import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Avoid lockfile creation failures on restricted filesystems (e.g. OneDrive/EDR).
    lockDistDir: false,
  },
  images: {
    remotePatterns: [
      // LinkedIn CDN
      {
        protocol: "https",
        hostname: "media.licdn.com",
      },
      {
        protocol: "https",
        hostname: "media-exp1.licdn.com",
      },
      // Supabase storage
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      // AI image generation services (adjust based on your n8n setup)
      {
        protocol: "https",
        hostname: "*.openai.com",
      },
      {
        protocol: "https",
        hostname: "oaidalleapiprodscus.blob.core.windows.net",
      },
      // Add your n8n domain if images are hosted there
      // {
      //   protocol: "https",
      //   hostname: "your-n8n-domain.com",
      // },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
