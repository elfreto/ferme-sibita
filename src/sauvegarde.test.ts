import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { cloturerBande, db, enregistrer, type Bande } from './db'
import { exporterExcel, lireSauvegarde, restaurer } from './sauvegarde'

const bande: Bande = { id: 'b1', nom: 'Bande Janvier 2026', espace: 1, dateReception: '2026-01-05', poussins: 500, statut: 'en_cours' }

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('sauvegarde Excel', () => {
  it('remet toutes les données, sans les codes PIN', async () => {
    await enregistrer('bandes', { ...bande, bilanExcel: { marge: 12 } })
    await enregistrer('journal', { id: 's1', bandeId: 'b1', date: '2026-01-06', morts: 3, note: '[sic] 007', modifications: [{ le: 'x', par: 'Justin', avant: { morts: 2 } }] })
    await enregistrer('utilisateurs', { id: 'justin', nom: 'Justin', role: 'cofondateur', pinHash: 'secret' })
    const blob = await exporterExcel()
    const lu = await lireSauvegarde(await blob.arrayBuffer())
    expect(lu.utilisateurs?.[0].pinHash).toBeUndefined()
    await Promise.all(db.tables.map((t) => t.clear()))
    await enregistrer('utilisateurs', { id: 'justin', nom: 'Justin', role: 'cofondateur', pinHash: 'secret' })
    expect(await restaurer(lu)).toBe(3)
    expect(await db.bandes.get('b1')).toEqual({ ...bande, bilanExcel: { marge: 12 } })
    expect(await db.journal.get('s1')).toEqual({ id: 's1', bandeId: 'b1', date: '2026-01-06', morts: 3, note: '[sic] 007', modifications: [{ le: 'x', par: 'Justin', avant: { morts: 2 } }] })
    expect((await db.utilisateurs.get('justin'))?.pinHash).toBe('secret')
    expect(await db.envois.filter((e) => e.table === 'bandes').count()).toBe(1)
  })
})

describe('clôture à une date', () => {
  it('supprime les données de la bande après la date', async () => {
    await enregistrer('bandes', bande)
    await enregistrer('journal', { id: 'a', bandeId: 'b1', date: '2026-02-10', morts: 1 })
    await enregistrer('journal', { id: 'b', bandeId: 'b1', date: '2026-02-11', morts: 1 })
    await enregistrer('ventes', { id: 'v', bandeId: 'b1', date: '2026-02-12', qte: 5, prix: 3000 } as never)
    await cloturerBande(bande, '2026-02-10')
    expect((await db.journal.toArray()).map((s) => s.id)).toEqual(['a'])
    expect(await db.ventes.count()).toBe(0)
    expect(await db.bandes.get('b1')).toMatchObject({ statut: 'cloturee', dateCloture: '2026-02-10' })
  })
})
