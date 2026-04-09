import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.js",
      // @react-pdf packages use the "browser" field in package.json to map
      // their Node entries to browser builds. Turbopack may not resolve these
      // automatically, so we alias them explicitly.
      "@react-pdf/renderer": "@react-pdf/renderer/lib/react-pdf.browser.js",
      "@react-pdf/pdfkit": "@react-pdf/pdfkit/lib/pdfkit.browser.js",
      "@react-pdf/font": "@react-pdf/font/lib/index.browser.js",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
