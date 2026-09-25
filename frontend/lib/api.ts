/**
 * API base URL including the `/api` path segment.
 *
 * - `NEXT_PUBLIC_API_URL` set → direct calls to that host (production / custom).
 * - unset in the browser → same-origin `/api` (proxied to Laravel via Next.js rewrites).
 */
/** Laravel app origin (no `/api`) — used for `/storage` asset URLs in local dev. */
export function getBackendOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
  return (process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000').replace(/\/+$/, '');
}

/** Normalize storage/media paths for browser use (proxied to Laravel in dev). */
export function resolveStorageAssetUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';

  if (raw.startsWith('/storage/') || raw.startsWith('/media/')) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith('/storage/') || parsed.pathname.startsWith('/media/')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      // Fall through to path normalization.
    }

    const backendOrigin = getBackendOrigin().replace(/\/+$/, '');
    if (raw.startsWith(backendOrigin)) {
      const relative = raw.slice(backendOrigin.length);
      return relative.startsWith('/') ? relative : `/${relative}`;
    }
  }

  const normalized = raw.replace(/^public\//, '').replace(/^\/+/, '');
  if (normalized.startsWith('storage/') || normalized.startsWith('media/')) {
    return `/${normalized}`;
  }

  return `/storage/${normalized}`;
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    const normalized = configured.replace(/\/+$/, '');
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
  }

  if (typeof window !== 'undefined') {
    return '/api';
  }

  const target = (process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000').replace(/\/+$/, '');
  return target.endsWith('/api') ? target : `${target}/api`;
}
