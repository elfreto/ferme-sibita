import { describe, expect, it } from 'vitest'
import { age, consommations, gramme, journees, rationPrevue, resume } from './calc'
import type { Bande, Saisie, Vente } from './db'

describe('calculs', () => {
  it("compte l'âge comme la fiche Excel (réception = J1)", () => {
    expect(age('2026-09-12', '2026-09-12')).toBe(1)
    expect(age('2026-09-12', '2026-10-20')).toBe(39)
  })

  it('divise les kg distribués par les vivants du jour', () => {
    expect(gramme(50, 1000)).toBe(50)
    expect(gramme(50, 976)).toBe(51)
    expect(gramme(50, 0)).toBeUndefined()
  })

  it('reprend la ration prévue de la fiche', () => {
    expect([1, 8, 15, 22, 29, 36, 42, 43, 60].map(rationPrevue)).toEqual([25, 40, 62, 85, 110, 139, 139, 180, 180])
  })

  it('additionne plusieurs distributions le même jour', () => {
    const bande: Bande = { id: 'b', nom: 'test', espace: 2, dateReception: '2026-10-01', poussins: 1000, statut: 'en_cours' }
    const s: Saisie[] = [
      { id: '1', bandeId: 'b', date: '2026-10-02', alimentKg: 30 },
      { id: '2', bandeId: 'b', date: '2026-10-02', alimentKg: 20, morts: 10 },
    ]
    const j = journees(bande, s, [], '2026-10-02')[1]
    expect(j.alimentKg).toBe(50)
    expect(j.vivants).toBe(990)
    expect(j.gParSujet).toBe(51)
  })

  it('crée une ligne pour chaque jour, même sans saisie', () => {
    const bande: Bande = { id: 'b', nom: 'test', espace: 2, dateReception: '2026-10-01', poussins: 100, statut: 'en_cours' }
    const s: Saisie[] = [{ id: '1', bandeId: 'b', date: '2026-10-01', morts: 0 }, { id: '2', bandeId: 'b', date: '2026-10-04', morts: 1 }]
    const jours = journees(bande, s, [], '2026-10-05')
    expect(jours.map((j) => j.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'])
    expect(resume(bande, jours, '2026-10-05').joursManquants).toEqual(['2026-10-02', '2026-10-03', '2026-10-05'])
    expect(jours[4].vivants).toBe(99)
  })

  it('marque en rouge les corrections et les rattrapages', () => {
    const bande: Bande = { id: 'b', nom: 'test', espace: 2, dateReception: '2026-10-01', poussins: 100, statut: 'en_cours' }
    const s: Saisie[] = [
      { id: '1', bandeId: 'b', date: '2026-10-01', morts: 3, alimentKg: 5, creeLe: '2026-10-01T08:00:00Z',
        modifications: [{ le: '2026-10-02T09:00:00Z', par: 'Justin', avant: { morts: 2 } }] },
      { id: '2', bandeId: 'b', date: '2026-10-02', alimentKg: 6, creeLe: '2026-10-04T10:00:00Z' },
    ]
    const [j1, j2] = journees(bande, s, [], '2026-10-02')
    expect(j1.rouge).toEqual({ morts: true, aliment: false, poids: false })
    expect(j2.rouge.aliment).toBe(true)
  })
})

describe('aliment donné', () => {
  it('est la somme de la colonne Aliment (ration × vivants)', () => {
    const b: Bande = { id: 'x', nom: 'X', espace: 1, dateReception: '2026-01-01', poussins: 1000, statut: 'en_cours' }
    const s = (date: string, morts: number, alimentKg?: number): Saisie => ({ id: date, bandeId: 'x', date, morts, alimentKg, source: 'terrain', creeLe: date + 'T08:00' })
    const jours = journees(b, [s('2026-01-01', 10, 25), s('2026-01-02', 5, 99), s('2026-01-03', 0)], [], '2026-01-04')
    const colonne = jours.map((j) => j.aliment ?? 0)
    expect(colonne).toEqual([24.8, 24.6, 24.6, 0])
    expect(resume(b, jours, '2026-01-04').alimentTotalKg).toBe(74)
    expect(consommations([b], [s('2026-01-01', 10, 25)], []).map((c) => c.alimentKg)).toEqual([24.8])
  })
})
