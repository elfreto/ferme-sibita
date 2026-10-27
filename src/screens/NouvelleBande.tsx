import { useState } from 'react'
import { Plus } from 'lucide-react'
import TitrePage from '../TitrePage'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, enregistrer, nouvelId } from '../db'
import { aujourdhui } from '../calc'
import ChoixDate from '../ChoixDate'

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export default function NouvelleBande({ espace: espaceInitial, onFini }: { espace?: 1 | 2; onFini: () => void }) {
  const enCours = useLiveQuery(() => db.bandes.where('statut').equals('en_cours').toArray(), [])
  const employes = useLiveQuery(() => db.utilisateurs.filter((u) => u.actif !== false).toArray(), [])
  const [espace, setEspace] = useState<1 | 2>(espaceInitial ?? 2)
  const [date, setDate] = useState(aujourdhui())
  const [poussins, setPoussins] = useState('1000')
  const [prix, setPrix] = useState('')
  const [responsable, setResponsable] = useState('Georges')
  const [erreur, setErreur] = useState('')

  const occupe = enCours?.find((b) => b.espace === espace)
  const d = new Date(date + 'T12:00:00')
  const nom = `Bande ${MOIS[d.getMonth()]} ${d.getFullYear()}`

  async function valider() {
    const n = parseInt(poussins)
    if (occupe) return setErreur(`L'espace ${espace} a déjà une bande en cours (${occupe.nom}).`)
    if (!n || n <= 0) return setErreur('Indiquez le nombre de poussins reçus.')
    if (!date || date > aujourdhui()) return setErreur('Choisissez une date qui n\'est pas dans le futur.')
    await enregistrer('bandes', {
      id: nouvelId(),
      nom,
      espace,
      dateReception: date,
      poussins: n,
      prixPoussin: parseFloat(prix) || undefined,
      responsable,
      statut: 'en_cours' as const,
    })
    onFini()
  }

  return (
    <div className="pile formulaire">
      <TitrePage icone={<Plus size={20} />} titre="Nouvelle bande" />
      <fieldset>
        <legend>Espace du bâtiment</legend>
        <div className="segments">
          {([1, 2] as const).map((e) => (
            <button key={e} type="button" className={espace === e ? 'actif' : ''} onClick={() => setEspace(e)}>Espace {e}</button>
          ))}
        </div>
      </fieldset>
      {occupe && <p className="erreur">Occupé par {occupe.nom}. Clôturez-la d'abord.</p>}
      <label>
        Date de création (réception des poussins)
        <ChoixDate id="bande-date" value={date} onChange={setDate} />
      </label>
      <label>
        Nombre de poussins reçus
        <input type="number" inputMode="numeric" value={poussins} onChange={(e) => setPoussins(e.target.value)} />
      </label>
      <label>
        Prix d'un poussin (FCFA, facultatif)
        <input type="number" inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value)} />
      </label>
      <label>
        Responsable
        <select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
          {employes?.map((u) => <option key={u.id} value={u.nom}>{u.nom}</option>)}
        </select>
      </label>
      <p className="info">Elle s'appellera « {nom} ».</p>
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="principal" onClick={valider} disabled={!!occupe}>Créer la bande</button>
    </div>
  )
}
