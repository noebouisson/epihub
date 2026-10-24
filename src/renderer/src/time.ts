/** Date relative en français : « dans 3 h », « il y a 5 min », « à l'instant ». */
export function relativeTime(iso: string, now: Date): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = t - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "à l'instant";
  const minutes = Math.floor(abs / 60_000);
  let text: string;
  if (minutes < 60) text = `${minutes} min`;
  else if (minutes < 24 * 60) text = `${Math.floor(minutes / 60)} h`;
  else text = `${Math.floor(minutes / (24 * 60))} j`;
  return diff > 0 ? `dans ${text}` : `il y a ${text}`;
}
