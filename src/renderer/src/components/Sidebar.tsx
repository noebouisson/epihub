import type { ServiceId, ServiceSnapshot } from '../../../shared/types';
import { SERVICES, type View } from '../services';

type Snapshot = { [K in ServiceId]: ServiceSnapshot<K> } | null;

interface Props {
  view: View;
  snapshot: Snapshot;
  onSelect(view: View): void;
}

export function Sidebar({ view, snapshot, onSelect }: Props): JSX.Element {
  const item = (id: View, icon: string, label: string, badge?: JSX.Element | null): JSX.Element => (
    <button key={id} type="button" className={`nav-item${view === id ? ' active' : ''}`} onClick={() => onSelect(id)} title={label}>
      <span className="nav-icon" aria-hidden="true">{icon}</span>
      <span className="nav-label">{label}</span>
      {badge}
    </button>
  );
  const icons: Record<ServiceId, string> = { github: '⌥', intra: '🎓', myepitech: '📊', teams: '💬' };
  return (
    <nav className="sidebar" aria-label="Navigation">
      <div className="brand">
        <span className="brand-mark">E</span>
        <span className="brand-name">EpiHub</span>
      </div>
      {item('home', '⌂', 'Accueil')}
      {item('projects', '📁', 'Projets')}
      {SERVICES.map((s) => {
        const snap = snapshot?.[s.id];
        const needsLogin = snap?.status.state === 'needs-login';
        const unread = s.id === 'teams' ? (snapshot?.teams.data?.unread ?? 0) : 0;
        let badge: JSX.Element | null = null;
        if (needsLogin) badge = <span className="dot dot-red" title="Connexion requise" />;
        else if (unread > 0) badge = <span className="pill">{unread > 99 ? '99+' : unread}</span>;
        return item(s.id, icons[s.id], s.label, badge);
      })}
      <div className="nav-spacer" />
      {item('settings', '⚙', 'Réglages')}
      <div className="hint nav-label">Ctrl+K pour chercher</div>
    </nav>
  );
}
