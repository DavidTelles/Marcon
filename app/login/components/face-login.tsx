"use client";
import { FaceCapture } from "@/app/components/face/face-capture";
import styles from "../login.module.css";
export function FaceLogin({
  identity,
  onCancel,
}: {
  identity: string;
  onCancel: () => void;
}) {
  return (
    <section className={styles.faceTest} aria-labelledby="local-face-title">
      <h2 id="local-face-title">Entrar com reconhecimento facial</h2>
      <p>
        Use o rosto cadastrado no perfil. Mantenha o rosto visível durante as
        cinco fotos, com boa iluminação e apenas você na câmera.
      </p>
      <FaceCapture
        purpose="login"
        identity={identity}
        onCancel={onCancel}
        onDone={() => undefined}
      />
    </section>
  );
}
