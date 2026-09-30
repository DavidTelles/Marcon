// Human 3.3.6 / faceres: 1024 floats, sem normalizar o vetor.
// Mesma escala da similaridade Human (L2, multiplier=25, min=.2, max=.8).
// .85 é um ponto inicial conservador, NÃO uma taxa de acerto garantida.
// Calibrar com capturas genuínas/impostoras do ambiente antes de ampliar o uso.
export const FACE_MODEL = "human-3.3.6-faceres-v1";
export const FACE_THRESHOLD = 0.85;
export const FACE_CONSENT = "local-face-v1";
export const FACE_TTL = 120_000;
export type FacePose = "center" | "left" | "right" | "light";
export type FaceSample = {
  embedding: number[];
  yaw: number;
  pitch: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  score: number;
  size: number;
  faces: number;
  elapsed: number;
};

export function similarity(a: number[], b: number[]): number {
  if (a.length !== 1024 || b.length !== 1024) return 0;
  const distance = a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
  return Math.max(0, Math.min(1, (0.8 - Math.sqrt(25 * distance) / 100) / 0.6));
}

export function validEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 1024 &&
    value.every(
      (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100,
    ) &&
    value.reduce((sum, n) => sum + n * n, 0) > 0.01
  );
}

export function qualityProblem(s: FaceSample): string | null {
  if (s.faces !== 1) return "Mantenha apenas um rosto na câmera.";
  if (!validEmbedding(s.embedding) || s.score < 0.8)
    return "Não consegui ler seu rosto. Olhe para a câmera.";
  if (s.size < 160) return "Aproxime o rosto da câmera.";
  if (s.brightness < 45 || s.brightness > 210 || s.contrast < 18)
    return "Ajuste a iluminação do rosto, evitando sombras e contraluz.";
  if (s.sharpness < 30)
    return "A imagem está desfocada. Limpe a lente e fique parado um instante.";
  if (Math.abs(s.yaw) > 0.45 || Math.abs(s.pitch) > 0.35)
    return "Vire o rosto apenas um pouco, mantendo os olhos visíveis.";
  return null;
}

export function poseMatches(
  pose: FacePose,
  sample: FaceSample,
  first: FaceSample,
): boolean {
  if (pose === "left") return sample.yaw < -0.12;
  if (pose === "right") return sample.yaw > 0.12;
  if (pose === "light")
    return (
      Math.abs(sample.yaw) < 0.1 &&
      Math.abs(sample.brightness - first.brightness) >= 6
    );
  return Math.abs(sample.yaw) < 0.1;
}

export function validateCapture(
  value: unknown,
  poses: FacePose[],
): value is FaceSample[] {
  if (!Array.isArray(value) || value.length !== poses.length) return false;
  const samples = value as FaceSample[];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (
      !s ||
      typeof s !== "object" ||
      ![
        s.yaw,
        s.pitch,
        s.brightness,
        s.contrast,
        s.sharpness,
        s.score,
        s.size,
        s.elapsed,
        s.faces,
      ].every((n) => typeof n === "number" && Number.isFinite(n)) ||
      qualityProblem(s) ||
      s.elapsed < 0 ||
      s.elapsed > FACE_TTL ||
      (i > 0 && s.elapsed - samples[i - 1].elapsed < 350) ||
      !poseMatches(poses[i], s, samples[0])
    )
      return false;
    for (let j = 0; j < i; j++) {
      if (
        similarity(s.embedding, samples[j].embedding) < 0.8 ||
        s.embedding.every((n, k) => n === samples[j].embedding[k])
      )
        return false;
    }
  }
  // Presença simples: sequência aleatória de movimentos. As medições vêm do
  // navegador e podem ser forjadas; NÃO é proteção contra replay sofisticado,
  // câmera virtual, deepfake ou um cliente modificado com embeddings roubados.
  return samples.at(-1)!.elapsed - samples[0].elapsed >= 2000;
}

export function matchesEnrollment(
  samples: FaceSample[],
  enrolled: number[][],
): boolean {
  if (enrolled.length !== 6 || !enrolled.every(validEmbedding)) return false;
  // Todas as capturas devem concordar com pelo menos 3 amostras do cadastro.
  return samples.every(
    (sample) =>
      enrolled.filter(
        (reference) =>
          similarity(sample.embedding, reference) >= FACE_THRESHOLD,
      ).length >= 3,
  );
}
