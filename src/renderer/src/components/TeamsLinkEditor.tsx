import { useState } from 'react';
import type { Settings } from '../../../shared/types';
import { isTeamsUrl } from '../../../shared/projects';
import type { OpenFn } from '../App';
import { ShareButton } from './ShareButton';

interface Props {
  projectKey: string;
  url: string | null;
  settings: Settings | null;
  share: { title: string; url: string; context?: string } | null;
  open: OpenFn;
  toast(message: string): void;
  onSaved(settings: Settings): void;
}

export function TeamsLinkEditor({ projectKey, url, settings, share, open, toast, onSaved }: Props): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const write = async (next: string | null): Promise<void> => {
    if (!settings) return;
    const links = { ...settings.projectTeamsLinks };
    if (next === null) delete links[projectKey];
    else links[projectKey] = next;
    try {
      onSaved(await window.epihub.updateSettings({ projectTeamsLinks: links }));
      setEditing(false);
      setError(null);
    } catch {
      setError("L'enregistrement a échoué");
    }
  };

  const save = (): void => {
    const v = value.trim();
    if (!isTeamsUrl(v)) return setError("Ce lien n'est pas un lien Teams");
    void write(v);
  };

  const share_ = share && <ShareButton item={share} open={open} toast={toast} />;

  if (url && !editing) {
    return (
      <div className="form-row wrap">
        <button type="button" className="btn" disabled={!isTeamsUrl(url)} onClick={() => open('teams', url)}>Ouvrir la conversation</button>
        <button type="button" className="btn btn-small" onClick={() => { setValue(url); setError(null); setEditing(true); }}>Modifier</button>
        <button type="button" className="btn btn-small btn-danger" onClick={() => void write(null)}>Retirer</button>
        {share_}
      </div>
    );
  }
  return (
    <div className="stack-sm">
      <div className="form-row">
        <input
          className="input"
          placeholder="Colle le lien de la conversation Teams"
          aria-label="Lien de la conversation Teams"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button type="button" className="btn btn-primary" onClick={save}>Enregistrer</button>
        {editing && <button type="button" className="btn" onClick={() => setEditing(false)}>Annuler</button>}
        {share_}
      </div>
      {error && <p className="bad small" role="alert">{error}</p>}
    </div>
  );
}
