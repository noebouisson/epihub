import { useEffect, useRef, useState } from 'react';
import { isAllowedUrl, isServiceHomeOrigin, shouldRefreshAfterLogin } from '../../../shared/domains';
import type { ServiceId, ServiceState, TeamsNotificationPayload } from '../../../shared/types';
import { SERVICES } from '../services';
import { userRefreshArgs } from '../refresh';

export interface OpenRequest {
  url: string;
  n: number;
}

interface Props {
  service: ServiceId;
  visible: boolean;
  request?: OpenRequest;
  /** État du service dans l'accueil (pour rafraîchir juste après une connexion). */
  state?: ServiceState;
}

type WebviewEl = HTMLElement & { loadURL(url: string): Promise<void>; getURL(): string };

const LOGIN_REFRESH_DELAY = 2000;

// Masquée sans display:none : la webview reste dimensionnée et chargée (utile pour Teams monté au lancement).
const HIDDEN_STYLE = { display: 'flex', position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none', zIndex: -1 } as const;

/** Une webview par service, montée au premier affichage puis seulement masquée. */
export function ServiceView({ service, visible, request, state }: Props): JSX.Element | null {
  const def = SERVICES.find((s) => s.id === service)!;
  const ref = useRef<WebviewEl | null>(null);
  const [teamsPreload, setTeamsPreload] = useState<string | null>(null);
  const [initial] = useState(() => (request && isServiceHomeOrigin(request.url) ? request.url : def.home));
  // Lien profond hors de l'origine d'accueil : on monte sur l'accueil puis on charge l'URL après dom-ready.
  const handled = useRef(request && isServiceHomeOrigin(request.url) ? request.n : 0);
  const ready = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

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
    // Retour sur l'origine du service alors que l'accueil indique « connexion requise » :
    // l'utilisateur vient de se connecter → rafraîchissement (regroupé sur 2 s).
    let loginTimer: ReturnType<typeof setTimeout> | undefined;
    const onLoaded = (): void => {
      let url = '';
      try {
        url = wv.getURL();
      } catch {
        return;
      }
      if (!shouldRefreshAfterLogin(service, url, stateRef.current)) return;
      clearTimeout(loginTimer);
      loginTimer = setTimeout(() => {
        if (stateRef.current === 'needs-login') void window.epihub.refresh(...userRefreshArgs(service)).catch(() => undefined);
      }, LOGIN_REFRESH_DELAY);
    };
    wv.addEventListener('did-navigate', onLoaded);
    wv.addEventListener('did-stop-loading', onLoaded);
    const cleanups: (() => void)[] = [
      () => wv.removeEventListener('dom-ready', onReady),
      () => wv.removeEventListener('did-navigate', onLoaded),
      () => wv.removeEventListener('did-stop-loading', onLoaded),
      () => clearTimeout(loginTimer)
    ];
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
      style={visible ? { display: 'flex' } : HIDDEN_STYLE}
      partition={def.partition}
      src={initial}
      {...({ allowpopups: 'true' } as object)}
      {...(service === 'teams' && teamsPreload ? { preload: teamsPreload } : {})}
    />
  );
}
