import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeadlineView, Repo, Settings } from '../../../shared/types';

interface Props {
  deadline: DeadlineView;
  repos: Repo[];
  settings: Settings;
  onSaved(settings: Settings): void;
  onClose(): void;
}

export function RepoPicker({ deadline, repos, settings, onSaved, onClose }: Props): JSX.Element {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return repos.filter((r) => r.fullName.toLowerCase().includes(n));
  }, [q, repos]);

  const save = async (fullName: string | null): Promise<void> => {
    const links = { ...settings.repoLinks };
    if (fullName === null) delete links[deadline.id];
    else links[deadline.id] = fullName;
    onSaved(await window.epihub.updateSettings({ repoLinks: links }));
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label="Lier un repo" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>Lier un repo à « {deadline.title} »</h2>
        <input ref={input} className="input" placeholder="Filtrer les repos…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="list picker-list">
          {filtered.map((r) => (
            <li key={r.fullName}>
              <button type="button" className={`list-btn${settings.repoLinks[deadline.id] === r.fullName ? ' selected' : ''}`} onClick={() => void save(r.fullName)}>
                {r.fullName}
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="dim pad">Aucun repo</li>}
        </ul>
        <div className="modal-actions">
          {settings.repoLinks[deadline.id] && (
            <button type="button" className="btn btn-danger" onClick={() => void save(null)}>Retirer le lien</button>
          )}
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
