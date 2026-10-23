import { db } from './db'
import { age } from './calc'

/** Mise en ligne de la ration de 180 g (au lieu de 183 g) à partir de J43. */
const RATION_180_LE = '2026-10-23T14:20:00Z'

/**
 * Recalcule à 180 g l'aliment des jours après J42 enregistrés avec l'ancienne ration de 183 g.
 * Chaque saisie corrigée est marquée, pour ne jamais être corrigée deux fois (même par un autre téléphone).
 */
export async function corrigerRation180(): Promise<number> {
  const bandes = new Map((await db.bandes.toArray()).map((b) => [b.id, b]))
  const aCorriger = await db.journal
    .filter((s) => !s.ration180 && s.source !== 'excel' && !!s.alimentKg && (!s.creeLe || s.creeLe < RATION_180_LE))
    .toArray()
  const lignes = aCorriger.filter((s) => {
    const b = bandes.get(s.bandeId)
    return b && age(b.dateReception, s.date) >= 43
  })
  if (!lignes.length) return 0
  await db.transaction('rw', db.journal, db.envois, async () => {
    const le = new Date().toISOString()
    for (const s of lignes) {
      await db.journal.put({ ...s, alimentKg: Math.round((s.alimentKg! * 180) / 183 * 10) / 10, ration180: true })
      await db.envois.add({ table: 'journal', id: s.id, op: 'put', le })
    }
  })
  return lignes.length
}
