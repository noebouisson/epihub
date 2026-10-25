import { useEffect, useRef, useState } from 'react';
import type { SearchItem } from '../../../shared/types';
import type { OpenFn } from '../App';
import type { View } from '../services';

interface Props {
  open: OpenFn;
  setView(view: View): void;
  openProject(key: string): void;
}

const VIEWS: View[] = ['home', 'projects', 'github', 'intra', 'myepitech', 'teams', 'settings'];

export function CommandPalette({ open, setView, openProject }: Props): JSX.Element | null {
  const [shown, setShown] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShown((s) => !s);
      } else if (e.key === 'Escape') setShown(false);
    };
    window.addEventListener('keydown', onKey);
    const offPalette = window.epihub.onPalette(() => setShown((s) => !s));
    return () => {
      window.removeEventListener('keydown', onKey);
      offPalette();
    };
  }, []);

  useEffect(() => {
    if (!shown) return;
    setQ('');
    setSel(0);
    input.current?.focus();
  }, [shown]);

  useEffect(() => {
    if (!shown) return;
    let live = true;
    const t = setTimeout(() => {
      void window.epihub.search(q).then((r) => {
        if (!live) return;
        setItems(r);
        setSel(0);
      });
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, shown]);

  const choose = (item: SearchItem | undefined): void => {
    if (!item) return;
    setShown(false);
    if (item.kind === 'page') {
      const v = item.id.replace(/^page:/, '') as View;
      if (VIEWS.includes(v)) setView(v);
    } else if (item.kind === 'project') openProject(item.id.slice('project:'.length));
    else open(item.service, item.url);
  };

  if (!shown) return null;
  return (
    <div className="overlay overlay-top" onMouseDown={() => setShown(false)}>
      <div className="modal palette" role="dialog" aria-label="Recherche" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="input"
          placeholder="Rechercher un repo, une PR, un rendu, une page…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === 'Enter') choose(items[sel]);
          }}
        />
        <ul className="list palette-list">
          {items.map((it, i) => (
            <li key={it.id}>
              <button type="button" className={`list-btn${i === sel ? ' selected' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => choose(it)}>
                <span className="tag">{it.kind}</span> <span>{it.title}</span>
                {it.subtitle && <span className="dim small"> · {it.subtitle}</span>}
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="dim pad">Aucun résultat</li>}
        </ul>
      </div>
    </div>
  );
}
