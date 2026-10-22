import { useLiveQuery } from 'dexie-react-hooks'
import { ARTICLES_INITIAUX, db, memeNom } from './db'
import { journees, resume } from './calc'
import { bilanBande } from './argent'

/** Charge une bande avec ses journées calculées et son résumé, mis à jour en direct. */
export function useBande(bandeId: string) {
  return useLiveQuery(async () => {
    const bande = await db.bandes.get(bandeId)
    if (!bande) return null
    const [saisies, ventes, depenses] = await Promise.all([
      db.journal.where('bandeId').equals(bandeId).toArray(),
      db.ventes.where('bandeId').equals(bandeId).toArray(),
      db.depenses.where('bandeId').equals(bandeId).toArray(),
    ])
    const jours = journees(bande, saisies, ventes)
    return { bande, jours, ventes, depenses, resume: resume(bande, jours), bilan: bilanBande(bande, jours, ventes, depenses) }
  }, [bandeId])
}

/** Toutes les données d'argent et de stock (petits volumes : une ferme, quelques bandes). */
export function useDonnees() {
  return useLiveQuery(async () => {
    const [utilisateurs, bandes, ventes, depenses, remises, articles, mouvements, saisies] = await Promise.all([
      db.utilisateurs.toArray(), db.bandes.toArray(), db.ventes.toArray(), db.depenses.toArray(),
      db.remises.toArray(), db.articles.toArray(), db.mouvements.toArray(), db.journal.toArray(),
    ])
    return { utilisateurs, bandes, ventes, depenses, remises, articles: ordonner(articles.filter((a) => a.actif !== false && !ARTICLES_INITIAUX.some((f) => f.id !== a.id && memeNom(f.nom, a.nom)))), mouvements, saisies }
  }, [])
}


const ORDRE_ARTICLES = ['provende-spc', 'aliment-fini', 'mais']
function ordonner<T extends { id: string }>(articles: T[]): T[] {
  const rang = (a: T) => (ORDRE_ARTICLES.indexOf(a.id) + 1 || 99)
  return [...articles].sort((a, b) => rang(a) - rang(b))
}
