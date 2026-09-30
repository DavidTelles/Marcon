"""YuNet + SFace from the supplied Python prototype. JSON on stdin/stdout."""
import base64
import json
import os
import sys

import cv2
import numpy as np


def main():
    images = json.load(sys.stdin)["images"]
    if len(images) != 5:
        raise ValueError("São necessárias cinco fotos.")
    root = os.path.join(os.path.dirname(__file__), "models")
    detector = cv2.FaceDetectorYN.create(
        os.path.join(root, "face_detection_yunet_2023mar.onnx"),
        "", (320, 240), 0.8, 0.3, 5000,
    )
    recognizer = cv2.FaceRecognizerSF.create(
        os.path.join(root, "face_recognition_sface_2021dec.onnx"), ""
    )
    features = []
    for encoded in images:
        if not isinstance(encoded, str) or len(encoded) > 300000:
            raise ValueError("Imagem inválida.")
        raw = base64.b64decode(encoded, validate=True)
        frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None or frame.shape[0] < 240 or frame.shape[1] < 320:
            raise ValueError("Imagem inválida.")
        detector.setInputSize((frame.shape[1], frame.shape[0]))
        _, faces = detector.detect(frame)
        if faces is None or len(faces) != 1:
            raise ValueError("Mantenha apenas um rosto na câmera.")
        if min(faces[0][2], faces[0][3]) < 100:
            raise ValueError("Aproxime o rosto da câmera.")
        aligned = recognizer.alignCrop(frame, faces[0])
        features.append(recognizer.feature(aligned).reshape(-1).tolist())
    print(json.dumps({"embeddings": features}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
