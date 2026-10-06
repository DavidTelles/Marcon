// A null target means the backend runs in the same Node.js function as Next.
export function backendTarget(env = process.env) {
  const value = (env.BACKEND_URL || "").trim();
  if (!value || value === "embedded") return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "BACKEND_URL inválida. Use embedded ou a URL HTTPS do backend separado.",
    );
  }
  const local = /^(localhost|127(?:\.\d+){3}|\[::1\]|0\.0\.0\.0)$/i.test(
    url.hostname,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "BACKEND_URL inválida. Use embedded ou a URL HTTPS do backend separado.",
    );
  if (env.VERCEL && (url.protocol !== "https:" || local))
    throw new Error(
      "Na Vercel, use BACKEND_URL=embedded ou a URL HTTPS de um backend separado; localhost não está disponível.",
    );
  const frontendHosts = [
    env.VERCEL_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_BRANCH_URL,
  ]
    .filter(Boolean)
    .map((value) =>
      value
        .replace(/^https?:\/\//, "")
        .split("/")[0]
        .toLowerCase(),
    );
  if (
    env.VERCEL &&
    url.pathname === "/" &&
    frontendHosts.includes(url.host.toLowerCase())
  )
    throw new Error(
      "BACKEND_URL aponta para o próprio frontend. Use embedded ou a URL de um backend separado.",
    );
  return url.href.replace(/\/+$/, "");
}
