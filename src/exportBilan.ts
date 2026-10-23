import type { Cell, Workbook, Worksheet } from 'exceljs'
import { CATEGORIES, payeeAvecVentes, type Bande, type Categorie, type Depense, type Vente } from './db'
import { encaisse, resteDu, totalVente, type Bilan } from './argent'
import type { Jour } from './calc'

/** Lignes du bilan repris d'Excel : clé dans le fichier, libellé affiché, format. */
export const LIBELLES_BILAN: [string, string, 'fcfa' | 'nb' | 'pct'][] = [
  ['MONTANT TOTAL DES DEPENSES', 'Dépenses totales', 'fcfa'],
  ['PRIX TOTAL DES VENTES', 'Ventes totales', 'fcfa'],
  ['RESULTAT NET', 'Résultat net', 'fcfa'],
  ['Prix de production / poulet', 'Coût production / poulet', 'fcfa'],
  ['Prix moyen du poulet', 'Prix de vente moyen', 'fcfa'],
  ['Nombre de poulets vendus', 'Poulets vendus', 'nb'],
  ['Taux de perte', 'Taux de perte', 'pct'],
]

type Format = 'fcfa' | 'nb' | 'kg' | 'pct' | 'texte'
type Style = 'depenses' | 'ventes' | 'resultat' | 'titre' | 'categorie'
/** Une ligne de bilan : libellé, valeur, format et style (couleurs de l'application). */
type LigneBilan = [string, number | string | undefined, Format, Style?]

const FORMATS: Record<Format, string | undefined> = {
  fcfa: '#,##0 "FCFA"', nb: '#,##0', kg: '#,##0.0 "kg"', pct: '0.0 %', texte: undefined,
}
const COULEURS: Partial<Record<Style, string>> = { depenses: 'FFE74C3C', ventes: 'FF2ECC71', resultat: 'FF3498DB' }
const ROUGE = 'FFE74C3C'

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function nouveauClasseur(): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const classeur = new ExcelJS.Workbook()
  classeur.creator = 'La Ferme de Sibita'
  classeur.created = new Date()
  return classeur
}

async function enBlob(classeur: Workbook): Promise<Blob> {
  return new Blob([await classeur.xlsx.writeBuffer()], { type: MIME })
}

const dateFr = (iso: string) => iso.split('-').reverse().join('/')

function feuilleBilan(classeur: Workbook, titre: string, sousTitres: string[], lignes: LigneBilan[]): Worksheet {
  const f = classeur.addWorksheet('Bilan')
  f.addRow([titre]).font = { bold: true, size: 14 }
  for (const s of sousTitres) f.addRow([s])
  f.addRow([])
  for (const [libelle, valeur, format, style] of lignes) {
    if (style === 'titre') {
      f.addRow([])
      f.addRow([libelle]).font = { bold: true, italic: true }
      continue
    }
    const rang = f.addRow([style === 'categorie' ? `   ${libelle}` : libelle, valeur ?? '—'])
    const cellule = rang.getCell(2)
    if (typeof valeur === 'number' && FORMATS[format]) cellule.numFmt = FORMATS[format]!
    cellule.alignment = { horizontal: 'right' }
    const couleur = style && COULEURS[style]
    if (couleur) rang.font = { bold: style !== 'resultat', color: { argb: couleur } }
  }
  f.getColumn(1).width = 34
  f.getColumn(2).width = 20
  return f
}

function feuilleTableau(classeur: Workbook, nom: string, colonnes: { titre: string; largeur?: number; format?: Format }[], lignes: (string | number | undefined)[][]): Worksheet {
  const f = classeur.addWorksheet(nom)
  f.addRow(colonnes.map((c) => c.titre)).font = { bold: true }
  for (const l of lignes) f.addRow(l.map((v) => v ?? null))
  colonnes.forEach((c, i) => {
    const col = f.getColumn(i + 1)
    col.width = c.largeur ?? Math.max(10, c.titre.length + 2)
    const fmt = c.format && FORMATS[c.format]
    if (fmt) col.eachCell((cell: Cell, n: number) => { if (n > 1 && typeof cell.value === 'number') cell.numFmt = fmt })
  })
  f.views = [{ state: 'frozen', ySplit: 1 }]
  return f
}

/** Nom de fichier sans accents ni espaces : « bilan-bande-septembre-2026.xlsx ». */
export function nomFichierBilan(nom: string) {
  const propre = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `bilan-${propre || 'bande'}.xlsx`
}

export interface DonneesBande {
  bande: Bande
  jours: Jour[]
  ventes: Vente[]
  depenses: Depense[]
  bilan: Bilan
}

/** Lignes du bilan d'une bande, dans l'ordre de sa fiche (Excel d'origine s'il existe, sinon calculé). */
export function lignesBilanBande(bande: Bande, b: Bilan): LigneBilan[] {
  const x = bande.bilanExcel
  if (x) {
    const lignes: LigneBilan[] = []
    for (const [cle, libelle, format] of LIBELLES_BILAN) {
      if (x[cle] === undefined) continue
      if (cle === 'Prix de production / poulet') lignes.push(['Indicateurs clés', undefined, 'texte', 'titre'])
      const style = ({ 'MONTANT TOTAL DES DEPENSES': 'depenses', 'PRIX TOTAL DES VENTES': 'ventes', 'RESULTAT NET': 'resultat' } as Record<string, Style>)[cle]
      lignes.push([libelle, format === 'fcfa' ? Math.round(x[cle]) : x[cle], format, style])
    }
    return lignes
  }
  const lignes: LigneBilan[] = [['Dépenses totales', b.totalDepenses, 'fcfa', 'depenses']]
  for (const c of [1, 2, 3, 4, 5] as Categorie[]) {
    if (b.depensesParCategorie[c]) lignes.push([CATEGORIES[c], b.depensesParCategorie[c], 'fcfa', 'categorie'])
  }
  lignes.push(['Ventes totales', b.totalVentes, 'fcfa', 'ventes'])
  if (b.dettesClients > 0) lignes.push(['dont dettes clients', b.dettesClients, 'fcfa'])
  lignes.push(
    ['Résultat net', b.resultatNet, 'fcfa', 'resultat'],
    ['Indicateurs clés', undefined, 'texte', 'titre'],
    ['Coût production / poulet', b.coutParPoulet === undefined ? undefined : Math.round(b.coutParPoulet), 'fcfa'],
    ['Prix de vente moyen', b.prixMoyen === undefined ? undefined : Math.round(b.prixMoyen), 'fcfa'],
    ['Poussins reçus', b.poussins, 'nb'],
    ['Morts avant la vente', b.mortsAvantVente, 'nb'],
    ['Morts pendant la vente', b.pertesPendantVente, 'nb'],
    ['Taux de perte', b.tauxPerte, 'pct'],
    ['Poulets vendus', b.vendus, 'nb'],
    ['Poulets restants', b.restants, 'nb'],
  )
  return lignes
}

/** Fichier Excel du bilan d'une bande : bilan, jour par jour, ventes et dépenses. */
export async function exporterBilanBande({ bande, jours, ventes, depenses, bilan }: DonneesBande): Promise<Blob> {
  const classeur = await nouveauClasseur()
  const enCours = bande.statut === 'en_cours'
  feuilleBilan(classeur, `${bande.nom} : ${enCours ? 'bilan provisoire' : 'bilan'}${bande.bilanExcel ? ' (repris du fichier Excel)' : ''}`, [
    `Espace ${bande.espace} · ${bande.poussins} poussins reçus le ${dateFr(bande.dateReception)}${bande.responsable ? ` · responsable ${bande.responsable}` : ''}`,
    enCours ? 'Bande en cours : chiffres provisoires.' : `Clôturée${bande.dateCloture ? ` le ${dateFr(bande.dateCloture)}` : ''}.`,
    `Fichier créé le ${new Date().toLocaleString('fr-FR')}`,
  ], lignesBilanBande(bande, bilan))

  const fj = feuilleTableau(classeur, 'Jour par jour', [
    { titre: 'Date', largeur: 12 }, { titre: 'Jour', largeur: 6 }, { titre: 'Morts', format: 'nb' }, { titre: 'Vendus', format: 'nb' },
    { titre: 'Vivants', format: 'nb' }, { titre: 'Aliment (kg)', format: 'kg', largeur: 13 }, { titre: 'Ration (g/poulet)', largeur: 17 },
    { titre: 'Poids moyen (kg)', largeur: 16 }, { titre: 'Traitements', largeur: 24 }, { titre: 'Notes', largeur: 30 },
  ], jours.map((j) => [
    dateFr(j.date), `J${j.age}`, j.manquant ? 'Non saisi' : j.morts, j.vendus || undefined, j.vivants,
    j.aliment, j.ration, j.poidsMoyenKg, j.traitements.join(', ') || undefined, j.notes.join(' · ') || undefined,
  ]))
  // Valeurs corrigées ou rattrapées en rouge, comme dans l'application
  jours.forEach((j, i) => {
    const rang = fj.getRow(i + 2)
    const rouges: [boolean, number][] = [[j.rouge.morts, 3], [j.rouge.aliment, 6], [j.rouge.poids, 8]]
    for (const [rouge, col] of rouges) if (rouge) rang.getCell(col).font = { color: { argb: ROUGE } }
    if (j.manquant) rang.getCell(3).font = { italic: true, color: { argb: ROUGE } }
  })

  feuilleTableau(classeur, 'Ventes', [
    { titre: 'Date', largeur: 12 }, { titre: 'Client', largeur: 20 }, { titre: 'Quantité', format: 'nb' },
    { titre: 'Prix unitaire', format: 'fcfa', largeur: 14 }, { titre: 'Total', format: 'fcfa', largeur: 16 },
    { titre: 'Encaissé', format: 'fcfa', largeur: 16 }, { titre: 'Reste dû', format: 'fcfa', largeur: 14 }, { titre: 'Vendeur', largeur: 14 },
  ], [...ventes].sort((a, b) => a.date.localeCompare(b.date)).map((v) => [
    dateFr(v.date), v.client, v.qte, v.prixUnitaire, totalVente(v), encaisse(v), resteDu(v) || undefined, v.auteur,
  ]))

  feuilleTableau(classeur, 'Dépenses', [
    { titre: 'Date', largeur: 12 }, { titre: 'Ce qui a été payé', largeur: 28 }, { titre: 'Catégorie du bilan', largeur: 32 },
    { titre: 'Montant', format: 'fcfa', largeur: 16 }, { titre: "Payé avec l'argent des ventes", largeur: 28 }, { titre: 'Par', largeur: 14 },
  ], [...depenses].sort((a, b) => a.date.localeCompare(b.date)).map((d) => [
    dateFr(d.date), d.designation, CATEGORIES[d.categorie], d.montant, payeeAvecVentes(d) ? 'oui' : 'non', d.auteur,
  ]))

  return enBlob(classeur)
}

export interface LigneAnnuelle {
  bande: Bande
  depenses: number
  ventes: number
  resultat: number
  vendus: number
  morts: number
  alimentKg: number
}

export interface DonneesAnnee {
  annee: string
  lignes: LigneAnnuelle[]
  sacs: { mais: number; provendeMaison: number; provendeSpc: number }
}

/** Fichier Excel du tableau de bord annuel : totaux de l'année et une ligne par bande. */
export async function exporterBilanAnnuel({ annee, lignes, sacs }: DonneesAnnee): Promise<Blob> {
  const classeur = await nouveauClasseur()
  const somme = (f: (l: LigneAnnuelle) => number) => lignes.reduce((t, l) => t + f(l), 0)
  const depenses = Math.round(somme((l) => l.depenses))
  const ventes = Math.round(somme((l) => l.ventes))
  const vendus = somme((l) => l.vendus)
  const enCours = lignes.some((l) => l.bande.statut === 'en_cours')
  feuilleBilan(classeur, `Tableau de bord ${annee}`, [
    `${lignes.length} bande${lignes.length > 1 ? 's' : ''} reçue${lignes.length > 1 ? 's' : ''} en ${annee}${enCours ? ', dont une en cours : chiffres provisoires' : ''}.`,
    `Fichier créé le ${new Date().toLocaleString('fr-FR')}`,
  ], [
    ['Dépenses totales', depenses, 'fcfa', 'depenses'],
    ['Ventes totales', ventes, 'fcfa', 'ventes'],
    ['Résultat net', Math.round(somme((l) => l.resultat)), 'fcfa', 'resultat'],
    ['Indicateurs clés', undefined, 'texte', 'titre'],
    ['Total poulets vendus', vendus, 'nb'],
    ['Total poulets morts', somme((l) => l.morts), 'nb'],
    ['Total aliment donné', Math.round(somme((l) => l.alimentKg) * 10) / 10, 'kg'],
    ['Coût production / poulet', vendus ? Math.round(depenses / vendus) : undefined, 'fcfa'],
    ['Prix de vente moyen', vendus ? Math.round(ventes / vendus) : undefined, 'fcfa'],
    ['Sacs entrés pour ces bandes', undefined, 'texte', 'titre'],
    ['Maïs acheté (sacs)', sacs.mais, 'nb'],
    ['Provende maison (sacs)', sacs.provendeMaison, 'nb'],
    ['Provende SPC (sacs)', sacs.provendeSpc, 'nb'],
  ])

  const f = feuilleTableau(classeur, 'Par bande', [
    { titre: 'Bande', largeur: 24 }, { titre: 'Reçue le', largeur: 12 }, { titre: 'Statut', largeur: 10 }, { titre: 'Poussins', format: 'nb' },
    { titre: 'Vendus', format: 'nb' }, { titre: 'Morts', format: 'nb' }, { titre: 'Aliment (kg)', format: 'kg', largeur: 14 },
    { titre: 'Dépenses', format: 'fcfa', largeur: 16 }, { titre: 'Ventes', format: 'fcfa', largeur: 16 }, { titre: 'Résultat net', format: 'fcfa', largeur: 16 },
  ], lignes.map((l) => [
    l.bande.nom, dateFr(l.bande.dateReception), l.bande.statut === 'en_cours' ? 'en cours' : 'clôturée', l.bande.poussins,
    l.vendus, l.morts, l.alimentKg, Math.round(l.depenses), Math.round(l.ventes), Math.round(l.resultat),
  ]))
  f.getColumn(8).eachCell((c: Cell, n: number) => { if (n > 1) c.font = { color: { argb: COULEURS.depenses } } })
  f.getColumn(9).eachCell((c: Cell, n: number) => { if (n > 1) c.font = { color: { argb: COULEURS.ventes } } })
  f.getColumn(10).eachCell((c: Cell, n: number) => { if (n > 1) c.font = { color: { argb: COULEURS.resultat } } })

  return enBlob(classeur)
}

/** Fait télécharger un fichier par le navigateur. */
export function telechargerFichier(blob: Blob, nom: string) {
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(blob)
  lien.download = nom
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(lien.href), 60_000)
}
