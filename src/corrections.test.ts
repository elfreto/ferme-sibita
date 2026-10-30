import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { db, enregistrer } from './db'
import { corrigerRation139 } from './corrections'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

it('recalcule à 139 g les jours après J42 (anciennes rations 183 g et 180 g), une seule fois', async () => {
  await enregistrer('bandes', { id: 'b', nom: 'B', espace: 1, dateReception: '2026-01-01', poussins: 1000, statut: 'en_cours' })
  await enregistrer('journal', { id: 'j42', bandeId: 'b', date: '2026-02-11', alimentKg: 139, creeLe: '2026-02-11T08:00:00Z' })
  await enregistrer('journal', { id: 'j43', bandeId: 'b', date: '2026-02-12', alimentKg: 183, creeLe: '2026-02-12T08:00:00Z' })
  await enregistrer('journal', { id: 'j44', bandeId: 'b', date: '2026-02-13', alimentKg: 180, creeLe: '2026-02-13T08:00:00Z', ration180: true })
  await enregistrer('journal', { id: 'j45', bandeId: 'b', date: '2026-02-14', alimentKg: 180, creeLe: '2026-10-25T15:00:00Z' })
  await enregistrer('journal', { id: 'neuf', bandeId: 'b', date: '2026-02-15', alimentKg: 139, creeLe: '2026-10-30T15:00:00Z' })
  expect(await corrigerRation139()).toBe(3)
  for (const id of ['j42', 'j43', 'j44', 'j45', 'neuf']) expect((await db.journal.get(id))?.alimentKg).toBe(139)
  expect(await corrigerRation139()).toBe(0)
})
