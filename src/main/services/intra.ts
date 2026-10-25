import type { Service } from './types'

/**
 * L'ancien intranet ne renvoie plus de données : l'onglet reste, le service répond `null` (état ok)
 * sans aucun appel réseau. Toutes les données viennent désormais de My Epitech.
 */
export function createIntraService(): Service<'intra'> {
  return { id: 'intra', refresh: async () => null }
}
