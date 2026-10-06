export class FaceServiceError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

export function faceServiceConfig(env = process.env) {
  const value = (env.FACE_SERVICE_URL || "").trim();
  if (!value)
    throw new FaceServiceError(
      "Configure FACE_SERVICE_URL do serviço Python para usar o reconhecimento facial hospedado.",
    );
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new FaceServiceError("FACE_SERVICE_URL inválida.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new FaceServiceError("FACE_SERVICE_URL inválida.");
  if (
    env.VERCEL &&
    (url.protocol !== "https:" ||
      /^(localhost|127(?:\.\d+){3}|\[::1\]|0\.0\.0\.0)$/i.test(url.hostname))
  )
    throw new FaceServiceError(
      "FACE_SERVICE_URL deve ser HTTPS e apontar para o serviço Python publicado.",
    );
  const token = env.FACE_SERVICE_TOKEN || "";
  if (token.length < 32)
    throw new FaceServiceError(
      "Configure FACE_SERVICE_TOKEN com pelo menos 32 caracteres nos dois projetos.",
    );
  return {
    base: url.href.replace(/\/+$/, ""),
    token,
    bypass: env.FACE_SERVICE_BYPASS_SECRET || "",
  };
}

export async function faceServiceRequest(path, payload, env = process.env) {
  const { base, token, bypass } = faceServiceConfig(env);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method: payload === undefined ? "GET" : "POST",
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new FaceServiceError(
      "Serviço facial indisponível ou tempo esgotado. Entre com senha.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new FaceServiceError(
      "O serviço facial respondeu sem JSON. Verifique a URL e a proteção do deployment.",
    );
  }
  if (!response.ok) {
    // Only capture errors are shown verbatim; infrastructure errors stay private.
    if (
      [400, 413, 415, 422].includes(response.status) &&
      result?.kind === "capture" &&
      typeof result.error === "string"
    )
      throw new FaceServiceError(result.error, 422);
    throw new FaceServiceError(
      "O serviço facial não confirmou o processamento. Verifique o serviço, o token e os modelos.",
    );
  }
  return result;
}
