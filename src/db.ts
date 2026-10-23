import Dexie, { type Table } from 'dexie'

export type Role = 'cofondateur' | 'responsable' | 'employe' | 'lecteur'
export interface Utilisateur { id: string; nom: string; role: Role; pinHash?: string; actif?: boolean; creeLe?: string }

export const ROLES: Role[] = ['cofondateur', 'responsable', 'employe', 'lecteur']

export const LIBELLE_ROLE: Record<Role, string> = {
  cofondateur: "Chef d'exploitation",
  responsable: "Responsable d'élevage",
  employe: "Agent d'élevage",
  lecteur: 'Lecture seule',
}

/** Ce que chaque fonction peut faire, dit simplement (affiché à l'accueil et dans l'écran Équipe). */
export const ACCES_ROLE: Record<Role, string> = {
  cofondateur: 'Accès complet : saisies, rattrapages, corrections, création, clôture et suppression des bandes, bilans et gestion des comptes.',
  responsable: 'Saisies, rattrapages, corrections et bilans. Ne crée, ne clôture ni ne supprime de bande et ne gère pas les comptes.',
  employe: 'Saisie du jour même uniquement. Consulte les bandes.',
  lecteur: 'Consulte tout (bandes, journal, bilans) sans pouvoir rien saisir ni modifier.',
}

export function ordreRole(r: Role): number {
  return ROLES.indexOf(r)
}

/** Tout le monde saisit, sauf la lecture seule. */
export function peutSaisir(u: Utilisateur): boolean {
  return u.role !== 'lecteur'
}

/** Bilans et argent : visibles par tous sauf l'employé. */
export function voitLesBilans(u: Utilisateur): boolean {
  return u.role !== 'employe'
}

/** Co-founders et responsables : rattrapages, corrections, bandes, bilans. */
export function peutGerer(u: Utilisateur): boolean {
  return u.role === 'cofondateur' || u.role === 'responsable'
}

/** Seuls les chefs d'exploitation créent une bande, choisissent sa date, la clôturent et la suppriment. */
export function dirigeLesBandes(u: Utilisateur): boolean {
  return u.role === 'cofondateur'
}

/** Seuls les co-founders créent, suppriment les comptes et attribuent les fonctions. */
export function gereLesComptes(u: Utilisateur): boolean {
  return u.role === 'cofondateur'
}

export type StatutBande = 'en_cours' | 'cloturee'
export interface Bande {
  id: string
  nom: string
  espace: 1 | 2
  dateReception: string // AAAA-MM-JJ
  poussins: number
  prixPoussin?: number
  responsable?: string
  statut: StatutBande
  dateCloture?: string
  bilanExcel?: Record<string, number>
}

/** Une saisie de terrain. Plusieurs saisies par jour sont possibles ; l'application les additionne. */
export interface Saisie {
  id: string
  bandeId: string
  date: string
  heure?: string
  morts?: number
  alimentKg?: number
  poidsMoyenKg?: number
  nbPeses?: number
  traitement?: string
  note?: string
  auteur?: string
  creeLe?: string
  source?: 'terrain' | 'excel'
  /** Article de stock d'où vient l'aliment (sinon le premier aliment du stock) */
  alimentArticleId?: string
  /** Aliment recalculé de 183 g à 180 g par poulet (jours après J42 saisis avant le 23/10/2026) */
  ration180?: true
  /** Corrections faites par un co-founder ou un responsable : anciennes valeurs, qui et quand */
  modifications?: { le: string; par: string; avant: Partial<Saisie> }[]
}

/** Champs d'une saisie qui comptent dans les calculs et peuvent être corrigés. */
export const CHAMPS_SAISIE = ['morts', 'alimentKg', 'poidsMoyenKg', 'nbPeses', 'traitement', 'note'] as const
export type ChampSaisie = (typeof CHAMPS_SAISIE)[number]

/** Une saisie est « hors délai » quand elle a été faite après le jour qu'elle concerne. */
export function horsDelai(s: Saisie): boolean {
  return !!s.creeLe && s.source !== 'excel' && s.creeLe.slice(0, 10) > s.date
}

/** Champs à afficher en rouge : corrigés après coup, ou remplis pour un jour rattrapé. */
export function champsEnRouge(s: Saisie): Set<ChampSaisie> {
  const rouges = new Set<ChampSaisie>()
  for (const m of s.modifications ?? []) for (const c of Object.keys(m.avant) as ChampSaisie[]) rouges.add(c)
  if (horsDelai(s)) for (const c of CHAMPS_SAISIE) if (s[c] !== undefined) rouges.add(c)
  return rouges
}

export interface Reglement { date: string; montant: number; par: string }

export interface Vente {
  id: string
  bandeId: string
  date: string
  qte: number
  prixUnitaire: number
  client?: string
  /** Somme encaissée au moment de la vente ; le reste est une dette du client */
  montantRecu?: number
  /** Paiements reçus plus tard pour une vente à crédit */
  reglements?: Reglement[]
  note?: string
  auteur?: string
  creeLe?: string
  modifieLe?: string
  modifiePar?: string
}

export type Categorie = 1 | 2 | 3 | 4 | 5
export const CATEGORIES: Record<Categorie, string> = {
  1: 'Poussins et frais d\'achat',
  2: 'Vétérinaire, chauffage, entretien',
  3: 'Aliment et transport d\'aliment',
  4: 'Salaires',
  5: 'Dépenses pendant la vente',
}

export interface Depense {
  id: string; bandeId?: string; date: string; categorie: Categorie
  designation: string; montant: number; payeAvecVentes?: boolean; auteur?: string; origine?: string; creeLe?: string
  modifieLe?: string; modifiePar?: string
}

/**
 * Versement : argent des ventes donné par une personne à une autre (en général à un co-founder).
 * Il ne compte qu'une fois confirmé par celui qui le reçoit.
 */
export interface Remise {
  id: string; date: string; de: string; a: string; montant: number; auteur: string; creeLe: string; note?: string
  statut?: 'en_attente' | 'confirme' | 'refuse'
  modifieLe?: string; modifiePar?: string
  confirmeLe?: string
}

/** Les versements enregistrés avant la confirmation comptent comme confirmés. */
export const versementConfirme = (r: Remise) => (r.statut ?? 'confirme') === 'confirme'
export const versementEnAttente = (r: Remise) => r.statut === 'en_attente'

/** Les dépenses pendant la vente sont toujours payées avec l'argent des ventes. */
export const payeeAvecVentes = (d: Depense) => !!d.payeAvecVentes || d.categorie === 5

export type TypeArticle = 'aliment' | 'medicament' | 'autre'
export interface Article {
  id: string
  nom: string
  type: TypeArticle
  unite: string // sac, flacon, sachet…
  poidsSacKg?: number // aliment : pour convertir les kg distribués en sacs
  seuil?: number // alerte quand le stock passe sous ce nombre (aucune alerte si absent)
  actif?: boolean
}

export interface Mouvement {
  id: string
  articleId: string
  date: string
  sens: 'entree' | 'sortie' | 'inventaire'
  quantite: number
  bandeId?: string
  prixTotal?: number
  depenseId?: string
  note?: string
  auteur: string
  creeLe: string
  modifieLe?: string
  modifiePar?: string
}

/** Modifications en attente d'envoi vers le serveur partagé (voir sync.ts). */
export interface Envoi { seq?: number; table: string; id: string; op: 'put' | 'delete'; le: string }

class FermeDB extends Dexie {
  utilisateurs!: Table<Utilisateur, string>
  bandes!: Table<Bande, string>
  journal!: Table<Saisie, string>
  ventes!: Table<Vente, string>
  depenses!: Table<Depense, string>
  remises!: Table<Remise, string>
  articles!: Table<Article, string>
  mouvements!: Table<Mouvement, string>
  envois!: Table<Envoi, number>
  meta!: Table<{ cle: string; valeur: unknown }, string>

  constructor() {
    super('ferme-sibita')
    this.version(1).stores({
      utilisateurs: 'id',
      bandes: 'id, statut, espace',
      journal: 'id, bandeId, date, [bandeId+date]',
      ventes: 'id, bandeId, date',
      depenses: 'id, bandeId, date',
      envois: '++seq',
      meta: 'cle',
    })
    // Georges devient responsable sur les téléphones déjà installés
    this.version(2).upgrade((tx) =>
      tx.table('utilisateurs').where('id').equals('georges').modify((u: Utilisateur) => {
        if (u.role === 'employe') u.role = 'responsable'
      }),
    )
    // « Patron » devient « Co-founder »
    this.version(3).upgrade((tx) =>
      tx.table('utilisateurs').toCollection().modify((u: { role: string }) => {
        if (u.role === 'patron') u.role = 'cofondateur'
      }),
    )
    // Étape 3 : caisse et stock
    this.version(4)
      .stores({ remises: 'id, date, de, a', articles: 'id', mouvements: 'id, articleId, date' })
      .upgrade((tx) => tx.table('articles').bulkPut(ARTICLES_INITIAUX))
    // Trois stocks d'aliment fixes : Provende SPC, Provende maison (ex « Aliment fini ») et Maïs
    this.version(5).stores({}).upgrade(async (tx) => {
      const t = tx.table('articles')
      const ancien = await t.get('aliment-fini')
      await t.bulkPut(ARTICLES_INITIAUX.map((a) => (a.id === 'aliment-fini' && ancien ? { ...ancien, nom: a.nom } : a)))
    })
    // Un article ajouté à la main avec le même nom qu'un stock fixe (ex. « Maïs ») est fusionné dans celui-ci
    this.version(6).stores({}).upgrade(async (tx) => {
      const articles: Article[] = await tx.table('articles').toArray()
      for (const fixe of ARTICLES_INITIAUX) {
        for (const doublon of articles.filter((a) => a.id !== fixe.id && memeNom(a.nom, fixe.nom))) {
          await tx.table('mouvements').where('articleId').equals(doublon.id).modify({ articleId: fixe.id })
          await tx.table('articles').update(doublon.id, { actif: false })
        }
      }
    })
  }
}

export const db = new FermeDB()

export const UTILISATEURS_INITIAUX: Utilisateur[] = [
  { id: 'justin', nom: 'Justin', role: 'cofondateur' },
  { id: 'georges', nom: 'Georges', role: 'responsable' },
  { id: 'romeo', nom: 'Roméo', role: 'employe' },
]

export const ARTICLES_INITIAUX: Article[] = [
  { id: 'provende-spc', nom: 'Provende SPC', type: 'aliment', unite: 'sac', poidsSacKg: 50, actif: true },
  { id: 'aliment-fini', nom: 'Provende maison', type: 'aliment', unite: 'sac', poidsSacKg: 50, seuil: 5, actif: true },
  { id: 'mais', nom: 'Maïs', type: 'autre', unite: 'sac', seuil: 3, actif: true },
]

export const memeNom = (a: string, b: string) => {
  const n = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  return n(a) === n(b)
}

export function nouvelId(): string {
  return crypto.randomUUID()
}

export type TableNom = 'utilisateurs' | 'bandes' | 'journal' | 'ventes' | 'depenses' | 'remises' | 'articles' | 'mouvements'
export const TABLES_PARTAGEES: TableNom[] = ['utilisateurs', 'bandes', 'journal', 'ventes', 'depenses', 'remises', 'articles', 'mouvements']

export async function enregistrer<T extends { id: string }>(table: TableNom, obj: T) {
  await db.transaction('rw', db.table(table), db.envois, async () => {
    await db.table(table).put(obj)
    await db.envois.add({ table, id: obj.id, op: 'put', le: new Date().toISOString() })
  })
}

/** Change quelques champs d'un enregistrement (et le met en attente d'envoi). */
export async function modifier<T extends { id: string }>(table: TableNom, id: string, champs: Partial<T>) {
  await db.transaction('rw', db.table(table), db.envois, async () => {
    await db.table(table).update(id, champs)
    await db.envois.add({ table, id, op: 'put', le: new Date().toISOString() })
  })
}

export async function supprimer(table: TableNom, id: string) {
  await db.transaction('rw', db.table(table), db.envois, async () => {
    await db.table(table).delete(id)
    await db.envois.add({ table, id, op: 'delete', le: new Date().toISOString() })
  })
}

/** Supprime une bande avec ses saisies, ventes et dépenses ; les mouvements de stock restent, sans bande. */
export async function supprimerBande(bandeId: string) {
  const [saisies, ventes, depenses, mouvements] = await Promise.all([
    db.journal.where('bandeId').equals(bandeId).toArray(), db.ventes.where('bandeId').equals(bandeId).toArray(),
    db.depenses.where('bandeId').equals(bandeId).toArray(), db.mouvements.filter((m) => m.bandeId === bandeId).toArray(),
  ])
  for (const s of saisies) await supprimer('journal', s.id)
  for (const v of ventes) await supprimer('ventes', v.id)
  for (const d of depenses) await supprimer('depenses', d.id)
  for (const m of mouvements) await enregistrer('mouvements', { ...m, bandeId: undefined })
  await supprimer('bandes', bandeId)
}

/** Clôture une bande à la date choisie : les saisies, ventes et dépenses de la bande après cette date sont supprimées. */
export async function apresCloture(bandeId: string, date: string) {
  const [saisies, ventes, depenses] = await Promise.all([
    db.journal.where('bandeId').equals(bandeId).filter((s) => s.date > date).toArray(),
    db.ventes.where('bandeId').equals(bandeId).filter((v) => v.date > date).toArray(),
    db.depenses.where('bandeId').equals(bandeId).filter((d) => d.date > date).toArray(),
  ])
  return { saisies, ventes, depenses }
}

export async function cloturerBande(bande: Bande, date: string) {
  const { saisies, ventes, depenses } = await apresCloture(bande.id, date)
  for (const s of saisies) await supprimer('journal', s.id)
  for (const v of ventes) await supprimer('ventes', v.id)
  for (const d of depenses) await supprimer('depenses', d.id)
  await enregistrer('bandes', { ...bande, statut: 'cloturee', dateCloture: date })
}

export type Historique = { bandes: Bande[]; journal: (Saisie & { age?: number })[]; ventes: Vente[]; depenses: Depense[] }

/** Met en forme les bandes, saisies, ventes et dépenses tirées des fichiers Excel. */
function lireHistorique(h: Historique) {
  return {
    bandes: h.bandes.map((b) => (b.statut === 'en_cours' ? { ...b, bilanExcel: undefined } : b)),
    journal: h.journal.map(({ age: _age, ...s }) => ({
      ...s,
      poidsMoyenKg: s.poidsMoyenKg ?? undefined,
      note: s.note ?? undefined,
      alimentKg: s.alimentKg ?? undefined,
      source: 'excel' as const,
    })),
    ventes: h.ventes,
    depenses: h.depenses,
  }
}

// L'historique n'est inclus que dans la version d'essai ; la version en ligne l'importe une fois (voir importerHistorique)
const fichierHistorique = import.meta.glob<{ default: Historique }>('./data/historique.json')

/** Premier lancement : crée les comptes et, en version d'essai, importe l'historique Excel. */
export async function initialiser() {
  if (await db.meta.get('initialise')) return
  const charger = import.meta.env.VITE_DEMO ? fichierHistorique['./data/historique.json'] : undefined
  const h = charger ? lireHistorique((await charger()).default) : undefined
  await db.transaction('rw', [db.utilisateurs, db.bandes, db.journal, db.ventes, db.depenses, db.articles, db.meta], async () => {
    await db.utilisateurs.bulkPut(UTILISATEURS_INITIAUX)
    await db.articles.bulkPut(ARTICLES_INITIAUX)
    if (h) {
      await db.bandes.bulkPut(h.bandes)
      await db.journal.bulkPut(h.journal)
      await db.ventes.bulkPut(h.ventes)
      await db.depenses.bulkPut(h.depenses)
    }
    await db.meta.put({ cle: 'initialise', valeur: new Date().toISOString() })
  })
}

/** Version en ligne : le chef d'exploitation importe une fois le fichier d'historique ; il part vers tous les téléphones. */
export async function importerHistorique(h: Historique): Promise<number> {
  const { bandes, journal, ventes, depenses } = lireHistorique(h)
  const lots: [TableNom, { id: string }[]][] = [['bandes', bandes], ['journal', journal], ['ventes', ventes], ['depenses', depenses]]
  const le = new Date().toISOString()
  await db.transaction('rw', [db.bandes, db.journal, db.ventes, db.depenses, db.envois], async () => {
    for (const [table, objets] of lots) {
      await db.table(table).bulkPut(objets)
      await db.envois.bulkAdd(objets.map((o) => ({ table, id: o.id, op: 'put' as const, le })))
    }
  })
  return lots.reduce((t, [, o]) => t + o.length, 0)
}
