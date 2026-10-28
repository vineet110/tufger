/** Public address of the site (server-side). Vercel sets VERCEL_PROJECT_PRODUCTION_URL, e.g. "tufger.vercel.app". */
export function siteUrl(): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : "http://localhost:3100";
}

/** FastAPI base URL for server-side fetches (link-preview images). */
export function serverApiBase(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `${siteUrl()}/api/py`;
  return `${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8100"}/api/py`;
}
