import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { LIBELLE_ROLE, db, ordreRole, type Utilisateur } from '../db'
import { connecter } from '../session'

export default function Connexion({ onConnecte }: { onConnecte: (u: Utilisateur) => void }) {
  const utilisateurs = useLiveQuery(() => db.utilisateurs.filter((u) => u.actif !== false).toArray().then((l) =>
    l.sort((a, b) => ordreRole(a.role) - ordreRole(b.role) || a.nom.localeCompare(b.nom))), [])
  const [choisi, setChoisi] = useState<Utilisateur | null>(null)
  const [pin, setPin] = useState('')
  const [erreur, setErreur] = useState('')

  async function taper(chiffre: string) {
    if (!choisi) return
    const nouveau = (pin + chiffre).slice(0, 4)
    setPin(nouveau)
    setErreur('')
    if (nouveau.length === 4) {
      const r = await connecter(choisi.id, nouveau)
      if (r === 'pin-incorrect') {
        setErreur('Code incorrect')
        setPin('')
      } else {
        onConnecte(r)
      }
    }
  }

  return (
    <div className="connexion">
      <h1 className="logo-connexion">
        <img src={`${import.meta.env.BASE_URL}logo-complet.png`} alt="La Ferme de Sibita" width={150} height={160} />
      </h1>
      {import.meta.env.VITE_DEMO && (
        <p className="info">
          Version d'essai : les saisies restent sur cet appareil et ne sont pas encore partagées entre téléphones.
          Le premier code tapé pour chaque personne devient son code.
        </p>
      )}
      {!choisi ? (
        <>
          <p>Qui êtes-vous ?</p>
          <div className="choix-utilisateurs">
            {utilisateurs?.map((u) => (
              <button key={u.id} className="gros" onClick={() => setChoisi(u)}>
                {u.nom}
                <small>{LIBELLE_ROLE[u.role]}</small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>
            {choisi.pinHash
              ? `Bonjour ${choisi.nom}, entrez votre code`
              : `Bonjour ${choisi.nom}, choisissez votre code à 4 chiffres. Retenez-le : il vous sera demandé à chaque connexion.`}
          </p>
          <div className="points" aria-label={`${pin.length} chiffres tapés`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={i < pin.length ? 'plein' : ''} />
            ))}
          </div>
          {erreur && <p className="erreur">{erreur}</p>}
          <div className="pave">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => (
              <button key={c} onClick={() => taper(c)}>{c}</button>
            ))}
            <button onClick={() => { setChoisi(null); setPin('') }}>Retour</button>
            <button onClick={() => taper('0')}>0</button>
            <button onClick={() => setPin(pin.slice(0, -1))}>Effacer</button>
          </div>
        </>
      )}
    </div>
  )
}
