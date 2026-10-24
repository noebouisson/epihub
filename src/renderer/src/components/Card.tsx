import type { ReactNode } from 'react';
import type { ServiceId, ServiceSnapshot } from '../../../shared/types';
import type { OpenFn } from '../App';
import type { View } from '../services';
import { StatusBadge } from './StatusBadge';

interface Props {
  title: string;
  service?: ServiceId;
  snap?: ServiceSnapshot;
  open: OpenFn;
  setView(view: View): void;
  refresh(id: ServiceId): void;
  wide?: boolean;
  children?: ReactNode;
}

export function Card({ title, service, snap, open, setView, refresh, wide, children }: Props): JSX.Element {
  const showBody = !service || service === 'teams' || snap?.data;
  return (
    <section className={`card${wide ? ' card-wide' : ''}`}>
      <header className="card-head">
        <h2>{title}</h2>
        {service && <StatusBadge service={service} snap={snap} open={open} setView={setView} refresh={refresh} />}
      </header>
      {showBody ? <div className="card-body">{children}</div> : null}
    </section>
  );
}
