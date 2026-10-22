import type { Article, Mouvement, Saisie } from './db'

export const PROVENDE_SPC = 'provende-spc'
export const PROVENDE_MAISON = 'aliment-fini' // ancien « Aliment fini », même identifiant pour garder son historique
export const MAIS = 'mais'
/** Sacs de provende maison fabriqués avec un sac de maïs. */
export const SACS_MAISON_PAR_SAC_MAIS = 3
const POIDS_SAC_DEFAUT = 50

/** Seuils d'alerte fixés par Justin : aucune alerte pour la SPC. */
const SEUILS: Record<string, number | undefined> = { [PROVENDE_SPC]: undefined, [PROVENDE_MAISON]: 5, [MAIS]: 3 }
export const seuilAlerte = (a: Article) => (a.id in SEUILS ? SEUILS[a.id] : a.seuil)

/** Stock bas : seulement s'il y a un seuil et qu'un stock a déjà été enregistré, et strictement sous le seuil. */
export function estStockBas(a: Article, quantite: number, mouvements: Mouvement[]): boolean {
  const seuil = seuilAlerte(a)
  return seuil !== undefined && mouvements.some((m) => m.articleId === a.id) && quantite < seuil
}

/** Avant/après dans le temps : la date du jour, puis l'heure d'enregistrement. */
const cle = (date: string, creeLe?: string) => `${date}|${creeLe ?? ''}`

type Evenement = { cle: string; mouvement?: Mouvement; kg?: number }

/**
 * Stock de chaque article, en rejouant les opérations dans l'ordre :
 * - un inventaire remet le compte au nombre compté ;
 * - l'aliment donné chaque jour (kg) est retiré d'abord de la Provende SPC,
 *   puis, quand elle est épuisée, de la Provende maison ;
 * - chaque entrée de Provende maison retire 1 sac de maïs pour 3 sacs entrés (15 sacs → 5 sacs de maïs).
 */
export function etatStocks(articles: Article[], mouvements: Mouvement[], saisies: Saisie[]): Map<string, number> {
  const q = new Map<string, number>(articles.map((a) => [a.id, 0]))
  const ajouter = (id: string, n: number) => q.set(id, (q.get(id) ?? 0) + n)
  const poids = (id: string) => articles.find((a) => a.id === id)?.poidsSacKg ?? POIDS_SAC_DEFAUT
  const evenements: Evenement[] = [
    ...mouvements.map((m) => ({ cle: cle(m.date, m.creeLe), mouvement: m })),
    ...saisies.filter((s) => s.source !== 'excel' && s.alimentKg).map((s) => ({ cle: cle(s.date, s.creeLe), kg: s.alimentKg })),
  ].sort((a, b) => a.cle.localeCompare(b.cle))

  for (const e of evenements) {
    const m = e.mouvement
    if (m) {
      if (m.sens === 'inventaire') q.set(m.articleId, m.quantite)
      if (m.sens === 'sortie') ajouter(m.articleId, -m.quantite)
      if (m.sens === 'entree') {
        ajouter(m.articleId, m.quantite)
        if (m.articleId === PROVENDE_MAISON) ajouter(MAIS, -m.quantite / SACS_MAISON_PAR_SAC_MAIS)
      }
    } else if (e.kg) {
      const spcDispo = Math.max(0, q.get(PROVENDE_SPC) ?? 0)
      const sacsSpc = Math.min(spcDispo, e.kg / poids(PROVENDE_SPC))
      ajouter(PROVENDE_SPC, -sacsSpc)
      const kgRestant = e.kg - sacsSpc * poids(PROVENDE_SPC)
      if (kgRestant > 1e-9) ajouter(PROVENDE_MAISON, -kgRestant / poids(PROVENDE_MAISON))
    }
  }
  for (const [id, n] of q) q.set(id, Math.round(n * 10) / 10)
  return q
}
