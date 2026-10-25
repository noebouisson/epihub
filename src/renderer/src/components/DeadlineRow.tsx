import type { DeadlineView } from '../../../shared/types';
import type { OpenFn } from '../App';
import { projectKey } from '../../../shared/projects';
import { relativeTime } from '../time';
import { ShareButton } from './ShareButton';

interface Props {
  deadline: DeadlineView;
  open: OpenFn;
  openProject(key: string): void;
  toast(message: string): void;
  onLink(deadline: DeadlineView): void;
}

export function DeadlineRow({ deadline: d, open, openProject, toast, onLink }: Props): JSX.Element {
  const now = new Date();
  const commitLine = d.lastCommit ? `${d.lastCommit.message.split('\n')[0]} · ${relativeTime(d.lastCommit.date, now)}` : null;
  return (
    <li className={`row${d.alert ? ` row-${d.alert}` : ''}`}>
      <div className="row-main">
        <button type="button" className="link" onClick={() => openProject(projectKey(d.moduleCode, d.title))}>{d.title}</button>{' '}
        <button type="button" className="link small" onClick={() => open('myepitech', d.url)}>My Epitech</button>
        <div className="dim small">
          <span className="tag">{d.moduleCode}</span> <strong>{relativeTime(d.end, now)}</strong>
          {d.alert && <span className={`badge badge-${d.alert === 'urgent' ? 'danger' : 'warn'}`}>{d.alert === 'urgent' ? 'Urgent' : 'Attention'}</span>}
        </div>
        <div className="dim small">
          {d.repo ? (
            <>
              <button type="button" className="link" onClick={() => open('github', d.repo!.url)}>{d.repo.fullName}</button>
              {commitLine ? <> · dernier commit : {commitLine}</> : ' · aucun commit récent'}{' '}
              <button type="button" className="link" onClick={() => onLink(d)}>modifier</button>
            </>
          ) : (
            <button type="button" className="btn btn-small" onClick={() => onLink(d)}>Lier un repo</button>
          )}
        </div>
      </div>
      <ShareButton item={{ title: d.title, url: d.url, context: `${d.moduleCode} · ${relativeTime(d.end, now)}` }} open={open} toast={toast} />
    </li>
  );
}
