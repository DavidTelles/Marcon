"""YuNet + SFace from the supplied Python prototype. JSON on stdin/stdout."""
import base64
import json
import os
import sys

os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", "2000000")
try:
    import cv2
    import numpy as np
except ImportError:
    print(json.dumps({"error": "Dependências Python indisponíveis. Instale face/requirements.txt.", "kind": "service"}))
    sys.exit(2)


class CaptureError(ValueError):
    pass


def main():
    payload = json.load(sys.stdin)
    images = payload.get("images")
    poses = payload.get("poses", ["center"] * 5)
    if not isinstance(images, list) or len(images) != 5 or not isinstance(poses, list) or len(poses) != 5 or any(p not in ("center", "left", "right") for p in poses):
        raise CaptureError("São necessárias cinco fotos e posições válidas.")
    root = os.path.join(os.path.dirname(__file__), "models")
    detector = cv2.FaceDetectorYN.create(
        os.path.join(root, "face_detection_yunet_2023mar.onnx"),
        "", (320, 240), 0.8, 0.3, 5000,
    )
    recognizer = cv2.FaceRecognizerSF.create(
        os.path.join(root, "face_recognition_sface_2021dec.onnx"), ""
    )
    features = []
    previous = None
    for encoded, pose in zip(images, poses):
        if not isinstance(encoded, str) or len(encoded) > 300000:
            raise CaptureError("Imagem inválida.")
        try:
            raw = base64.b64decode(encoded, validate=True)
            frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception as error:
            raise CaptureError("Imagem ilegível.") from error
        if frame is None or frame.shape[0] < 240 or frame.shape[1] < 320:
            raise CaptureError("Imagem inválida.")
        detector.setInputSize((frame.shape[1], frame.shape[0]))
        _, faces = detector.detect(frame)
        if faces is None or len(faces) == 0:
            raise CaptureError("Nenhum rosto detectado. Verifique a iluminação e o enquadramento.")
        if len(faces) != 1:
            raise CaptureError("Vários rostos detectados. Mantenha apenas você na câmera.")
        if min(faces[0][2], faces[0][3]) < 100:
            raise CaptureError("Aproxime o rosto da câmera.")
        face = faces[0]
        eye_span = abs(float(face[4]) - float(face[6]))
        if eye_span < 10:
            raise CaptureError("Olhos não enquadrados. Ajuste a câmera.")
        yaw = (float(face[8]) - (float(face[4]) + float(face[6])) / 2) / eye_span
        if (pose == "center" and abs(yaw) > 0.22) or (pose == "left" and yaw > -0.18) or (pose == "right" and yaw < 0.18):
            raise CaptureError("A posição do rosto não corresponde ao desafio. Siga as instruções da captura.")
        gray = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 48)).astype(np.float32)
        if previous is not None and np.mean(np.abs(gray - previous)) < 0.25:
            raise CaptureError("Capturas repetidas. Use novas imagens da câmera.")
        previous = gray
        aligned = recognizer.alignCrop(frame, faces[0])
        features.append(recognizer.feature(aligned).reshape(-1).tolist())
    print(json.dumps({"embeddings": features}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error) if isinstance(error, CaptureError) else "Serviço facial indisponível ou imagem inválida.", "kind": "capture" if isinstance(error, CaptureError) else "service"}))
        sys.exit(1)
