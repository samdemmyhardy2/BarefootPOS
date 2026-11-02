function apiOrigin() {
  const base = import.meta.env.VITE_API_URL || "/api";
  if (base.startsWith("/")) return "";
  try {
    return new URL(base, window.location.href).origin;
  } catch {
    return "";
  }
}

/** Uploaded files are stored as /uploads/... so a changed LAN address does not break them. */
export function mediaSrc(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.pathname.startsWith("/uploads/")) return `${apiOrigin()}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
  return url;
}
