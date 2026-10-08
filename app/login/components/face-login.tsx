"use client";
import { FaceCapture } from "@/app/components/face/face-capture";
import styles from "../login.module.css";
export function FaceLogin({
  identity,
  password,
  onCancel,
}: {
  identity: string;
  password: string;
  onCancel: () => void;
}) {
  return (
    <section className={styles.faceTest} aria-labelledby="local-face-title">
      <h2 id="local-face-title">Entrar com reconhecimento facial</h2>
      <p>
        Olhe para a câmera. A captura é automática, sem precisar virar o rosto. A senha é exigida
        como confirmação adicional: a proteção contra foto e vídeo ainda não foi validada.
      </p>
      <FaceCapture
        purpose="login"
        identity={identity}
        password={password}
        onCancel={onCancel}
        onDone={() => undefined}
      />
    </section>
  );
}
