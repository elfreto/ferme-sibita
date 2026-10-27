import { useState } from 'react'
import { UserRound } from 'lucide-react'
import TitrePage from '../TitrePage'
import { useLiveQuery } from 'dexie-react-hooks'
import { ACCES_ROLE, LIBELLE_ROLE, compterDonnees, db, dirigeLesBandes, effacerToutesLesDonnees, gereLesComptes, importerHistorique, type Historique } from '../db'
import { dateCourte } from '../calc'
import { lancerSynchro, supabase, synchroActive, useSynchro } from '../sync'
import { useUtilisateur } from '../session'
import { exporterExcel, lireSauvegarde, nomFichierSauvegarde, restaurer } from '../sauvegarde'
import { telechargerFichier } from '../exportBilan'
import type { Naviguer } from '../App'
import ChangerCode from './ChangerCode'

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
  const [sauvegarde, setSauvegarde] = useState('')
  const [aEffacer, setAEffacer] = useState<Awaited<ReturnType<typeof compterDonnees>> | null>(null)
  const [motEffacer, setMotEffacer] = useState('')
  const [aRestaurer, setARestaurer] = useState<{ nom: string; donnees: Awaited<ReturnType<typeof lireSauvegarde>> } | null>(null)
  async function telecharger() {
    setSauvegarde('Préparation du fichier…')
    try {
      const nom = nomFichierSauvegarde()
      telechargerFichier(await exporterExcel(), nom)
      setSauvegarde(`Fichier ${nom} téléchargé. Gardez-le en lieu sûr (Drive, e-mail…).`)
    } catch {
      setSauvegarde("Le fichier n'a pas pu être créé.")
    }
  }
  async function choisirSauvegarde(fichier?: File) {
    if (!fichier) return
    setSauvegarde('Lecture du fichier…')
    try {
      setARestaurer({ nom: fichier.name, donnees: await lireSauvegarde(await fichier.arrayBuffer()) })
      setSauvegarde('')
    } catch {
      setSauvegarde("Ce fichier n'est pas une sauvegarde Excel de la ferme.")
    }
  }
  const compte = (t: keyof Awaited<ReturnType<typeof lireSauvegarde>>) => aRestaurer?.donnees[t]?.length ?? 0
  const heure = s.derniere ? `${dateCourte(s.derniere.slice(0, 10))} à ${new Date(s.derniere).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : undefined
  return (
    <div className="pile">
      <TitrePage icone={<UserRound size={20} />} titre={u.nom} />
      <div className={`acces ${u.role}`}>
        <strong>Votre accès : {LIBELLE_ROLE[u.role]}</strong>
        <span>{ACCES_ROLE[u.role]}</span>
      </div>
      {dirigeLesBandes(u) && <button className="secondaire" onClick={() => naviguer({ nom: 'annuel' })}>Tableau de bord annuel</button>}
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
      {gereLesComptes(u) && (
        <section className="carte pile">
          <h3>Sauvegarde Excel</h3>
          <p className="petit">Un fichier Excel avec toutes les données (bandes, saisies, ventes, dépenses, versements, stock, équipe). Il permet de tout remettre en cas de problème. Les codes PIN n'y sont pas.</p>
          <button className="secondaire" id="telecharger-sauvegarde" onClick={() => void telecharger()}>Télécharger la sauvegarde Excel</button>
          <label className="secondaire bouton-fichier">
            Restaurer une sauvegarde Excel
            <input id="restaurer-sauvegarde" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { void choisirSauvegarde(e.target.files?.[0]); e.target.value = '' }} hidden />
          </label>
          {sauvegarde && <p className="info">{sauvegarde}</p>}
          <button className="danger" id="effacer-donnees" onClick={async () => { setMotEffacer(''); setAEffacer(await compterDonnees()) }}>Effacer toutes les données</button>
        </section>
      )}
      {aEffacer && (
        <div className="confirmer danger" role="alertdialog">
          <h3>Effacer toutes les données ?</h3>
          <p>
            Seront effacés sur tous les téléphones : {aEffacer.bandes} bandes, {aEffacer.journal} saisies, {aEffacer.ventes} ventes, {aEffacer.depenses} dépenses,
            {' '}{aEffacer.remises} versements et {aEffacer.mouvements} mouvements de stock. L'équipe, les codes et les 3 articles du stock restent.
            Cette action est irréversible : téléchargez d'abord la sauvegarde Excel.
          </p>
          <label>
            Pour confirmer, tapez EFFACER
            <input id="mot-effacer" value={motEffacer} onChange={(e) => setMotEffacer(e.target.value)} autoComplete="off" />
          </label>
          <div className="segments">
            <button onClick={() => setAEffacer(null)}>Annuler</button>
            <button className="actif" disabled={motEffacer.trim().toUpperCase() !== 'EFFACER'} onClick={async () => {
              const n = await effacerToutesLesDonnees()
              setAEffacer(null)
              setSauvegarde(`${n} éléments effacés. L'effacement part vers les autres téléphones.`)
              void lancerSynchro()
            }}>Oui, tout effacer</button>
          </div>
        </div>
      )}
      {aRestaurer && (
        <div className="confirmer danger" role="alertdialog">
          <h3>Restaurer la sauvegarde ?</h3>
          <p>
            {aRestaurer.nom} contient {compte('bandes')} bandes, {compte('journal')} saisies, {compte('ventes')} ventes, {compte('depenses')} dépenses,
            {' '}{compte('remises')} versements et {compte('mouvements')} mouvements de stock.
            Les éléments du fichier remplaceront ceux qui ont le même identifiant, sur tous les téléphones. Rien n'est supprimé.
          </p>
          <div className="segments">
            <button onClick={() => setARestaurer(null)}>Annuler</button>
            <button className="actif" onClick={async () => {
              const n = await restaurer(aRestaurer.donnees)
              setARestaurer(null)
              setSauvegarde(`${n} éléments restaurés : ils partent vers les autres téléphones.`)
            }}>Oui, restaurer</button>
          </div>
        </div>
      )}
      <ChangerCode />
      <button className="danger" onClick={onQuitter}>Se déconnecter</button>
    </div>
  )
}
