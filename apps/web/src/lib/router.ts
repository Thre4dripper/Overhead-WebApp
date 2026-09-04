import { useEffect, useState } from 'react';

export type Route = 'home' | 'live' | 'docs';

export function currentRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/live') return 'live';
  if (path === '/docs' || path.startsWith('/docs/')) return 'docs';
  return 'home';
}

/** Which document `/docs/<slug>` refers to, or null on the bare `/docs`. */
export function docsSlug(): string | null {
  const m = /^\/docs\/([a-z0-9-]+)/.exec(window.location.pathname);
  return m ? m[1]! : null;
}

export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * The current path, re-rendering on navigation. `useRoute` is too coarse for the docs, where moving
 * from /docs/configuration to /docs/decisions keeps the same route but must still update the page.
 */
export function usePathname(): string {
  const [path, setPath] = useState<string>(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);
  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}
