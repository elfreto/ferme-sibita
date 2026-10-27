import { payeeAvecVentes, versementConfirme, type Bande, type Categorie, type Depense, type Remise, type Utilisateur, type Vente } from './db'
import type { Jour } from './calc'

export const totalVente = (v: Vente) => v.qte * v.prixUnitaire

/** Ventes importées d'Excel : déjà réglées, hors caisse. */
const importee = (id: string) => id.startsWith('import-')

export function encaisse(v: Vente): number {
  if (importee(v.id)) return totalVente(v)
  return (v.montantRecu ?? totalVente(v)) + (v.reglements ?? []).reduce((t, r) => t + r.montant, 0)
}

export const resteDu = (v: Vente) => Math.max(0, totalVente(v) - encaisse(v))

/**
 * Argent des ventes que chaque personne a encore en main :
 * encaissé − dépenses payées avec cet argent − versé + reçu (versements confirmés seulement).
 * Les co-founders sont la destination finale : l'argent qu'ils reçoivent en versement sort de la caisse.
 */
export function argentEnMain(
  utilisateurs: Utilisateur[], ventes: Vente[], depenses: Depense[], remises: Remise[],
): Map<string, number> {
  const parNom = new Map<string, number>()
  const ajouter = (nom: string | undefined, montant: number) => {
    if (!nom) return
    parNom.set(nom, (parNom.get(nom) ?? 0) + montant)
  }
  for (const v of ventes) {
    if (importee(v.id)) continue
    ajouter(v.auteur, v.montantRecu ?? totalVente(v))
    for (const r of v.reglements ?? []) ajouter(r.par, r.montant)
  }
  for (const d of depenses) if (payeeAvecVentes(d) && !importee(d.id)) ajouter(d.auteur, -d.montant)
  const cofondateurs = new Set(utilisateurs.filter((u) => u.role === 'cofondateur').map((u) => u.nom))
  for (const r of remises.filter(versementConfirme)) {
    ajouter(r.de, -r.montant)
    if (!cofondateurs.has(r.a)) ajouter(r.a, r.montant)
  }
  return parNom
}

export interface Bilan {
  poussins: number
  mortsAvantVente: number
  pertesPendantVente: number
  vendus: number
  restants: number
  tauxPerte: number
  depensesParCategorie: Record<Categorie, number>
  totalDepenses: number
  totalVentes: number
  encaisse: number
  dettesClients: number
  resultatNet: number
  coutParPoulet?: number
  prixMoyen?: number
}

/** Bilan d'une bande calculé à partir des saisies, ventes et dépenses (mêmes règles que la fiche Excel). */
export function bilanBande(bande: Bande, jours: Jour[], ventes: Vente[], depenses: Depense[]): Bilan {
  const premiereVente = ventes.filter((v) => v.qte > 0).map((v) => v.date).sort()[0]
  const morts = (j: Jour) => j.morts
  const mortsAvantVente = jours.filter((j) => !premiereVente || j.date <= premiereVente).reduce((t, j) => t + morts(j), 0)
  // Les morts du premier jour de vente comptent encore avant la vente, comme dans la fiche Excel
  const pertesPendantVente = jours.filter((j) => premiereVente && j.date > premiereVente).reduce((t, j) => t + morts(j), 0)
  const vendus = ventes.reduce((t, v) => t + v.qte, 0)
  const depensesParCategorie = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<Categorie, number>
  for (const d of depenses) depensesParCategorie[d.categorie] += d.montant
  const totalDepenses = depenses.reduce((t, d) => t + d.montant, 0)
  const totalVentes = ventes.reduce((t, v) => t + totalVente(v), 0)
  const enc = ventes.reduce((t, v) => t + encaisse(v), 0)
  const restants = bande.poussins - mortsAvantVente - pertesPendantVente - vendus
  // Bande en cours : le coût se répartit sur tous les poulets encore à vendre, pas seulement les vendus
  const base = bande.statut === 'en_cours' ? vendus + restants : vendus
  return {
    poussins: bande.poussins,
    mortsAvantVente,
    pertesPendantVente,
    vendus,
    restants,
    tauxPerte: bande.poussins ? (mortsAvantVente + pertesPendantVente) / bande.poussins : 0,
    depensesParCategorie,
    totalDepenses,
    totalVentes,
    encaisse: enc,
    dettesClients: totalVentes - enc,
    resultatNet: totalVentes - totalDepenses,
    coutParPoulet: base ? totalDepenses / base : undefined,
    prixMoyen: vendus ? totalVentes / vendus : undefined,
  }
}
