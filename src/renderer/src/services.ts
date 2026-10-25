import { SERVICE_HOMES } from '../../shared/domains';
import type { ServiceId } from '../../shared/types';

export const SERVICES: { id: ServiceId; label: string; home: string; partition: string }[] = [
  { id: 'github', label: 'GitHub', home: SERVICE_HOMES.github, partition: 'persist:github' },
  { id: 'intra', label: 'Intranet', home: SERVICE_HOMES.intra, partition: 'persist:intra' },
  { id: 'myepitech', label: 'My Epitech', home: SERVICE_HOMES.myepitech, partition: 'persist:myepitech' },
  { id: 'teams', label: 'Teams', home: SERVICE_HOMES.teams, partition: 'persist:teams' }
];

export type View = 'dashboard' | 'home' | 'projects' | ServiceId | 'settings';
