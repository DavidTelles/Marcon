import nextEnv from "@next/env";
import { faceServiceRequest } from "../lib/face-service.mjs";
import { faceEngine, checkNodeFaceEngine } from "../lib/face-node.mjs";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
try {
  const engine = faceEngine();
  if (engine === "python") throw new Error("Use os testes Python para o motor local ou FACE_ENGINE=node para validar a hospedagem.");
  const result = engine === "remote"
    ? await faceServiceRequest("/health", undefined)
    : await checkNodeFaceEngine();
  if (
    result?.status !== "ok" ||
    result.model !== "opencv-yunet-sface-2023mar-v1" ||
    result.dimensions !== 128
  )
    throw new Error("Serviço retornou um modelo incompatível.");
  console.log("PASS: modelos faciais carregados; " + (engine === "remote" ? "serviço Python autenticado." : "CPU Node, sem serviço externo ou configuração FACE_* obrigatória."));
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
