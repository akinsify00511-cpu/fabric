import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * RouteMeta keeps the marketing domain indexable while the application host
 * remains a private product surface. The SPA serves one index.html for every
 * route, so metadata must be corrected at runtime after the host/path is known.
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

const PUBLIC_PREFIXES = ['/book/'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function setUrlMeta(selector: string, url: string, attribute: 'href' | 'content') {
  const element = document.querySelector<HTMLLinkElement | HTMLMetaElement>(selector);
  if (element) element.setAttribute(attribute, url);
}

export function RouteMeta() {
  const location = useLocation();

  useEffect(() => {
    const isAppHost = window.location.hostname === 'app.avenize.com';
    const appUrl = `https://app.avenize.com${location.pathname}${location.search}`;
    const marketingUrl = `https://avenize.com${location.pathname}`;

    // The application is never a search surface, even for public auth screens.
    const content = isAppHost
      ? 'noindex, nofollow'
      : isPublic(location.pathname)
        ? 'index, follow, max-image-preview:large, max-snippet:-1'
        : 'noindex, nofollow';

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', content);

    const canonical = isAppHost ? appUrl : marketingUrl;
    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonical);

    setUrlMeta('meta[property="og:url"]', canonical, 'content');
    setUrlMeta('meta[name="twitter:url"]', canonical, 'content');

    if (isAppHost) {
      document.title = 'Avenize App | Business Operating System';
      setUrlMeta('meta[name="googlebot"]', 'noindex, nofollow', 'content');
    } else {
      document.title = 'Avenize - The Business Operating System | CRM, Projects, Finance in One Platform';
      setUrlMeta('meta[name="googlebot"]', content, 'content');
    }
  }, [location.pathname, location.search]);

  return null;
}
