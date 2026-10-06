"""Private facial feature extraction. No database, identity selection or sessions."""
import hmac
import json
import os
import threading

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from recognize import CaptureError, engines, extract

MODEL = "opencv-yunet-sface-2023mar-v1"
MAX_BODY = 1_600_000
engine_lock = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def reply(body, status=200):
    return JSONResponse(body, status_code=status, headers={"Cache-Control": "no-store"})


def authorization(request):
    expected = os.environ.get("FACE_SERVICE_TOKEN", "")
    if len(expected) < 32:
        return reply({"error": "Serviço facial não configurado."}, 503)
    supplied = request.headers.get("authorization", "")
    if not hmac.compare_digest(supplied.encode(), ("Bearer " + expected).encode()):
        return reply({"error": "Acesso não autorizado."}, 401)
    return None


def process(payload):
    # YuNet changes its input size. Do not share its mutable state concurrently.
    if not engine_lock.acquire(blocking=False):
        return reply({"error": "Serviço facial ocupado. Tente novamente."}, 503)
    try:
        return reply({"model": MODEL, **extract(payload)})
    except CaptureError as error:
        return reply({"error": str(error), "kind": "capture"}, 422)
    except Exception:
        # Never echo images, vectors, credentials or native OpenCV errors.
        return reply({"error": "Processamento facial indisponível.", "kind": "service"}, 503)
    finally:
        engine_lock.release()


@app.get("/health")
async def health(request: Request):
    denied = authorization(request)
    if denied is not None:
        return denied
    try:
        await run_in_threadpool(engines)
        return reply({"status": "ok", "model": MODEL, "dimensions": 128})
    except Exception:
        return reply({"error": "Modelos faciais indisponíveis."}, 503)


@app.post("/extract")
async def extract_request(request: Request):
    denied = authorization(request)
    if denied is not None:
        return denied
    if not request.headers.get("content-type", "").startswith("application/json"):
        return reply({"error": "Envie JSON."}, 415)
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_BODY:
            return reply({"error": "Captura muito grande."}, 413)
    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return reply({"error": "JSON inválido."}, 400)
    if not isinstance(payload, dict) or payload.get("model") != MODEL:
        return reply({"error": "Modelo facial inválido."}, 400)
    return await run_in_threadpool(process, payload)
