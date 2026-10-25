import { useCallback, useEffect, useRef, useState } from 'react';
import { isAllowedUrl } from '../../shared/domains';
import type { OpenTarget, ServiceId, ServiceSnapshot, Settings } from '../../shared/types';
import { CommandPalette } from './components/CommandPalette';
import { ServiceView, type OpenRequest } from './components/ServiceView';
import { Sidebar } from './components/Sidebar';
import { Home } from './pages/Home';
import { Project } from './pages/Project';
import { Projects } from './pages/Projects';
import { Settings as SettingsPage } from './pages/Settings';
import { SERVICES, type View } from './services';
import './styles/app.css';

export type Snapshot = { [K in ServiceId]: ServiceSnapshot<K> };
export type OpenFn = (service: ServiceId | 'app', url?: string) => void;

export function App(): JSX.Element {
  const [view, setView] = useState<View>('home');
  // Teams est monté (caché) dès le lancement : non-lus et notifications disponibles sans ouvrir l'onglet.
  const [mounted, setMounted] = useState<Set<ServiceId>>(() => new Set<ServiceId>(['teams']));
  const [requests, setRequests] = useState<Partial<Record<ServiceId, OpenRequest>>>({});
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const select = useCallback((v: View) => {
    setView(v);
    if (v === 'projects') setProjectKey(null);
    if (v !== 'home' && v !== 'projects' && v !== 'settings') setMounted((m) => (m.has(v) ? m : new Set(m).add(v)));
  }, []);

  const open: OpenFn = useCallback(
    (service, url) => {
      if (service === 'app') return select('home');
      if (url && isAllowedUrl(url)) setRequests((r) => ({ ...r, [service]: { url, n: (r[service]?.n ?? 0) + 1 } }));
      select(service);
    },
    [select]
  );

  const openProject = useCallback((key: string) => {
    setProjectKey(key);
    setView('projects');
  }, []);

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
        {view === 'home' && <Home snapshot={snapshot} settings={settings} onSettings={setSettings} open={open} openProject={openProject} setView={select} toast={showToast} />}
        {view === 'projects' && (projectKey === null ? (
          <Projects openProject={openProject} />
        ) : (
          <Project key={projectKey} projectKey={projectKey} settings={settings} repos={snapshot?.github.data?.repos ?? []} open={open} toast={showToast} onSettings={setSettings} onBack={() => setProjectKey(null)} />
        ))}
        {view === 'settings' && <SettingsPage snapshot={snapshot} settings={settings} onSettings={setSettings} open={open} />}
        {SERVICES.filter((s) => mounted.has(s.id)).map((s) => (
          <ServiceView key={s.id} service={s.id} visible={view === s.id} request={requests[s.id]} state={snapshot?.[s.id].status.state} />
        ))}
      </main>
      <CommandPalette open={open} setView={select} openProject={openProject} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
