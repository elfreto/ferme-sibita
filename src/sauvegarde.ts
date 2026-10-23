import { db, type TableNom } from './db'

/** Une feuille Excel par table, dans cet ordre. */
const FEUILLES: { table: TableNom; nom: string }[] = [
  { table: 'bandes', nom: 'Bandes' },
  { table: 'journal', nom: 'Saisies du jour' },
  { table: 'ventes', nom: 'Ventes' },
  { table: 'depenses', nom: 'Dépenses' },
  { table: 'remises', nom: 'Versements' },
  { table: 'articles', nom: 'Articles stock' },
  { table: 'mouvements', nom: 'Mouvements stock' },
  { table: 'utilisateurs', nom: 'Utilisateurs' },
]
/** Colonnes dont la valeur est un objet ou une liste, écrite en JSON. */
const JSON_ = ' (json)'

type Ligne = Record<string, unknown> & { id: string }

const sansSecret = (table: TableNom, o: Ligne): Ligne => {
  if (table !== 'utilisateurs') return o
  const { pinHash: _pin, ...reste } = o
  return reste as Ligne
}

export function nomFichierSauvegarde(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `sauvegarde-ferme-sibita-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}h${p(date.getMinutes())}.xlsx`
}

/** Fichier Excel avec toutes les données de la ferme (sans les codes PIN). */
export async function exporterExcel(): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs')
  const classeur = new ExcelJS.Workbook()
  classeur.creator = 'La Ferme de Sibita'
  classeur.created = new Date()
  const info = classeur.addWorksheet('Lisez-moi')
  info.addRows([
    ['Sauvegarde de La Ferme de Sibita'],
    ['Faite le', new Date().toLocaleString('fr-FR')],
    ['Pour restaurer : application > Plus > Restaurer une sauvegarde Excel, puis choisir ce fichier.'],
    ['Ne modifiez pas les colonnes « id » ni les noms des feuilles. Les codes PIN ne sont pas dans ce fichier.'],
  ])
  info.getColumn(1).width = 40
  for (const { table, nom } of FEUILLES) {
    const lignes = ((await db.table(table).toArray()) as Ligne[]).map((o) => sansSecret(table, o))
    const cles = ['id', ...new Set(lignes.flatMap((o) => Object.keys(o)).filter((k) => k !== 'id'))]
    const enJson = new Set(cles.filter((k) => lignes.some((o) => o[k] !== null && typeof o[k] === 'object')))
    const feuille = classeur.addWorksheet(nom)
    feuille.addRow(cles.map((k) => (enJson.has(k) ? k + JSON_ : k)))
    feuille.getRow(1).font = { bold: true }
    for (const o of lignes) {
      feuille.addRow(cles.map((k) => {
        const v = o[k]
        if (v === undefined || v === null) return null
        return enJson.has(k) ? JSON.stringify(v) : (v as string | number | boolean)
      }))
    }
    cles.forEach((k, i) => { feuille.getColumn(i + 1).width = Math.min(40, Math.max(10, k.length + 2)) })
    feuille.views = [{ state: 'frozen', ySplit: 1 }]
  }
  const tampon = await classeur.xlsx.writeBuffer()
  return new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function valeur(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return undefined
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const c = v as { text?: string; result?: unknown; richText?: { text: string }[] }
    if (c.richText) return c.richText.map((t) => t.text).join('')
    if ('result' in c) return valeur(c.result)
    if (c.text !== undefined) return c.text
  }
  return v
}

/** Lit une sauvegarde : renvoie les enregistrements par table, sans rien écrire. */
export async function lireSauvegarde(fichier: ArrayBuffer): Promise<Partial<Record<TableNom, Ligne[]>>> {
  const { default: ExcelJS } = await import('exceljs')
  const classeur = new ExcelJS.Workbook()
  await classeur.xlsx.load(fichier)
  const resultat: Partial<Record<TableNom, Ligne[]>> = {}
  for (const { table, nom } of FEUILLES) {
    const feuille = classeur.getWorksheet(nom)
    if (!feuille) continue
    const entetes: string[] = []
    feuille.getRow(1).eachCell((c, i) => { entetes[i] = String(valeur(c.value) ?? '') })
    const lignes: Ligne[] = []
    feuille.eachRow((rang, n) => {
      if (n === 1) return
      const o: Record<string, unknown> = {}
      rang.eachCell((c, i) => {
        const entete = entetes[i]
        const v = valeur(c.value)
        if (!entete || v === undefined) return
        if (entete.endsWith(JSON_)) o[entete.slice(0, -JSON_.length)] = JSON.parse(String(v))
        else o[entete] = v
      })
      if (o.id !== undefined) lignes.push({ ...o, id: String(o.id) })
    })
    resultat[table] = lignes
  }
  if (!resultat.bandes) throw new Error("Ce fichier n'est pas une sauvegarde de la ferme.")
  return resultat
}

/** Remet les enregistrements de la sauvegarde (ajoute ou remplace, ne supprime rien) et les partage. */
export async function restaurer(donnees: Partial<Record<TableNom, Ligne[]>>): Promise<number> {
  let n = 0
  for (const { table } of FEUILLES) {
    const lignes = donnees[table]
    if (!lignes?.length) continue
    await db.transaction('rw', db.table(table), db.envois, async () => {
      let aEcrire = lignes
      if (table === 'utilisateurs') {
        // On garde le code PIN déjà connu sur ce téléphone.
        const existants = new Map((await db.utilisateurs.toArray()).map((u) => [u.id, u]))
        aEcrire = lignes.map((u) => ({ ...u, pinHash: existants.get(u.id)?.pinHash }) as Ligne)
      }
      await db.table(table).bulkPut(aEcrire)
      const le = new Date().toISOString()
      await db.envois.bulkAdd(aEcrire.map((o) => ({ table, id: o.id, op: 'put' as const, le })))
    })
    n += lignes.length
  }
  return n
}
