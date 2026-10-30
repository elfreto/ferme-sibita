import { champsEnRouge, type Bande, type Saisie, type Vente } from './db'

const JOUR = 86_400_000

export function aujourdhui(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** Âge en jours : le jour de réception est le jour 1, comme dans la fiche Excel. */
export function age(dateReception: string, date: string): number {
  return Math.round((Date.parse(date) - Date.parse(dateReception)) / JOUR) + 1
}

/** Ration prévue (g par sujet et par jour) selon l'âge, reprise de la fiche Excel. */
export function rationPrevue(ageJour: number): number {
  if (ageJour <= 7) return 25
  if (ageJour <= 14) return 40
  if (ageJour <= 21) return 62
  if (ageJour <= 28) return 85
  if (ageJour <= 35) return 110
  // Semaine 6 puis jusqu'à la fin de la bande (J43 et après) : 139 g fixe
  return 139
}

/** Aliment prévu (kg) : ration du jour × poulets vivants, à titre indicatif. */
export const alimentPrevuKg = (ageJour: number, vivants: number) => Math.round((rationPrevue(ageJour) * vivants) / 100) / 10

export interface Jour {
  date: string
  age: number
  morts: number
  vendus: number
  vivants: number // en fin de journée, après morts et ventes
  alimentKg?: number
  /** Aliment du jour = ration × vivants (colonne « Aliment ») ; absent pour un jour non saisi */
  aliment?: number
  gParSujet?: number
  ration: number
  poidsMoyenKg?: number
  traitements: string[]
  notes: string[]
  saisies: Saisie[]
  /** Aucune saisie ce jour-là : jour à rattraper */
  manquant: boolean
  /** Valeurs corrigées ou rattrapées, affichées en rouge */
  rouge: { morts: boolean; aliment: boolean; poids: boolean }
}

export function jourSuivant(iso: string): string {
  return new Date(Date.parse(iso) + JOUR).toISOString().slice(0, 10)
}

/** Dernier jour qui doit être rempli : aujourd'hui pour une bande en cours, sinon la clôture. */
export function dernierJour(bande: Bande, saisies: Saisie[], ventes: Vente[], date = aujourdhui()): string {
  if (bande.statut === 'en_cours') return date
  if (bande.dateCloture) return bande.dateCloture
  return [...saisies.map((s) => s.date), ...ventes.map((v) => v.date)].sort().pop() ?? bande.dateReception
}

/** Bandes importées et déjà terminées : on ne réclame pas les jours que l'Excel ne suivait pas. */
function exigeChaqueJour(bande: Bande): boolean {
  return bande.statut === 'en_cours' || !bande.id.startsWith('import-')
}

/** Une ligne par jour, du jour de réception jusqu'à aujourd'hui (ou la clôture), sans trou. */
export function journees(bande: Bande, saisies: Saisie[], ventes: Vente[], date = aujourdhui()): Jour[] {
  const fin = dernierJour(bande, saisies, ventes, date)
  const dates = new Set<string>([...saisies.map((s) => s.date), ...ventes.map((v) => v.date)])
  if (exigeChaqueJour(bande)) {
    for (let d = bande.dateReception; d <= fin; d = jourSuivant(d)) dates.add(d)
  }
  let vivants = bande.poussins
  return [...dates].filter((d) => d <= fin).sort().map((date) => {
    const duJour = saisies.filter((s) => s.date === date)
    const morts = duJour.reduce((t, s) => t + (s.morts ?? 0), 0)
    const vendus = ventes.filter((v) => v.date === date).reduce((t, v) => t + v.qte, 0)
    const avant = vivants
    vivants = vivants - morts - vendus
    const kg = duJour.reduce((t, s) => t + (s.alimentKg ?? 0), 0)
    const pesees = duJour.filter((s) => s.poidsMoyenKg)
    const a = age(bande.dateReception, date)
    const rouges = duJour.map(champsEnRouge)
    return {
      date,
      age: a,
      morts,
      vendus,
      vivants,
      alimentKg: kg || undefined,
      gParSujet: kg ? gramme(kg, avant - morts) : undefined,
      ration: rationPrevue(a),
      aliment: duJour.length ? alimentPrevuKg(a, vivants) : undefined,
      poidsMoyenKg: pesees.length ? pesees[pesees.length - 1].poidsMoyenKg : undefined,
      traitements: duJour.map((s) => s.traitement).filter((t): t is string => !!t),
      notes: duJour.map((s) => s.note).filter((t): t is string => !!t),
      saisies: duJour,
      manquant: duJour.length === 0,
      rouge: {
        morts: rouges.some((r) => r.has('morts')),
        aliment: rouges.some((r) => r.has('alimentKg')),
        poids: rouges.some((r) => r.has('poidsMoyenKg')),
      },
    }
  })
}

/** Grammes par sujet : kg distribués divisés par les poulets vivants ce jour-là. */
export function gramme(kg: number, vivants: number): number | undefined {
  return vivants > 0 ? Math.round((kg * 1000) / vivants) : undefined
}

export interface Resume {
  ageJour: number
  vivants: number
  mortsTotal: number
  vendusTotal: number
  tauxMortalite: number
  alimentTotalKg: number
  dernierPoidsKg?: number
  dernierPoidsAge?: number
  indiceConso?: number
  joursManquants: string[]
}

export function resume(bande: Bande, jours: Jour[], date = aujourdhui()): Resume {
  const mortsTotal = jours.reduce((t, j) => t + j.morts, 0)
  const vendusTotal = jours.reduce((t, j) => t + j.vendus, 0)
  const vivants = bande.poussins - mortsTotal - vendusTotal
  // Aliment donné = somme de la colonne « Aliment »
  const alimentTotalKg = Math.round(jours.reduce((t, j) => t + (j.aliment ?? 0), 0) * 10) / 10
  const pese = [...jours].reverse().find((j) => j.poidsMoyenKg)
  const finAge = bande.statut === 'cloturee' && jours.length ? jours[jours.length - 1].age : age(bande.dateReception, date)
  // Indice de consommation : kg d'aliment pour 1 kg de poids vif produit
  const indiceConso = pese && pese.poidsMoyenKg ? alimentTotalKg / (pese.vivants * pese.poidsMoyenKg) : undefined
  return {
    ageJour: finAge,
    vivants,
    mortsTotal,
    vendusTotal,
    tauxMortalite: bande.poussins ? mortsTotal / bande.poussins : 0,
    alimentTotalKg,
    dernierPoidsKg: pese?.poidsMoyenKg,
    dernierPoidsAge: pese?.age,
    indiceConso,
    joursManquants: jours.filter((j) => j.manquant).map((j) => j.date),
  }
}

export const nombre = (n: number, dec = 0) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
export const pourcent = (x: number) => `${nombre(x * 100, 1)} %`
export const fcfa = (n: number) => `${nombre(n)} FCFA`
export function dateCourte(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
export function dateLongue(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Aliment retiré du stock : pour chaque jour saisi sur le terrain, le même chiffre que la colonne « Aliment »
 * (ration × vivants), daté comme la première saisie du jour.
 */
export function consommations(bandes: Bande[], saisies: Saisie[], ventes: Vente[]): { date: string; creeLe?: string; alimentKg: number }[] {
  return bandes.flatMap((b) => {
    const jours = journees(b, saisies.filter((s) => s.bandeId === b.id), ventes.filter((v) => v.bandeId === b.id))
    return jours
      .filter((j) => j.aliment && j.saisies.some((s) => s.source !== 'excel'))
      .map((j) => ({ date: j.date, creeLe: j.saisies.map((s) => s.creeLe ?? '').sort()[0] || undefined, alimentKg: j.aliment! }))
  })
}
