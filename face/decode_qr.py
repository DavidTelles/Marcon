"""Decode original label images. Printed/OCR numbers never supply QR contents."""
import cv2
import hashlib
import json
import pathlib
import sys
source = pathlib.Path(sys.argv[1])
data = source.read_bytes()
image = cv2.imread(str(source))
if image is None:
    raise SystemExit("Imagem ilegível")
detector = cv2.QRCodeDetector()
ok, values, polygons, _ = detector.detectAndDecodeMulti(image)
records = []
if polygons is not None:
    for index, polygon in enumerate(polygons):
        value = values[index] if index < len(values) else ""
        records.append({"index": index, "polygon": polygon.tolist(), "content": value if value else None, "status": "decoded" if value else "illegible", "confirmedMaterial": None})
else:
    value, polygon, _ = detector.detectAndDecode(image)
    if polygon is not None:
        records.append({"index": 0, "polygon": polygon.tolist(), "content": value if value else None, "status": "decoded" if value else "illegible", "confirmedMaterial": None})
print(json.dumps({"file": source.name, "sha256": hashlib.sha256(data).hexdigest(), "detected": len(records), "records": records, "note": "Vínculo com material exige confirmação; conteúdo não é executado."}, ensure_ascii=False))
