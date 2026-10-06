import nextEnv from "@next/env";
import { faceServiceRequest } from "../lib/face-service.mjs";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
try {
  const result = await faceServiceRequest("/health", undefined);
  if (
    result?.status !== "ok" ||
    result.model !== "opencv-yunet-sface-2023mar-v1" ||
    result.dimensions !== 128
  )
    throw new Error("Serviço retornou um modelo incompatível.");
  console.log("PASS: serviço facial autenticado e modelos carregados.");
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
