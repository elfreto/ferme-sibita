import { useState } from 'react'
import { lancerSynchro, supabase } from '../sync'

/** Une fois par téléphone : relie l'application au compte de la ferme sur le serveur partagé. */
export default function ConnexionFerme({ onConnecte }: { onConnecte: () => void }) {
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [attente, setAttente] = useState(false)

  async function valider() {
    setErreur('')
    if (!navigator.onLine) return setErreur('Il faut du réseau pour relier ce téléphone à la ferme (une seule fois).')
    setAttente(true)
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password: motDePasse })
    if (error) {
      setAttente(false)
      return setErreur(error.message.includes('Invalid') ? 'Adresse ou mot de passe incorrect.' : `Connexion impossible : ${error.message}`)
    }
    // On reprend tout de suite les données de la ferme avant que quiconque saisisse
    await lancerSynchro()
    setAttente(false)
    onConnecte()
  }

  return (
    <div className="connexion">
      <h1 className="logo-connexion">
        <img src={`${import.meta.env.BASE_URL}logo-complet.png`} alt="La Ferme de Sibita" width={180} height={170} />
      </h1>
      <p className="info">
        Première ouverture sur ce téléphone : le chef d'exploitation le relie au compte de la ferme.
        Ensuite, chacun se connecte avec son code, même sans réseau.
      </p>
      <div className="pile formulaire" style={{ width: '100%', maxWidth: 360, textAlign: 'left' }}>
        <label>
          Adresse e-mail de la ferme
          <input id="ferme-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Mot de passe
          <input id="ferme-mdp" type="password" autoComplete="current-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        </label>
        {erreur && <p className="erreur">{erreur}</p>}
        <button className="principal" onClick={valider} disabled={attente}>{attente ? 'Connexion et chargement des données…' : 'Relier ce téléphone'}</button>
      </div>
    </div>
  )
}
