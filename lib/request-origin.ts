// Next may normalize request.nextUrl to localhost when running behind a host alias.
// Validate against the incoming authority and protocol instead of that internal URL.
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin"),
    host = request.headers.get("host");
  if (!origin || !host || !/^[a-z0-9.\-:[\]]+$/i.test(host)) return false;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    new URL(request.url).protocol.replace(":", "");
  if (protocol !== "http" && protocol !== "https") return false;
  try {
    const supplied = new URL(origin);
    return origin === supplied.origin && supplied.origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
