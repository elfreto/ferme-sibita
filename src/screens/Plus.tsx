import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ACCES_ROLE, LIBELLE_ROLE, db, gereLesComptes, importerHistorique, type Historique } from '../db'
import { dateCourte } from '../calc'
import { lancerSynchro, supabase, synchroActive, useSynchro } from '../sync'
import { useUtilisateur } from '../session'
import type { Naviguer } from '../App'

export default function Plus({ naviguer, onQuitter }: { naviguer: Naviguer; onQuitter: () => void }) {
  const u = useUtilisateur()
  const s = useSynchro()
  const historiqueImporte = useLiveQuery(() => db.bandes.where('id').startsWith('import-').count().then((n) => n > 0), [])
  const [importMessage, setImportMessage] = useState('')
  async function importer(fichier?: File) {
    if (!fichier) return
    try {
      const h = JSON.parse(await fichier.text()) as Historique
      if (!Array.isArray(h.bandes) || !Array.isArray(h.journal)) throw new Error('format')
      const n = await importerHistorique(h)
      setImportMessage(`${n} éléments importés : ils partent vers les autres téléphones.`)
    } catch {
      setImportMessage("Ce fichier n'est pas l'historique de la ferme (historique.json).")
    }
  }
  const heure = s.derniere ? `${dateCourte(s.derniere.slice(0, 10))} à ${new Date(s.derniere).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : undefined
  return (
    <div className="pile">
      <h1>{u.nom}</h1>
      <div className={`acces ${u.role}`}>
        <strong>Votre accès : {LIBELLE_ROLE[u.role]}</strong>
        <span>{ACCES_ROLE[u.role]}</span>
      </div>
      {gereLesComptes(u) && <button className="secondaire" onClick={() => naviguer({ nom: 'equipe' })}>Équipe et accès</button>}
      {synchroActive && (
        <section className="carte pile">
          <h3>Partage entre téléphones</h3>
          <p>
            {s.etat === 'hors-ligne' ? 'Pas de réseau pour le moment.' : s.etat === 'erreur' ? `Dernier essai échoué : ${s.message ?? 'erreur inconnue'}` : s.etat === 'en-cours' ? 'Envoi en cours…' : 'Les saisies sont partagées.'}
          </p>
          <p className="petit">
            {s.enAttente > 0 ? `${s.enAttente} modification${s.enAttente > 1 ? 's' : ''} en attente d'envoi. ` : 'Rien en attente. '}
            {heure ? `Dernier partage : ${heure}.` : ''}
          </p>
          <button className="secondaire" onClick={() => void lancerSynchro()}>Synchroniser maintenant</button>
          {gereLesComptes(u) && historiqueImporte === false && (
            <label className="secondaire bouton-fichier">
              Importer l'historique Excel (historique.json)
              <input id="import-historique" type="file" accept=".json,application/json" onChange={(e) => void importer(e.target.files?.[0])} hidden />
            </label>
          )}
          {importMessage && <p className="info">{importMessage}</p>}
          {gereLesComptes(u) && (
            <button className="lien" onClick={async () => {
              if (s.enAttente > 0) return
              await supabase!.auth.signOut()
              location.reload()
            }}>{s.enAttente > 0 ? 'Délier ce téléphone (attendez que tout soit envoyé)' : 'Délier ce téléphone de la ferme'}</button>
          )}
        </section>
      )}
      <button className="danger" onClick={onQuitter}>Se déconnecter</button>
    </div>
  )
}
