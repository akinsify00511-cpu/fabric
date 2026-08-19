import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * RouteMeta — the runtime half of the public/private discovery boundary
 * (Discovery Intelligence B3, complements public/robots.txt).
 *
 * The SPA serves one index.html for every route, so the static
 * `<meta name="robots" content="index, follow">` would also be seen by
 * JS-rendering crawlers (Googlebot renders JS) on /app/*. This component
 * rewrites the robots meta on every route change: public surfaces stay
 * indexable, everything else is noindex,nofollow.
 *
 * robots.txt is the first line of defense; this is the defense-in-depth
 * guard for render-capable crawlers and for in-page link following.
 *
 * The public set mirrors public/robots.txt + sitemap.xml: marketing,
 * signup/login, public booking, public lead capture, and the legal/help
 * pages. Token-bearing and operator surfaces are always noindex.
 */

const PUBLIC_ROUTES = new Set([
  '/',
  '/v1',
  '/pricing',
  '/signup',
  '/login',
  '/book',
  '/leads',
  '/lead',
  '/privacy',
  '/terms',
  '/cookies',
  '/contact',
  '/knowledge',
]);

// Prefixes that are public with a dynamic tail (e.g. /book/:slug).
const PUBLIC_PREFIXES = ['/book/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function RouteMeta() {
  const location = useLocation();

  useEffect(() => {
    const content = isPublic(location.pathname)
      ? 'index, follow, max-image-preview:large, max-snippet:-1'
      : 'noindex, nofollow';

    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  }, [location.pathname]);

  return null;
}
