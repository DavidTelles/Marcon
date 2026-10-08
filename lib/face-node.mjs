import { join } from "node:path";
import sharp from "sharp";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { faceCapturePolicy, acceptsFacePose } from "./face-capture-policy.mjs";

// Same YuNet/SFace models and preprocessing as OpenCV FaceDetectorYN /
// FaceRecognizerSF. Runs on CPU inside the Node function, including Vercel.
// No images, landmarks or embeddings are written to disk or logged.
export class FaceEngineError extends Error {
  constructor(message, status = 503, options = undefined) {
    super(message, options);
    this.status = status;
  }
}

let sessions;
let processing = false;
export function faceEngine(env = process.env) {
  const engine = env.FACE_ENGINE?.trim() || "node";
  if (!["node", "remote", "python"].includes(engine) || (engine === "python" && env.VERCEL))
    throw new FaceEngineError("Motor facial inválido para esta hospedagem.");
  return engine;
}
async function engines() {
  if (!sessions) {
    const options = {
      executionProviders: ["cpu"],
      intraOpNumThreads: 2,
      interOpNumThreads: 1,
      graphOptimizationLevel: "all",
      logSeverityLevel: 3,
    };
    const models = join(process.cwd(), "face", "models");
    sessions = (async () => {
      const detector = await InferenceSession.create(
        join(models, "face_detection_yunet_2023mar.onnx"), options,
      );
      let recognizer;
      try {
        recognizer = await InferenceSession.create(
          join(models, "face_recognition_sface_2021dec.onnx"), options,
        );
        // Warm up both graphs once. Readiness verifies real CPU inference on
        // this host, without requiring any person's image or returning vectors.
        const detection = await detector.run({
          [detector.inputNames[0]]: new Tensor("float32", new Float32Array(3 * 640 * 640), [1, 3, 640, 640]),
        });
        const recognition = await recognizer.run({
          [recognizer.inputNames[0]]: new Tensor("float32", new Float32Array(3 * 112 * 112), [1, 3, 112, 112]),
        });
        const vector = recognition[recognizer.outputNames[0]].data;
        if (!detection.cls_8 || vector.length !== 128 || !Array.from(vector).every(Number.isFinite))
          throw new Error("Incompatible model outputs");
        return { detector, recognizer };
      } catch (error) {
        await Promise.allSettled([detector.release(), ...(recognizer ? [recognizer.release()] : [])]);
        throw error;
      }
    })().catch(() => {
      sessions = undefined;
      throw new FaceEngineError("Não foi possível carregar os modelos faciais.");
    });
  }
  return sessions;
}

export async function checkNodeFaceEngine() {
  await engines();
  return { status: "ok", model: "opencv-yunet-sface-2023mar-v1", dimensions: 128 };
}

async function decode(encoded) {
  if (typeof encoded !== "string" || !encoded.length || encoded.length > 300000 ||
    encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new FaceEngineError("Imagem inválida.", 422);
  try {
    const { data, info } = await sharp(Buffer.from(encoded, "base64"), {
      limitInputPixels: 2_000_000,
      failOn: "error",
    }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    if (info.width < 320 || info.height < 240 || info.channels !== 3)
      throw new Error("dimensions");
    return { data, width: info.width, height: info.height };
  } catch {
    throw new FaceEngineError("Imagem ilegível ou dimensão inválida.", 422);
  }
}

function intersection(a, b) {
  // OpenCV NMS uses integer bounding boxes (truncation toward zero).
  const [ax, ay, aw, ah] = a.slice(0, 4).map(Math.trunc);
  const [bx, by, bw, bh] = b.slice(0, 4).map(Math.trunc);
  const overlap = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx)) *
    Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  return overlap / (aw * ah + bw * bh - overlap || 1);
}

async function detect(frame, detector) {
  // The distributed ONNX graph declares a fixed 640x640 input. Letterbox
  // other camera aspect ratios; map landmarks back before aligning SFace.
  const pw = 640, ph = 640;
  const scale = Math.min(1, pw / frame.width, ph / frame.height);
  const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale);
  const data = width === frame.width && height === frame.height ? frame.data :
    await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 3 } })
      .resize(width, height, { kernel: "linear" }).raw().toBuffer();
  const scaleX = width / frame.width, scaleY = height / frame.height;
  const plane = pw * ph;
  const input = new Float32Array(3 * plane);
  // YuNet takes unscaled BGR, padded black on the right/bottom.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (y * width + x) * 3, dst = y * pw + x;
    input[dst] = data[src + 2];
    input[plane + dst] = data[src + 1];
    input[2 * plane + dst] = data[src];
  }
  const outputs = await detector.run({
    [detector.inputNames[0]]: new Tensor("float32", input, [1, 3, ph, pw]),
  });
  const faces = [];
  for (const stride of [8, 16, 32]) {
    const cls = outputs[`cls_${stride}`].data, obj = outputs[`obj_${stride}`].data;
    const box = outputs[`bbox_${stride}`].data, kps = outputs[`kps_${stride}`].data;
    const cols = pw / stride;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < 0.8) continue;
      const c = i % cols, r = Math.floor(i / cols);
      const w = Math.exp(box[i * 4 + 2]) * stride, h = Math.exp(box[i * 4 + 3]) * stride;
      const face = [(c + box[i * 4]) * stride - w / 2, (r + box[i * 4 + 1]) * stride - h / 2, w, h];
      for (let n = 0; n < 5; n++) {
        face.push((kps[i * 10 + 2 * n] + c) * stride, (kps[i * 10 + 2 * n + 1] + r) * stride);
      }
      for (let n = 0; n < 14; n++) face[n] /= n % 2 === 0 ? scaleX : scaleY;
      face.push(score);
      if (face.every(Number.isFinite)) faces.push(face);
    }
  }
  const kept = [];
  for (const face of faces.sort((a, b) => b[14] - a[14]).slice(0, 5000)) {
    if (kept.every((other) => intersection(face, other) <= 0.3)) kept.push(face);
  }
  return kept;
}

function align(frame, face) {
  // 2D least-squares similarity transform (Umeyama, positive orientation).
  const reference = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
  const mx = face.filter((_, i) => i >= 4 && i < 14 && i % 2 === 0).reduce((a, b) => a + b, 0) / 5;
  const my = face.filter((_, i) => i >= 4 && i < 14 && i % 2 === 1).reduce((a, b) => a + b, 0) / 5;
  const dx = 56.0262, dy = 71.9008;
  let numeratorA = 0, numeratorB = 0, denominator = 0;
  for (let i = 0; i < 5; i++) {
    const x = face[4 + 2 * i] - mx, y = face[5 + 2 * i] - my;
    const u = reference[i][0] - dx, v = reference[i][1] - dy;
    numeratorA += x * u + y * v;
    numeratorB += x * v - y * u;
    denominator += x * x + y * y;
  }
  const a = numeratorA / denominator, b = numeratorB / denominator;
  const tx = dx - a * mx + b * my, ty = dy - b * mx - a * my;
  const inverse = a * a + b * b;
  if (!Number.isFinite(inverse) || inverse < 1e-10)
    throw new FaceEngineError("Rosto não enquadrado. Ajuste a câmera.", 422);
  const out = new Float32Array(3 * 112 * 112);
  const pixel = (x, y, channel) => x < 0 || y < 0 || x >= frame.width || y >= frame.height
    ? 0 : frame.data[(y * frame.width + x) * 3 + channel];
  for (let y = 0; y < 112; y++) for (let x = 0; x < 112; x++) {
    // OpenCV INTER_LINEAR quantizes the sampling fractions to 1/32.
    const sx = Math.round(((a * (x - tx) + b * (y - ty)) / inverse) * 32) / 32;
    const sy = Math.round(((-b * (x - tx) + a * (y - ty)) / inverse) * 32) / 32;
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    for (let c = 0; c < 3; c++) {
      out[c * 112 * 112 + y * 112 + x] = Math.round(
        pixel(ix, iy, c) * (1 - fx) * (1 - fy) + pixel(ix + 1, iy, c) * fx * (1 - fy) +
        pixel(ix, iy + 1, c) * (1 - fx) * fy + pixel(ix + 1, iy + 1, c) * fx * fy,
      );
    }
  }
  // SFace takes unscaled RGB (OpenCV blobFromImage(..., swapRB=true)).
  return new Tensor("float32", out, [1, 3, 112, 112]);
}

async function gray(frame) {
  return sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 3 } })
    .greyscale().resize(64, 48, { kernel: "linear" }).raw().toBuffer();
}

export async function extractNodeFaces(images, poses, purpose = "register") {
  if (!["register", "login"].includes(purpose))
    throw new FaceEngineError("Finalidade facial inválida.", 422);
  const policy = faceCapturePolicy(purpose);
  poses ??= Array(policy.count).fill("center");
  if (!Array.isArray(images) || images.length !== policy.count || !Array.isArray(poses) || poses.length !== policy.count ||
    poses.some((pose) => !(purpose === "login" ? ["center"] : ["center", "left", "right"]).includes(pose)))
    throw new FaceEngineError("Quantidade de fotos ou posições inválidas.", 422);
  if (processing) throw new FaceEngineError("Análise facial em andamento. Tente novamente em instantes.");
  processing = true;
  try {
    const { detector, recognizer } = await engines();
    const embeddings = [];
    let previous;
    for (let i = 0; i < images.length; i++) {
      const frame = await decode(images[i]);
      const faces = await detect(frame, detector);
      if (!faces.length)
        throw new FaceEngineError("Nenhum rosto detectado. Verifique a iluminação e o enquadramento.", 422);
      if (faces.length !== 1)
        throw new FaceEngineError("Vários rostos detectados. Mantenha apenas você na câmera.", 422);
      const face = faces[0];
      if (Math.min(face[2], face[3]) < 100)
        throw new FaceEngineError("Aproxime o rosto da câmera.", 422);
      const eyeSpan = Math.abs(face[4] - face[6]);
      if (eyeSpan < 10) throw new FaceEngineError("Olhos não enquadrados. Ajuste a câmera.", 422);
      const yaw = (face[8] - (face[4] + face[6]) / 2) / eyeSpan;
      if (!acceptsFacePose(yaw, poses[i], purpose))
        throw new FaceEngineError("A posição do rosto não corresponde ao desafio. Vire levemente para o lado pedido ou olhe de frente.", 422);
      const current = await gray(frame);
      if (previous && current.reduce((sum, value, index) => sum + Math.abs(value - previous[index]), 0) / current.length < policy.minimumFrameDifference)
        throw new FaceEngineError("Capturas repetidas. Use novas imagens da câmera.", 422);
      previous = current;
      const output = await recognizer.run({ [recognizer.inputNames[0]]: align(frame, face) });
      const vector = Array.from(output[recognizer.outputNames[0]].data);
      if (vector.length !== 128 || !vector.every((value) => Number.isFinite(value) && Math.abs(value) <= 100))
        throw new FaceEngineError("Resposta facial inválida.");
      embeddings.push(vector);
    }
    return embeddings;
  } catch (error) {
    if (error instanceof FaceEngineError) throw error;
    throw new FaceEngineError("Serviço facial indisponível ou imagem inválida.", 503, { cause: error });
  } finally {
    processing = false;
  }
}
