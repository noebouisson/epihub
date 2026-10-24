import type { OpenFn } from '../App';

interface Props {
  item: { title: string; url: string; context?: string };
  open: OpenFn;
  toast(message: string): void;
}

export function ShareButton({ item, open, toast }: Props): JSX.Element {
  const onClick = async (): Promise<void> => {
    try {
      await window.epihub.share(item);
      open('teams');
      toast('Copié, colle-le dans la conversation');
    } catch {
      toast('Le partage a échoué');
    }
  };
  return (
    <button type="button" className="btn btn-small btn-ghost" title="Copier et ouvrir Teams" onClick={() => void onClick()}>
      Partager
    </button>
  );
}
