import { useEffect, useRef, useState } from 'react';
import { isAllowedUrl, isServiceHomeOrigin } from '../../../shared/domains';
import type { ServiceId, TeamsNotificationPayload } from '../../../shared/types';
import { SERVICES } from '../services';

export interface OpenRequest {
  url: string;
  n: number;
}

interface Props {
  service: ServiceId;
  visible: boolean;
  request?: OpenRequest;
}

type WebviewEl = HTMLElement & { loadURL(url: string): Promise<void> };

/** Une webview par service, montée au premier affichage puis seulement masquée. */
export function ServiceView({ service, visible, request }: Props): JSX.Element | null {
  const def = SERVICES.find((s) => s.id === service)!;
  const ref = useRef<WebviewEl | null>(null);
  const [teamsPreload, setTeamsPreload] = useState<string | null>(null);
  const [initial] = useState(() => (request && isServiceHomeOrigin(request.url) ? request.url : def.home));
  // Lien profond hors de l'origine d'accueil : on monte sur l'accueil puis on charge l'URL après dom-ready.
  const handled = useRef(request && isServiceHomeOrigin(request.url) ? request.n : 0);
  const ready = useRef(false);

  useEffect(() => {
    if (service !== 'teams') return;
    void window.epihub.teamsPreloadPath().then((p) => setTeamsPreload(p));
  }, [service]);

  const waiting = service === 'teams' && teamsPreload === null;

  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    const onReady = (): void => {
      ready.current = true;
    };
    wv.addEventListener('dom-ready', onReady);
    const cleanups: (() => void)[] = [() => wv.removeEventListener('dom-ready', onReady)];
    if (service === 'teams') {
      const on = <E extends Event>(name: string, fn: (e: E) => void): void => {
        wv.addEventListener(name, fn as EventListener);
        cleanups.push(() => wv.removeEventListener(name, fn as EventListener));
      };
      on<Event & { title: string }>('page-title-updated', (e) => void window.epihub.teamsTitle(e.title));
      on<Event & { url: string }>('did-navigate', (e) => void window.epihub.teamsNavigate(e.url));
      on<Event & { url: string }>('did-navigate-in-page', (e) => void window.epihub.teamsNavigate(e.url));
      on<Event & { channel: string; args: unknown[] }>('ipc-message', (e) => {
        if (e.channel === 'teams-notification') void window.epihub.teamsNotification(e.args[0] as TeamsNotificationPayload);
      });
    }
    return () => cleanups.forEach((c) => c());
  }, [service, waiting]);

  useEffect(() => {
    if (!request || request.n === handled.current) return;
    handled.current = request.n;
    if (!isAllowedUrl(request.url)) return;
    const wv = ref.current;
    if (!wv) return;
    const go = (): void => void wv.loadURL(request.url).catch(() => undefined);
    if (ready.current) go();
    else wv.addEventListener('dom-ready', go, { once: true });
  }, [request]);

  if (waiting) return null;
  return (
    <webview
      ref={ref as never}
      className="service-view"
      style={{ display: visible ? 'flex' : 'none' }}
      partition={def.partition}
      src={initial}
      {...({ allowpopups: 'true' } as object)}
      {...(service === 'teams' && teamsPreload ? { preload: teamsPreload } : {})}
    />
  );
}
