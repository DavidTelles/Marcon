"""Real Python/model protocol checks on a synthetic fixture; no industrial identity or PAD claim."""
import base64
import json
import pathlib
import subprocess
import sys
import cv2
import numpy as np
root = pathlib.Path(__file__).resolve().parents[1]
fixture = cv2.imdecode(np.frombuffer((root / "tests/fixtures/ai-face.jpg").read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
assert fixture is not None
def encode(image):
    ok, data = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])
    assert ok
    return base64.b64encode(data).decode("ascii")
def run(images, poses=None):
    payload = {"images": images}
    if poses is not None: payload["poses"] = poses
    result = subprocess.run([sys.executable, str(root / "face/recognize.py")], input=json.dumps(payload), text=True, capture_output=True, timeout=35, cwd=root)
    return json.loads(result.stdout)
image = cv2.resize(fixture, (640, 640))
samples = [encode(cv2.convertScaleAbs(image, alpha=1, beta=i*4)) for i in range(5)]
baseline = run(samples)
assert len(baseline.get("embeddings", [])) == 5, baseline
assert all(len(v) == 128 for v in baseline["embeddings"])
blank = encode(np.full((640,640,3),128,dtype=np.uint8))
assert "Nenhum rosto" in run([blank]*5)["error"]
assert "repetidas" in run([samples[0]]*5)["error"]
assert "desafio" in run(samples,["left"]*5)["error"]
two = encode(np.concatenate([image,image],axis=1))
assert "Vários rostos" in run([two]*5)["error"]
assert run(["invalid"]*5)["kind"] == "capture"
evidence = {"engine": cv2.__version__, "vectors":5,"dimensions":128,"fixture":"synthetic, not an enrolled industrial user", "checks":["real YuNet/SFace extraction","no face","multiple faces","identical frames","wrong pose","illegible images"],"physicalIdentityTests":"not tested","photoVideoResistance":"not validated; password remains mandatory"}
target = root / ".validation/marcon-integrity/face-evidence.json"
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding="utf-8")
print("PASS: real Python YuNet/SFace protocol; 6 checks on synthetic image; authorized people/camera/PAD not tested.")
