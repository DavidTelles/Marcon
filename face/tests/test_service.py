import base64
import os
from pathlib import Path
import sys
import unittest

import cv2
import numpy as np
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "face"))
from app import app, engine_lock, MODEL

TOKEN = "service-test-token-at-least-32-characters"
os.environ["FACE_SERVICE_TOKEN"] = TOKEN
client = TestClient(app)
headers = {"Authorization": "Bearer " + TOKEN}


def encode(image):
    ok, data = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])
    assert ok
    return base64.b64encode(data).decode("ascii")


class FacialServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture = cv2.imdecode(np.frombuffer((ROOT / "tests/fixtures/ai-face.jpg").read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
        image = cv2.resize(fixture, (640, 640))
        cls.images = [encode(cv2.convertScaleAbs(image, alpha=1, beta=i * 4)) for i in range(5)]

    def payload(self, images=None, poses=None):
        return {"model": MODEL, "images": images or self.images, "poses": poses or ["center"] * 5}

    def test_private_endpoints_reject_missing_and_invalid_tokens(self):
        self.assertEqual(client.get("/health").status_code, 401)
        self.assertEqual(client.post("/extract", json=self.payload()).status_code, 401)
        self.assertEqual(client.get("/health", headers={"Authorization": "Bearer invalid"}).status_code, 401)

    def test_health_loads_real_models(self):
        response = client.get("/health", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["model"], MODEL)

    def test_real_extraction_returns_five_128_dimension_vectors(self):
        response = client.post("/extract", headers=headers, json=self.payload())
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["model"], MODEL)
        self.assertEqual(len(result["embeddings"]), 5)
        self.assertTrue(all(len(vector) == 128 for vector in result["embeddings"]))
        self.assertNotIn("token", result)

    def test_automatic_login_accepts_three_frontal_frames_only(self):
        payload = {"model": MODEL, "purpose": "login", "images": self.images[:3], "poses": ["center"] * 3}
        response = client.post("/extract", headers=headers, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()["embeddings"]), 3)
        for invalid in [{**payload, "images": self.images}, {**payload, "poses": ["left"] * 3}, {**payload, "purpose": "register"}]:
            self.assertEqual(client.post("/extract", headers=headers, json=invalid).status_code, 422)

    def test_pose_challenge_and_repeated_frames_are_rejected(self):
        for payload in [self.payload(poses=["left"] * 5), self.payload(images=[self.images[0]] * 5)]:
            response = client.post("/extract", headers=headers, json=payload)
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["kind"], "capture")

    def test_missing_face_is_rejected(self):
        blank = encode(np.full((640, 640, 3), 128, dtype=np.uint8))
        response = client.post("/extract", headers=headers, json=self.payload(images=[blank] * 5))
        self.assertEqual(response.status_code, 422)

    def test_limits_content_type_and_model_are_enforced(self):
        self.assertEqual(client.post("/extract", headers=headers, content="{}").status_code, 415)
        self.assertEqual(client.post("/extract", headers={**headers, "Content-Type": "application/json"}, content="{").status_code, 400)
        self.assertEqual(client.post("/extract", headers=headers, json={"model": "wrong"}).status_code, 400)
        self.assertEqual(client.post("/extract", headers={**headers, "Content-Type": "application/json"}, content="x" * 1_600_001).status_code, 413)

    def test_busy_engine_rejects_concurrent_work(self):
        engine_lock.acquire()
        try:
            self.assertEqual(client.post("/extract", headers=headers, json=self.payload()).status_code, 503)
        finally:
            engine_lock.release()


if __name__ == "__main__":
    unittest.main()
