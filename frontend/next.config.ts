import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.JAMES_TEST_DIST_DIR || ".next",
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: {
    "/api/maps": ["./node_modules/@tesseract.js-data/por/4.0.0/*"],
    "/api/login/face": ["./face/recognize.py", "./face/models/*.onnx"],
  },
};

export default nextConfig;
