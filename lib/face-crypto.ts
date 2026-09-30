import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { FACE_MODEL } from "./face-policy";

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("troque_"))
    throw new Error("SESSION_SECRET inválida");
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      "marcon-local-face",
      "embedding-encryption-v1",
      32,
    ),
  );
}
export function encryptFace(userId: number, embeddings: number[][]): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`${userId}:${FACE_MODEL}`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(embeddings), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
export function decryptFace(userId: number, data: Buffer): number[][] {
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${userId}:${FACE_MODEL}`));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  );
}
