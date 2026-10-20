type WindowCount = { count: number; expiresAt: number };
const windows = new Map<string, WindowCount>();

export function allowRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.expiresAt <= now) {
    windows.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
}
