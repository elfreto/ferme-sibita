import { corrigerRation180 } from './corrections'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { db, TABLES_PARTAGEES, type Envoi } from './db'

/**
 * Synchronisation entre les téléphones, par le serveur partagé (Supabase).
 * Chaque téléphone garde toutes les données (saisie hors ligne) ; les modifications
 * attendent dans « envois » et partent dès que la connexion revient.
 * Sur le serveur, une seule table « enregistrements » : une ligne par enregistrement,
 * numérotée (seq) à chaque modification pour que chaque téléphone ne reprenne que le nouveau.
 */

export interface LigneServeur {
  tbl: string
  id: string
  donnees: unknown | null
  supprime: boolean
  seq?: number
  appareil?: string
}

export interface Serveur {
  envoyer(lignes: LigneServeur[]): Promise<void>
  recevoir(depuis: number, limite: number): Promise<LigneServeur[]>
}

const URL_SERVEUR = import.meta.env.VITE_SUPABASE_URL as string | undefined
const CLE_SERVEUR = import.meta.env.VITE_SUPABASE_KEY as string | undefined
export const synchroActive = !!(URL_SERVEUR && CLE_SERVEUR)
export const supabase: SupabaseClient | null = synchroActive ? createClient(URL_SERVEUR!, CLE_SERVEUR!) : null

/**
 * Le téléphone a-t-il déjà été relié au compte de la ferme ? Lu directement dans la mémoire du téléphone,
 * sans attendre le serveur : avec un réseau lent ou coupé, getSession() peut rester bloqué
 * (renouvellement de la connexion) et l'appli resterait sur « Chargement… ».
 */
export function fermeMemorisee(): boolean {
  if (!URL_SERVEUR) return false
  try {
    return !!localStorage.getItem(`sb-${new URL(URL_SERVEUR).hostname.split('.')[0]}-auth-token`)
  } catch {
    return false
  }
}

const PAQUET = 500
// On relit un peu en arrière : une modification peut recevoir son numéro juste avant une autre mais être enregistrée après
const RECOUVREMENT = 200

function appareil(): string {
  try {
    let id = localStorage.getItem('sibita-appareil')
    if (!id) localStorage.setItem('sibita-appareil', (id = crypto.randomUUID()))
    return id
  } catch {
    return 'inconnu'
  }
}

export function serveurSupabase(client: SupabaseClient): Serveur {
  return {
    async envoyer(lignes) {
      const { error } = await client.from('enregistrements').upsert(lignes, { onConflict: 'tbl,id' })
      if (error) throw error
    },
    async recevoir(depuis, limite) {
      const { data, error } = await client.from('enregistrements').select('tbl,id,donnees,supprime,seq').gt('seq', depuis).order('seq').limit(limite)
      if (error) throw error
      return data as LigneServeur[]
    },
  }
}

const cleEnvoi = (e: { table?: string; tbl?: string; id: string }) => `${e.table ?? e.tbl}|${e.id}`

/** Envoie les modifications en attente puis reprend celles des autres téléphones. */
export async function synchroniser(serveur: Serveur): Promise<{ envoyes: number; recus: number }> {
  // 1. Envoi : pour chaque enregistrement modifié, on envoie son état actuel (ou sa suppression)
  const envois = await db.envois.orderBy('seq').toArray()
  let envoyes = 0
  if (envois.length) {
    const derniers = new Map<string, Envoi>()
    for (const e of envois) derniers.set(cleEnvoi(e), e)
    const lignes: LigneServeur[] = []
    for (const e of derniers.values()) {
      const local = await db.table(e.table).get(e.id)
      lignes.push({ tbl: e.table, id: e.id, donnees: local ?? null, supprime: !local, appareil: appareil() })
    }
    for (let i = 0; i < lignes.length; i += PAQUET) await serveur.envoyer(lignes.slice(i, i + PAQUET))
    const max = envois[envois.length - 1].seq!
    await db.envois.where('seq').belowOrEqual(max).delete()
    envoyes = lignes.length
  }

  // 2. Réception
  let recus = 0
  const tables = [...TABLES_PARTAGEES.map((t) => db.table(t)), db.envois, db.meta]
  for (;;) {
    const dernier = ((await db.meta.get('dernierSeq'))?.valeur as number | undefined) ?? 0
    const lignes = await serveur.recevoir(Math.max(0, dernier - RECOUVREMENT), PAQUET)
    const nouvelles = lignes.filter((l) => (l.seq ?? 0) > dernier)
    await db.transaction('rw', tables, async () => {
      // Une modification faite ici et pas encore envoyée garde la priorité
      const enAttente = new Set((await db.envois.toArray()).map(cleEnvoi))
      for (const l of lignes) {
        if (!TABLES_PARTAGEES.includes(l.tbl as never) || enAttente.has(cleEnvoi(l))) continue
        if (l.supprime || !l.donnees) await db.table(l.tbl).delete(l.id)
        else await db.table(l.tbl).put(l.donnees)
      }
      const max = Math.max(dernier, ...lignes.map((l) => l.seq ?? 0))
      await db.meta.put({ cle: 'dernierSeq', valeur: max })
    })
    recus += nouvelles.length
    if (lignes.length < PAQUET || nouvelles.length === 0) break
  }
  return { envoyes, recus }
}

// --- État affiché dans l'en-tête et relance automatique ---

export type EtatSynchro = { etat: 'inactive' | 'non-connecte' | 'hors-ligne' | 'en-cours' | 'ok' | 'erreur'; enAttente: number; derniere?: string; message?: string }

let etat: EtatSynchro = { etat: synchroActive ? 'non-connecte' : 'inactive', enAttente: 0 }
const abonnes = new Set<(e: EtatSynchro) => void>()
function publier(partiel: Partial<EtatSynchro>) {
  etat = { ...etat, ...partiel }
  abonnes.forEach((f) => f(etat))
}

export function useSynchro(): EtatSynchro {
  const [e, setE] = useState(etat)
  useEffect(() => {
    abonnes.add(setE)
    return () => void abonnes.delete(setE)
  }, [])
  return e
}

let enCours = false
let relancer = false
export async function lancerSynchro() {
  if (!supabase) return
  publier({ enAttente: await db.envois.count() })
  if (!navigator.onLine) return publier({ etat: 'hors-ligne' })
  const { data } = await supabase.auth.getSession()
  if (!data.session) return publier({ etat: 'non-connecte' })
  if (enCours) return void (relancer = true)
  enCours = true
  publier({ etat: 'en-cours' })
  try {
    await synchroniser(serveurSupabase(supabase))
    if (await corrigerRation180()) await synchroniser(serveurSupabase(supabase))
    publier({ etat: 'ok', derniere: new Date().toISOString(), message: undefined, enAttente: await db.envois.count() })
  } catch (e) {
    publier({ etat: navigator.onLine ? 'erreur' : 'hors-ligne', message: e instanceof Error ? e.message : String(e), enAttente: await db.envois.count() })
  } finally {
    enCours = false
    if (relancer) {
      relancer = false
      void lancerSynchro()
    }
  }
}

/** Synchronise au démarrage, toutes les 30 s, au retour du réseau et peu après chaque saisie. */
export function demarrerSynchro(): () => void {
  if (!supabase) return () => {}
  let minuterie: ReturnType<typeof setTimeout> | undefined
  const bientot = () => {
    clearTimeout(minuterie)
    minuterie = setTimeout(() => void lancerSynchro(), 1500)
  }
  const surCreation = () => {
    setTimeout(bientot, 0)
  }
  db.envois.hook('creating', surCreation)
  const intervalle = setInterval(() => void lancerSynchro(), 30_000)
  const enLigne = () => void lancerSynchro()
  const horsLigne = () => publier({ etat: 'hors-ligne' })
  window.addEventListener('online', enLigne)
  window.addEventListener('offline', horsLigne)
  document.addEventListener('visibilitychange', enLigne)
  void lancerSynchro()
  return () => {
    db.envois.hook('creating').unsubscribe(surCreation)
    clearInterval(intervalle)
    clearTimeout(minuterie)
    window.removeEventListener('online', enLigne)
    window.removeEventListener('offline', horsLigne)
    document.removeEventListener('visibilitychange', enLigne)
  }
}
