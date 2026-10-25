import { useEffect, useMemo, useRef, useState } from 'react';
import { findProject, linkPatch, projectKey, resolveLink } from '../../../shared/projects';
import type { DeadlineView, Repo, Settings } from '../../../shared/types';

interface Props {
  /** Obligatoire sans `onSelect` : le lien est alors enregistré par échéance. */
  deadline?: DeadlineView;
  title?: string;
  /** Repo actuellement lié (avec `onSelect`). */
  current?: string | null;
  onSelect?(fullName: string | null): void | Promise<void>;
  repos: Repo[];
  settings: Settings;
  onSaved(settings: Settings): void;
  onClose(): void;
}

export function RepoPicker({ deadline, title, current, onSelect, repos, settings, onSaved, onClose }: Props): JSX.Element {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return repos.filter((r) => r.fullName.toLowerCase().includes(n));
  }, [q, repos]);

  const linked = onSelect ? current ?? null : deadline ? settings.repoLinks[deadline.id] ?? null : null;
  const save = async (fullName: string | null): Promise<void> => {
    if (onSelect) {
      await onSelect(fullName);
      onClose();
      return;
    }
    if (!deadline) return;
    const links = { ...settings.repoLinks };
    if (fullName === null) delete links[deadline.id];
    else links[deadline.id] = fullName;
    const patch: Partial<Settings> = { repoLinks: links };
    // Un repo lié sur la page projet est prioritaire : on le met à jour aussi (sous chaque alias) pour que ce choix s'applique.
    const intraKey = projectKey(deadline.moduleCode, deadline.title);
    const project = findProject(await window.epihub.projects().catch(() => []), intraKey) ?? { key: intraKey, aliases: [] };
    if (resolveLink(settings.projectRepoLinks, project) !== null) patch.projectRepoLinks = linkPatch(settings.projectRepoLinks, project, fullName);
    onSaved(await window.epihub.updateSettings(patch));
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label="Lier un repo" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>{title ?? `Lier un repo à « ${deadline?.title ?? ''} »`}</h2>
        <input ref={input} className="input" placeholder="Filtrer les repos…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="list picker-list">
          {filtered.map((r) => (
            <li key={r.fullName}>
              <button type="button" className={`list-btn${linked === r.fullName ? ' selected' : ''}`} onClick={() => void save(r.fullName)}>
                {r.fullName}
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="dim pad">Aucun repo</li>}
        </ul>
        <div className="modal-actions">
          {linked && (
            <button type="button" className="btn btn-danger" onClick={() => void save(null)}>Retirer le lien</button>
          )}
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
