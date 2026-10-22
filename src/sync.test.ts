import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, enregistrer, supprimer, type Bande } from './db'
import { synchroniser, type LigneServeur, type Serveur } from './sync'

/** Serveur en mémoire qui numérote chaque modification, comme la table Supabase. */
function faux(): Serveur & { lignes: Map<string, LigneServeur> } {
  let seq = 0
  const lignes = new Map<string, LigneServeur>()
  return {
    lignes,
    async envoyer(ls) { for (const l of ls) lignes.set(`${l.tbl}|${l.id}`, { ...structuredClone(l), seq: ++seq }) },
    async recevoir(depuis, limite) { return [...lignes.values()].filter((l) => l.seq! > depuis).sort((a, b) => a.seq! - b.seq!).slice(0, limite) },
  }
}
const bande = (id: string, nom: string): Bande => ({ id, nom, espace: 1, dateReception: '2026-10-01', poussins: 1000, statut: 'en_cours' })

describe('synchronisation', () => {
  beforeEach(async () => {
    await Promise.all([db.bandes.clear(), db.envois.clear(), db.meta.clear()])
  })

  it('envoie les saisies en attente puis vide la file', async () => {
    const s = faux()
    await enregistrer('bandes', bande('b1', 'Bande A'))
    await enregistrer('bandes', { ...bande('b1', 'Bande A'), poussins: 1005 })
    const r = await synchroniser(s)
    expect(r.envoyes).toBe(1)
    expect((s.lignes.get('bandes|b1')!.donnees as Bande).poussins).toBe(1005)
    expect(await db.envois.count()).toBe(0)
  })

  it("reprend les modifications et suppressions d'un autre téléphone", async () => {
    const s = faux()
    await s.envoyer([{ tbl: 'bandes', id: 'b2', donnees: bande('b2', 'Bande B'), supprime: false }])
    await synchroniser(s)
    expect((await db.bandes.get('b2'))?.nom).toBe('Bande B')
    await s.envoyer([{ tbl: 'bandes', id: 'b2', donnees: null, supprime: true }])
    const r = await synchroniser(s)
    expect(r.recus).toBe(1)
    expect(await db.bandes.get('b2')).toBeUndefined()
  })

  it("n'écrase pas une modification locale pas encore envoyée", async () => {
    const s = faux()
    await enregistrer('bandes', bande('b3', 'Ici'))
    // l'envoi échoue : la saisie reste en attente
    const enPanne: Serveur = { envoyer: async () => { throw new Error('réseau') }, recevoir: s.recevoir }
    await expect(synchroniser(enPanne)).rejects.toThrow()
    await s.envoyer([{ tbl: 'bandes', id: 'b3', donnees: bande('b3', 'Ailleurs'), supprime: false }])
    await synchroniser(s)
    expect((await db.bandes.get('b3'))?.nom).toBe('Ici')
    expect((s.lignes.get('bandes|b3')!.donnees as Bande).nom).toBe('Ici')
  })

  it('envoie une suppression', async () => {
    const s = faux()
    await enregistrer('bandes', bande('b4', 'À effacer'))
    await synchroniser(s)
    await supprimer('bandes', 'b4')
    await synchroniser(s)
    expect(s.lignes.get('bandes|b4')!.supprime).toBe(true)
  })
})
