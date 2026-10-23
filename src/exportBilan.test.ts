import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { bilanBande } from './argent'
import { journees } from './calc'
import { exporterBilanAnnuel, exporterBilanBande, lignesBilanBande, nomFichierBilan } from './exportBilan'
import type { Bande, Depense, Saisie, Vente } from './db'

const bande: Bande = { id: 'b1', nom: 'Bande septembre 2026', espace: 1, dateReception: '2026-09-12', poussins: 100, statut: 'cloturee', dateCloture: '2026-09-15' }
const saisies: Saisie[] = [
  { id: 's1', bandeId: 'b1', date: '2026-09-12', morts: 2 },
  { id: 's2', bandeId: 'b1', date: '2026-09-13', morts: 1, modifications: [{ le: 'x', par: 'Justin', avant: { morts: 0 } }] },
  { id: 's3', bandeId: 'b1', date: '2026-09-15', morts: 0, poidsMoyenKg: 0.2 },
]
const ventes: Vente[] = [{ id: 'v1', bandeId: 'b1', date: '2026-09-15', qte: 10, prixUnitaire: 3500, montantRecu: 30000, client: 'Marie', auteur: 'Roméo' }]
const depenses: Depense[] = [
  { id: 'd1', bandeId: 'b1', date: '2026-09-12', categorie: 1, designation: 'Poussins', montant: 50000 },
  { id: 'd2', bandeId: 'b1', date: '2026-09-15', categorie: 5, designation: 'Transport', montant: 1000 },
]

async function lire(blob: Blob) {
  const c = new ExcelJS.Workbook()
  await c.xlsx.load(await blob.arrayBuffer())
  return c
}
/** Valeurs de la colonne B indexées par le libellé de la colonne A. */
function valeurs(f: ExcelJS.Worksheet) {
  const m = new Map<string, unknown>()
  f.eachRow((r) => { if (r.getCell(1).value) m.set(String(r.getCell(1).value).trim(), r.getCell(2).value) })
  return m
}

describe('export du bilan', () => {
  it("crée le fichier d'une bande avec bilan, jour par jour, ventes et dépenses", async () => {
    const jours = journees(bande, saisies, ventes, '2026-09-20')
    const bilan = bilanBande(bande, jours, ventes, depenses)
    const c = await lire(await exporterBilanBande({ bande, jours, ventes, depenses, bilan }))
    expect(c.worksheets.map((f) => f.name)).toEqual(['Bilan', 'Jour par jour', 'Ventes', 'Dépenses'])

    const b = c.getWorksheet('Bilan')!
    const v = valeurs(b)
    expect(v.get('Dépenses totales')).toBe(51000)
    expect(v.get('Ventes totales')).toBe(35000)
    expect(v.get('dont dettes clients')).toBe(5000)
    expect(v.get('Résultat net')).toBe(-16000)
    expect(v.get('Poulets vendus')).toBe(10)
    b.eachRow((r) => {
      if (r.getCell(1).value === 'Dépenses totales') expect(r.font?.color?.argb).toBe('FFE74C3C')
      if (r.getCell(1).value === 'Ventes totales') expect(r.font?.color?.argb).toBe('FF2ECC71')
      if (r.getCell(1).value === 'Résultat net') expect(r.font?.color?.argb).toBe('FF3498DB')
    })

    const j = c.getWorksheet('Jour par jour')!
    expect(j.rowCount).toBe(5) // en-tête + 4 jours (12 au 15)
    expect(j.getRow(3).getCell(3).value).toBe(1)
    expect(j.getRow(3).getCell(3).font?.color?.argb).toBe('FFE74C3C') // morts corrigés
    expect(j.getRow(4).getCell(3).value).toBe('Non saisi')

    const ve = c.getWorksheet('Ventes')!
    expect(ve.getRow(2).values).toEqual([undefined, '15/09/2026', 'Marie', 10, 3500, 35000, 30000, 5000, 'Roméo'])
    const de = c.getWorksheet('Dépenses')!
    expect(de.getRow(3).getCell(5).value).toBe('oui') // catégorie 5 : toujours payée avec les ventes
  })

  it("reprend le bilan Excel d'une bande importée", () => {
    const x = { ...bande, bilanExcel: { 'MONTANT TOTAL DES DEPENSES': 1000.4, 'PRIX TOTAL DES VENTES': 2000, 'RESULTAT NET': 999.6, 'Taux de perte': 0.05 } }
    const l = lignesBilanBande(x, bilanBande(x, [], [], []))
    expect(l.map((r) => r[0])).toEqual(['Dépenses totales', 'Ventes totales', 'Résultat net', 'Taux de perte'])
    expect(l[0][1]).toBe(1000)
  })

  it("crée le fichier de l'année avec une ligne par bande", async () => {
    const lignes = [
      { bande, depenses: 100000, ventes: 150000, resultat: 50000, vendus: 40, morts: 3, alimentKg: 120.5 },
      { bande: { ...bande, id: 'b2', nom: 'Bande octobre 2026', statut: 'en_cours' as const }, depenses: 60000, ventes: 0, resultat: -60000, vendus: 0, morts: 1, alimentKg: 30 },
    ]
    const c = await lire(await exporterBilanAnnuel({ annee: '2026', lignes, sacs: { mais: 5, provendeMaison: 15, provendeSpc: 2 } }))
    const v = valeurs(c.getWorksheet('Bilan')!)
    expect(v.get('Résultat net')).toBe(-10000)
    expect(v.get('Coût production / poulet')).toBe(4000)
    expect(v.get('Provende maison (sacs)')).toBe(15)
    const p = c.getWorksheet('Par bande')!
    expect(p.rowCount).toBe(3)
    expect(p.getRow(3).getCell(3).value).toBe('en cours')
    expect(p.getRow(3).getCell(10).value).toBe(-60000)
  })

  it('donne un nom de fichier sans accents', () => {
    expect(nomFichierBilan('Bande février 2026')).toBe('bilan-bande-fevrier-2026.xlsx')
  })
})
