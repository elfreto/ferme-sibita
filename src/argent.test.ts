import { describe, expect, it } from 'vitest'
import historique from './data/historique.json'
import { argentEnMain, bilanBande, encaisse, resteDu } from './argent'
import { journees } from './calc'
import { etatStocks } from './stock'
import type { Article, Bande, Depense, Mouvement, Remise, Saisie, Utilisateur, Vente } from './db'

const h = historique as unknown as { bandes: Bande[]; journal: Saisie[]; ventes: Vente[]; depenses: Depense[] }
const equipe: Utilisateur[] = [
  { id: 'j', nom: 'Justin', role: 'cofondateur' },
  { id: 'g', nom: 'Georges', role: 'responsable' },
  { id: 'r', nom: 'Roméo', role: 'employe' },
]

describe('argent', () => {
  it('calcule les dettes des ventes à crédit', () => {
    const v: Vente = { id: 'v', bandeId: 'b', date: '2026-10-22', qte: 4, prixUnitaire: 3500, montantRecu: 7000,
      reglements: [{ date: '2026-10-25', montant: 3500, par: 'Roméo' }] }
    expect(encaisse(v)).toBe(10500)
    expect(resteDu(v)).toBe(3500)
  })

  it("suit l'argent en main : ventes − dépenses payées avec − remises", () => {
    const ventes: Vente[] = [
      { id: 'v1', bandeId: 'b', date: '2026-10-22', qte: 10, prixUnitaire: 3500, auteur: 'Roméo' },
      { id: 'v2', bandeId: 'b', date: '2026-10-22', qte: 2, prixUnitaire: 4000, montantRecu: 0, auteur: 'Georges',
        reglements: [{ date: '2026-10-23', montant: 8000, par: 'Roméo' }] },
    ]
    const depenses: Depense[] = [{ id: 'd', date: '2026-10-22', categorie: 5, designation: 'taxi', montant: 500, payeAvecVentes: true, auteur: 'Roméo' }]
    const remises: Remise[] = [{ id: 'r', date: '2026-10-23', de: 'Roméo', a: 'Justin', montant: 30000, auteur: 'Justin', creeLe: '' }]
    const m = argentEnMain(equipe, ventes, depenses, remises)
    expect(m.get('Roméo')).toBe(35000 + 8000 - 500 - 30000)
    expect(m.get('Georges')).toBe(0)
    expect(m.has('Justin')).toBe(false)
  })

  it('retire les dépenses pendant la vente même sans case cochée, et attend la confirmation des versements', () => {
    const ventes: Vente[] = [{ id: 'v', bandeId: 'b', date: '2026-10-22', qte: 20, prixUnitaire: 3500, auteur: 'Georges' }]
    const depenses: Depense[] = [
      { id: 'd1', date: '2026-10-22', categorie: 5, designation: 'Taxi', montant: 100, auteur: 'Georges' },
      { id: 'd2', date: '2026-10-22', categorie: 5, designation: 'Ticket marché', montant: 500, auteur: 'Georges' },
    ]
    const v = (statut?: Remise['statut']): Remise => ({ id: 'r', date: '2026-10-22', de: 'Georges', a: 'Justin', montant: 60000, auteur: 'Georges', creeLe: '', statut })
    expect(argentEnMain(equipe, ventes, depenses, []).get('Georges')).toBe(69400)
    expect(argentEnMain(equipe, ventes, depenses, [v('en_attente')]).get('Georges')).toBe(69400)
    expect(argentEnMain(equipe, ventes, depenses, [v('refuse')]).get('Georges')).toBe(69400)
    expect(argentEnMain(equipe, ventes, depenses, [v('confirme')]).get('Georges')).toBe(9400)
  })

  it("compte aussi l'argent des ventes faites par un co-founder", () => {
    const ventes: Vente[] = [{ id: 'v', bandeId: 'b', date: '2026-10-22', qte: 20, prixUnitaire: 3500, auteur: 'Justin' }]
    const depenses: Depense[] = [{ id: 'd', date: '2026-10-22', categorie: 5, designation: 'Taxi', montant: 600, auteur: 'Justin' }]
    expect(argentEnMain(equipe, ventes, depenses, []).get('Justin')).toBe(69400)
  })

  it('retrouve le bilan Excel de janvier (dépenses, ventes, résultat, coût par poulet)', () => {
    const bande = h.bandes.find((b) => b.id === 'import-2026-01-24')!
    const ventes = h.ventes.filter((v) => v.bandeId === bande.id)
    const depenses = h.depenses.filter((d) => d.bandeId === bande.id)
    const jours = journees(bande, h.journal.filter((s) => s.bandeId === bande.id), ventes)
    const b = bilanBande(bande, jours, ventes, depenses)
    expect(b.totalDepenses).toBe(bande.bilanExcel!['MONTANT TOTAL DES DEPENSES'])
    expect(b.totalVentes).toBe(bande.bilanExcel!['PRIX TOTAL DES VENTES'])
    expect(b.resultatNet).toBe(bande.bilanExcel!['RESULTAT NET'])
    expect(Math.round(b.coutParPoulet!)).toBe(Math.round(bande.bilanExcel!['Prix de production / poulet']))
    expect(b.dettesClients).toBe(0)
  })
})

describe('stock', () => {
  const art = (id: string, nom: string): Article => ({ id, nom, type: id === 'mais' ? 'autre' : 'aliment', unite: 'sac', poidsSacKg: id === 'mais' ? undefined : 50, seuil: 0 })
  const articles = [art('provende-spc', 'SPC'), art('aliment-fini', 'Maison'), art('mais', 'Maïs')]
  const mvt = (articleId: string, sens: Mouvement['sens'], quantite: number, date: string, creeLe = date + 'T08:00'): Mouvement =>
    ({ id: articleId + sens + date + quantite, articleId, sens, quantite, date, auteur: 'x', creeLe })
  const jour = (date: string, kg: number): Saisie => ({ id: date, bandeId: 'b', date, alimentKg: kg, creeLe: date + 'T09:00' })

  it("retire l'aliment de la SPC d'abord, puis de la provende maison", () => {
    const m = [mvt('provende-spc', 'entree', 2, '2026-10-20'), mvt('aliment-fini', 'entree', 10, '2026-10-20')]
    const s = etatStocks(articles, m, [jour('2026-10-22', 75), jour('2026-10-23', 50)])
    expect(s.get('provende-spc')).toBe(0)
    expect(s.get('aliment-fini')).toBe(9.5)
  })

  it('retire 1 sac de maïs pour 3 sacs de provende maison entrés', () => {
    const m = [mvt('mais', 'entree', 10, '2026-10-20'), mvt('aliment-fini', 'entree', 15, '2026-10-21')]
    const s = etatStocks(articles, m, [jour('2026-10-22', 150)])
    expect(s.get('mais')).toBe(5)
    expect(s.get('aliment-fini')).toBe(12)
  })

  it('repart du dernier inventaire', () => {
    const m = [mvt('provende-spc', 'entree', 20, '2026-10-22'), mvt('provende-spc', 'inventaire', 12, '2026-10-23'), mvt('provende-spc', 'sortie', 1, '2026-10-25')]
    const s = etatStocks(articles, m, [jour('2026-10-22', 100), jour('2026-10-24', 50)])
    expect(s.get('provende-spc')).toBe(10)
  })
})
