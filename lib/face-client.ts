export async function faceRequest<T>(
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    "/api/login/face",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        }
      : { cache: "no-store", signal },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== "object")
    throw new Error(result?.error || "Não foi possível concluir a captura.");
  return result as T;
}
import { FACE_CONSENT, FACE_COUNT, FACE_MODEL } from "./face-policy";

export type FaceChallenge = { model: string; poses: string[] };

export function validChallenge(value: FaceChallenge) {
  return value.model === FACE_MODEL && Array.isArray(value.poses) &&
    value.poses.length === FACE_COUNT && value.poses.every((pose) =>
      ["center", "left", "right"].includes(pose));
}

export async function startFaceRegistration(password: string, signal?: AbortSignal, adminTarget?: string) {
  const challenge = await faceRequest<FaceChallenge>({
    action: "start", purpose: "register", password, adminTarget, consent: FACE_CONSENT,
  }, signal);
  if (!validChallenge(challenge)) throw new Error("Desafio facial inválido. Recarregue a página e tente novamente.");
  return challenge;
}
