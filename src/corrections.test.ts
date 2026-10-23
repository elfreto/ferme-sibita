import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { db, enregistrer } from './db'
import { corrigerRation180 } from './corrections'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

it('recalcule à 180 g les jours après J42, une seule fois', async () => {
  await enregistrer('bandes', { id: 'b', nom: 'B', espace: 1, dateReception: '2026-01-01', poussins: 1000, statut: 'en_cours' })
  await enregistrer('journal', { id: 'j42', bandeId: 'b', date: '2026-02-11', alimentKg: 139, creeLe: '2026-02-11T08:00:00Z' })
  await enregistrer('journal', { id: 'j43', bandeId: 'b', date: '2026-02-12', alimentKg: 183, creeLe: '2026-02-12T08:00:00Z' })
  await enregistrer('journal', { id: 'neuf', bandeId: 'b', date: '2026-02-13', alimentKg: 180, creeLe: '2026-10-23T15:00:00Z' })
  expect(await corrigerRation180()).toBe(1)
  expect((await db.journal.get('j43'))?.alimentKg).toBe(180)
  expect((await db.journal.get('j42'))?.alimentKg).toBe(139)
  expect((await db.journal.get('neuf'))?.alimentKg).toBe(180)
  expect(await corrigerRation180()).toBe(0)
})
