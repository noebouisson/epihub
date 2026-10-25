import type { ReactNode } from 'react';
import type { ServiceId, ServiceSnapshot } from '../../../shared/types';
import type { OpenFn } from '../App';
import type { View } from '../services';
import { StatusBadge } from './StatusBadge';

interface Props {
  title: string;
  service?: ServiceId;
  snap?: ServiceSnapshot;
  open?: OpenFn;
  setView?(view: View): void;
  refresh?(id: ServiceId): void;
  /** Pastille d'état personnalisée (cartes sans service). */
  badge?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
}

export function Card({ title, service, snap, open, setView, refresh, wide, badge, children }: Props): JSX.Element {
  const showBody = !service || service === 'teams' || snap?.data;
  return (
    <section className={`card${wide ? ' card-wide' : ''}`}>
      <header className="card-head">
        <h2>{title}</h2>
        {service && open && setView && refresh && <StatusBadge service={service} snap={snap} open={open} setView={setView} refresh={refresh} />}
        {badge}
      </header>
      {showBody ? <div className="card-body">{children}</div> : null}
    </section>
  );
}
