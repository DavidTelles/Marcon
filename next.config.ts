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
  serverExternalPackages: ["tesseract.js", "onnxruntime-node"],
  outputFileTracingExcludes: {
    "/api/login/face": [
      // CPU only. Do not ship other platforms, CUDA, or DirectML libraries.
      "./node_modules/onnxruntime-node/bin/napi-v6/{darwin,win32}/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*providers*",
    ],
  },
  outputFileTracingIncludes: {
    "/api/maps": ["./node_modules/@tesseract.js-data/por/4.0.0/*"],
    "/api/login/face": [
      "./face/recognize.py", "./face/models/*.onnx",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime.so*",
    ],
  },
};

export default nextConfig;
