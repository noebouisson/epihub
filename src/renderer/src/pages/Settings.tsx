import { useState } from 'react';
import type { ServiceId, Settings as SettingsT } from '../../../shared/types';
import type { OpenFn, Snapshot } from '../App';
import { SERVICES } from '../services';

interface Props {
  snapshot: Snapshot | null;
  settings: SettingsT | null;
  onSettings(s: SettingsT): void;
  open: OpenFn;
}

const STATE_LABEL = { loading: 'Chargement…', ok: 'Connecté', 'needs-login': 'Connexion requise', error: 'Erreur' } as const;

export function Settings({ snapshot, settings, onSettings, open }: Props): JSX.Element {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const update = async (patch: Partial<SettingsT>): Promise<void> => onSettings(await window.epihub.updateSettings(patch));

  const save = async (): Promise<void> => {
    const res = await window.epihub.setGithubToken(token);
    if (res.ok) {
      setToken('');
      setMessage({ ok: true, text: 'Token enregistré.' });
    } else {
      setMessage({ ok: false, text: "Le chiffrement du système n'est pas disponible, le token n'a pas été enregistré" });
    }
  };

  const links = settings ? Object.entries(settings.repoLinks) : [];

  return (
    <div className="page">
      <div className="page-head"><h1>Réglages</h1></div>
      <div className="stack">
        <section className="card">
          <header className="card-head"><h2>Token GitHub</h2></header>
          <div className="card-body">
            <div className="form-row">
              <input className="input" type="password" autoComplete="off" placeholder="ghp_…" value={token} onChange={(e) => setToken(e.target.value)} />
              <button type="button" className="btn btn-primary" disabled={!token.trim()} onClick={() => void save()}>Enregistrer</button>
            </div>
            {message && <p className={message.ok ? 'ok' : 'bad'}>{message.text}</p>}
          </div>
        </section>

        <section className="card">
          <header className="card-head"><h2>Services</h2></header>
          <div className="card-body">
            <ul className="list">
              {SERVICES.map((s) => {
                const st = snapshot?.[s.id].status.state ?? 'loading';
                return (
                  <li key={s.id} className="row">
                    <div className="row-main">
                      <strong>{s.label}</strong> <span className={`badge ${st === 'ok' ? 'badge-ok' : st === 'error' ? 'badge-danger' : 'badge-dim'}`}>{STATE_LABEL[st]}</span>
                    </div>
                    <button type="button" className="btn btn-small" onClick={() => open(s.id)}>Se reconnecter</button>
                    {settings && (
                      <label className="switch" title="Notifications">
                        <input type="checkbox" checked={settings.notify[s.id]} onChange={(e) => void update({ notify: { ...settings.notify, [s.id as ServiceId]: e.target.checked } })} />
                        <span>Notifications</span>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="card">
          <header className="card-head"><h2>Liens manuels rendu ↔ repo</h2></header>
          <div className="card-body">
            {links.length === 0 ? <p className="dim">Aucun lien manuel.</p> : (
              <ul className="list">
                {links.map(([id, repo]) => (
                  <li key={id} className="row">
                    <div className="row-main"><span className="tag">{id}</span> → {repo}</div>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => {
                        const next = { ...settings!.repoLinks };
                        delete next[id];
                        void update({ repoLinks: next });
                      }}
                    >
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card">
          <header className="card-head"><h2>Thème</h2></header>
          <div className="card-body">
            <select className="input" value={settings?.theme ?? 'dark'} onChange={(e) => void update({ theme: e.target.value as SettingsT['theme'] })}>
              <option value="dark">Sombre</option>
              <option value="light">Clair</option>
            </select>
          </div>
        </section>
      </div>
    </div>
  );
}
