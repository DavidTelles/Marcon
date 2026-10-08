"""Rebuild synthetic perspective fixtures for policy tests, not real PAD evidence."""
import pathlib
import cv2
import numpy as np

root = pathlib.Path(__file__).resolve().parents[1]
image = cv2.resize(cv2.imread(str(root / "tests/fixtures/ai-face.jpg")), (480, 480))
center = np.array([[1, 0, -240], [0, 1, -240], [0, 0, 1]], dtype=np.float32)
for pose, perspective in [("left", -.004), ("center", 0), ("right", .003)]:
    projection = np.array([[1, 0, 0], [0, 1, 0], [perspective, 0, 1]], dtype=np.float32)
    view = cv2.warpPerspective(image, np.linalg.inv(center) @ projection @ center, (480, 480), borderMode=cv2.BORDER_CONSTANT)
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[:, 80:560] = view
    assert cv2.imwrite(str(root / f"tests/fixtures/ai-face-{pose}.jpg"), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
print("Synthetic 640x480 fixtures generated; no real identity or photo/video resistance claim.")
