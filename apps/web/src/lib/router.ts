import { useEffect, useState } from 'react';

export type Route = 'home' | 'live';

export function currentRoute(): Route {
  return window.location.pathname.replace(/\/+$/, '') === '/live' ? 'live' : 'home';
}

export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
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
