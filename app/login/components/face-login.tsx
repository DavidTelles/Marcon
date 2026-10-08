"use client";
import { FaceCapture } from "@/app/components/face/face-capture";
import styles from "../login.module.css";
export function FaceLogin({
  onCancel,
}: {
  onCancel: () => void;
}) {
  return (
    <section className={styles.faceTest} aria-labelledby="local-face-title">
      <h2 id="local-face-title">Entrar com reconhecimento facial</h2>
      <p>
        Olhe para a câmera. A captura é automática, sem precisar virar o rosto.
        Sua conta será identificada pelo rosto cadastrado no perfil.
      </p>
      <FaceCapture
        purpose="login"
        onCancel={onCancel}
        onDone={() => undefined}
      />
    </section>
  );
}
