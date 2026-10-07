import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return ["recebimentos", "requisicoes", "pedidos-compra", "estoque", "consumiveis"].map((prefix) => ({ source: `/${prefix}/:path*`, destination: `/api/pcp/${prefix}/:path*` }));
  },
  ...(process.env.MARCON_DISABLE_BUILD_CACHE === "1"
    ? {
        experimental: {
          turbopackFileSystemCacheForDev: false,
          turbopackFileSystemCacheForBuild: false,
        },
      }
    : {}),
  distDir: process.env.JAMES_TEST_DIST_DIR || ".next",
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: {
    "/api/maps": ["./node_modules/@tesseract.js-data/por/4.0.0/*"],
    "/api/login/face": ["./face/recognize.py", "./face/models/*.onnx"],
  },
};

export default nextConfig;
