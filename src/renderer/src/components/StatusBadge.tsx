import type { ServiceId, ServiceSnapshot } from '../../../shared/types';
import type { OpenFn } from '../App';
import type { View } from '../services';

interface Props {
  service: ServiceId;
  snap: ServiceSnapshot | undefined;
  open: OpenFn;
  setView(view: View): void;
  refresh(id: ServiceId): void;
}

const hhmm = (ts: number): string => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function StatusBadge({ service, snap, open, setView, refresh }: Props): JSX.Element | null {
  if (!snap) return <span className="badge badge-dim">Chargement…</span>;
  const stale = snap.data && snap.status.updatedAt ? <span className="badge badge-dim">données de {hhmm(snap.status.updatedAt)}</span> : null;
  // Au lancement, les données du cache s'affichent tout de suite avec leur date.
  if (snap.status.state === 'loading') return <span className="badge-group">{stale}<span className="badge badge-dim">Chargement…</span></span>;
  switch (snap.status.state) {
    case 'needs-login':
      return (
        <span className="badge-group">
          {stale}
          {service === 'github' ? (
            <button type="button" className="btn btn-small" onClick={() => setView('settings')}>Ajouter un token</button>
          ) : (
            <button type="button" className="btn btn-small" onClick={() => open(service)}>Reconnecte-toi</button>
          )}
        </span>
      );
    case 'error':
      return (
        <span className="badge-group">
          {stale}
          <span className="badge badge-danger" title={snap.status.message}>{snap.status.message ?? 'Erreur'}</span>
          <button type="button" className="btn btn-small" onClick={() => refresh(service)}>Réessayer</button>
        </span>
      );
    default:
      return stale;
  }
}
