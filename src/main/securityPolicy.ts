/** Politiques pures (sans Electron) appliquées aux sessions des services et à l'IPC. */

export const SERVICE_PARTITIONS = ['persist:github', 'persist:intra', 'persist:myepitech', 'persist:teams'] as const;

/** UA par défaut sans les jetons `Electron/x` et `epihub/x` (certains sites, dont Teams, les refusent). */
export function cleanUserAgent(ua: string): string {
  return ua
    .replace(/\s*\bElectron\/\S+/gi, '')
    .replace(/\s*\bepihub\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const COMMON_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);
const TEAMS_PERMISSIONS = new Set([...COMMON_PERMISSIONS, 'media', 'notifications']);

/** Teams : micro/caméra, notifications, copie, plein écran ; autres services : copie, plein écran. */
export function isPermissionAllowed(partition: string, permission: string): boolean {
  return (partition === 'persist:teams' ? TEAMS_PERMISSIONS : COMMON_PERMISSIONS).has(permission);
}

/** Un appel IPC n'est accepté que depuis le cadre principal de la fenêtre principale. */
export function isTrustedSender(senderId: number, mainId: number | undefined, isTopFrame: boolean): boolean {
  return mainId !== undefined && senderId === mainId && isTopFrame;
}
