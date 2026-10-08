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
import { FACE_CONSENT, FACE_MODEL, faceCapturePolicy, type FacePurpose } from "./face-policy";

export type FaceChallenge = { purpose: FacePurpose; model: string; poses: string[] };

export function validChallenge(value: unknown, purpose: FacePurpose): value is FaceChallenge {
  if (!value || typeof value !== "object") return false;
  const challenge = value as FaceChallenge;
  if (challenge.purpose !== purpose || challenge.model !== FACE_MODEL || !Array.isArray(challenge.poses) ||
    challenge.poses.length !== faceCapturePolicy(purpose).count) return false;
  if (purpose === "login") return challenge.poses.every((pose) => pose === "center");
  const [first, turn, middle, other, last] = challenge.poses;
  return first === "center" && middle === "center" && last === "center" &&
    ["left", "right"].includes(turn) && ["left", "right"].includes(other) && turn !== other;
}

export async function startFaceRegistration(password: string, signal?: AbortSignal, adminTarget?: string) {
  const challenge = await faceRequest<FaceChallenge>({
    action: "start", purpose: "register", password, adminTarget, consent: FACE_CONSENT,
  }, signal);
  if (!validChallenge(challenge, "register")) throw new Error("Desafio facial inválido. Recarregue a página e tente novamente.");
  return challenge;
}
