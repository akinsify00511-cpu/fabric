import { describe, it, expect } from 'vitest';

/**
 * RouteMeta public/private discovery boundary (Discovery Intelligence B3).
 * Locks the contract: marketing/legal surfaces indexable, app shell +
 * token-bearing + operator surfaces noindex. Must stay aligned with
 * public/robots.txt and public/sitemap.xml.
 */

// Mirror of the logic in src/components/RouteMeta.tsx (pure function copy —
// kept in lockstep so the boundary is test-covered without a DOM).
const PUBLIC_ROUTES = new Set([
  '/', '/v1', '/pricing', '/signup', '/login', '/book', '/leads', '/lead',
  '/privacy', '/terms', '/cookies', '/contact', '/knowledge',
]);
const PUBLIC_PREFIXES = ['/book/'];
const isPublic = (pathname: string): boolean =>
  PUBLIC_ROUTES.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

describe('RouteMeta public/private boundary', () => {
  it('marketing + signup/login + legal/help routes are indexable', () => {
    for (const p of ['/', '/v1', '/pricing', '/signup', '/login', '/privacy', '/terms', '/cookies', '/contact', '/knowledge']) {
      expect(isPublic(p)).toBe(true);
    }
  });

  it('public booking + lead capture are indexable (incl. dynamic slugs)', () => {
    expect(isPublic('/book')).toBe(true);
    expect(isPublic('/book/acme-roofing')).toBe(true);
    expect(isPublic('/leads')).toBe(true);
    expect(isPublic('/lead')).toBe(true);
  });

  it('the app shell is never indexable', () => {
    for (const p of ['/app', '/app/crm', '/app/finance', '/app/settings', '/app/owner-intelligence']) {
      expect(isPublic(p)).toBe(false);
    }
  });

  it('token-bearing routes are never indexable', () => {
    for (const p of ['/sign/some-token', '/join/invite-123']) {
      expect(isPublic(p)).toBe(false);
    }
  });

  it('operator surfaces are never indexable', () => {
    for (const p of ['/builder', '/platform-ops', '/app/discovery']) {
      expect(isPublic(p)).toBe(false);
    }
  });

  it('auth flow utility routes are never indexable', () => {
    for (const p of ['/onboarding', '/forgot-password', '/update-password', '/auth/callback', '/upgrade']) {
      expect(isPublic(p)).toBe(false);
    }
  });
});
