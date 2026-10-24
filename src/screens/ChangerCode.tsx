import { useState } from 'react'
import { db, modifier, type Utilisateur } from '../db'
import { hacher, useUtilisateur } from '../session'

const QUATRE_CHIFFRES = /^\d{4}$/

/** Chaque utilisateur peut changer son propre code d'accès, en donnant d'abord l'ancien. */
export default function ChangerCode() {
  const u = useUtilisateur()
  const [ouvert, setOuvert] = useState(false)
  const [actuel, setActuel] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')

  function fermer() {
    setOuvert(false); setActuel(''); setNouveau(''); setConfirmation(''); setErreur('')
  }
  async function valider() {
    setErreur('')
    const moi = await db.utilisateurs.get(u.id)
    if (!moi) return setErreur('Utilisateur introuvable.')
    if (moi.pinHash && moi.pinHash !== (await hacher(actuel))) return setErreur('Le code actuel est incorrect.')
    if (!QUATRE_CHIFFRES.test(nouveau)) return setErreur('Le nouveau code doit avoir 4 chiffres.')
    if (nouveau !== confirmation) return setErreur('Les deux nouveaux codes ne sont pas identiques.')
    if (nouveau === actuel) return setErreur("Le nouveau code est le même que l'ancien.")
    await modifier<Utilisateur>('utilisateurs', u.id, { pinHash: await hacher(nouveau) })
    fermer()
    setMessage('Votre code a été changé. Utilisez le nouveau code à la prochaine connexion, sur tous les téléphones.')
  }
  const champ = (id: string, libelle: string, valeur: string, changer: (v: string) => void) => (
    <label>
      {libelle}
      <input id={id} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={valeur}
        onChange={(e) => changer(e.target.value.replace(/\D/g, '').slice(0, 4))} />
    </label>
  )

  if (!ouvert) {
    return (
      <>
        <button className="secondaire" id="changer-code" onClick={() => { setMessage(''); setOuvert(true) }}>Changer mon code d'accès</button>
        {message && <p className="info">{message}</p>}
      </>
    )
  }
  return (
    <section className="carte pile formulaire">
      <h3>Changer mon code d'accès</h3>
      {champ('code-actuel', 'Code actuel', actuel, setActuel)}
      {champ('code-nouveau', 'Nouveau code (4 chiffres)', nouveau, setNouveau)}
      {champ('code-confirmation', 'Confirmer le nouveau code', confirmation, setConfirmation)}
      {erreur && <p className="erreur">{erreur}</p>}
      <div className="segments">
        <button onClick={fermer}>Annuler</button>
        <button className="actif" onClick={() => void valider()}>Enregistrer</button>
      </div>
    </section>
  )
}
