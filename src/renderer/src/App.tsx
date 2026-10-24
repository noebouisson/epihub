import { useCallback, useEffect, useState } from 'react';
import { isAllowedUrl } from '../../shared/domains';
import type { OpenTarget, ServiceId, ServiceSnapshot, Settings } from '../../shared/types';
import { ServiceView, type OpenRequest } from './components/ServiceView';
import { Sidebar } from './components/Sidebar';
import { SERVICES, type View } from './services';
import './styles/app.css';

export type Snapshot = { [K in ServiceId]: ServiceSnapshot<K> };
export type OpenFn = (service: ServiceId | 'app', url?: string) => void;

export function App(): JSX.Element {
  const [view, setView] = useState<View>('home');
  const [mounted, setMounted] = useState<Set<ServiceId>>(new Set());
  const [requests, setRequests] = useState<Partial<Record<ServiceId, OpenRequest>>>({});
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const select = useCallback((v: View) => {
    setView(v);
    if (v !== 'home' && v !== 'settings') setMounted((m) => (m.has(v) ? m : new Set(m).add(v)));
  }, []);

  const open: OpenFn = useCallback(
    (service, url) => {
      if (service === 'app') return select('home');
      if (url && isAllowedUrl(url)) setRequests((r) => ({ ...r, [service]: { url, n: (r[service]?.n ?? 0) + 1 } }));
      select(service);
    },
    [select]
  );

  useEffect(() => {
    void window.epihub.snapshot().then(setSnapshot);
    void window.epihub.getSettings().then(setSettings);
    const offChanged = window.epihub.onChanged(setSnapshot);
    const offOpen = window.epihub.onOpen((t: OpenTarget) => open(t.service, t.url));
    return () => {
      offChanged();
      offOpen();
    };
  }, [open]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? 'dark';
  }, [settings?.theme]);

  return (
    <div className="app">
      <Sidebar view={view} snapshot={snapshot} onSelect={select} />
      <main className="content">
        {view === 'home' && <div className="page"><h1>Accueil</h1></div>}
        {view === 'settings' && <div className="page"><h1>Réglages</h1></div>}
        {SERVICES.filter((s) => mounted.has(s.id)).map((s) => (
          <ServiceView key={s.id} service={s.id} visible={view === s.id} request={requests[s.id]} />
        ))}
      </main>
    </div>
  );
}
