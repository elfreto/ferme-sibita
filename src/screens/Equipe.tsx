import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ACCES_ROLE, LIBELLE_ROLE, ROLES, db, enregistrer, gereLesComptes, modifier, nouvelId, ordreRole, type Role, type Utilisateur } from '../db'
import { useUtilisateur } from '../session'

/** Gestion des comptes, réservée aux chefs d'exploitation. */
export default function Equipe() {
  const moi = useUtilisateur()
  const comptes = useLiveQuery(() => db.utilisateurs.filter((u) => u.actif !== false).toArray(), [])
  const [nom, setNom] = useState('')
  const [fonction, setFonction] = useState<Role>('employe')
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')
  const [aSupprimer, setASupprimer] = useState<Utilisateur | null>(null)

  if (!gereLesComptes(moi)) return <p>Seuls les chefs d'exploitation gèrent les comptes.</p>
  if (!comptes) return null

  async function ajouter() {
    const n = nom.trim()
    setErreur('')
    if (!n) return setErreur('Indiquez le nom de la personne.')
    if (comptes!.some((u) => u.nom.toLowerCase() === n.toLowerCase())) return setErreur(`${n} a déjà un compte.`)
    await enregistrer('utilisateurs', { id: nouvelId(), nom: n, role: fonction, actif: true, creeLe: new Date().toISOString() })
    setNom('')
    setMessage(`Compte ${LIBELLE_ROLE[fonction]} créé pour ${n}. À sa première connexion, ${n} choisira son code à 4 chiffres.`)
  }

  async function changerFonction(u: Utilisateur, role: Role) {
    await modifier<Utilisateur>('utilisateurs', u.id, { role })
    setMessage(`${u.nom} : accès ${LIBELLE_ROLE[role]}.`)
  }

  async function reinitialiserCode(u: Utilisateur) {
    await modifier<Utilisateur>('utilisateurs', u.id, { pinHash: undefined })
    setMessage(`Code de ${u.nom} effacé : ${u.nom} en choisira un nouveau à sa prochaine connexion.`)
  }

  async function supprimer(u: Utilisateur) {
    // Le compte est désactivé, pas effacé : ses saisies gardent le nom de leur auteur
    await modifier<Utilisateur>('utilisateurs', u.id, { actif: false })
    setASupprimer(null)
    setMessage(`Le compte de ${u.nom} est supprimé. Ses saisies restent dans l'historique.`)
  }

  const tri = [...comptes].sort((a, b) => ordreRole(a.role) - ordreRole(b.role) || a.nom.localeCompare(b.nom))

  return (
    <div className="pile formulaire">
      <h1>Équipe</h1>
      {message && <p className="info">{message}</p>}

      <section>
        <h3>Accès par fonction</h3>
        <dl className="acces-liste">
          {ROLES.map((r) => (
            <div key={r}>
              <dt><span className={`badge ${r}`}>{LIBELLE_ROLE[r]}</span></dt>
              <dd>{ACCES_ROLE[r]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ul className="equipe">
        {tri.map((u) => (
          <li key={u.id} className="carte">
            <div className="equipe-tete">
              <strong>{u.nom}{u.id === moi.id && ' (vous)'}</strong>
              <span className={`badge ${u.role}`}>{LIBELLE_ROLE[u.role]}</span>
            </div>
            {u.id === moi.id ? (
              <p className="petit">Vous ne pouvez pas changer votre propre accès ni supprimer votre compte. Un autre chef d'exploitation peut le faire.</p>
            ) : (
              <>
                <div className="segments quatre">
                  {ROLES.map((f) => (
                    <button key={f} type="button" className={u.role === f ? 'actif' : ''} onClick={() => changerFonction(u, f)}>
                      {LIBELLE_ROLE[f]}
                    </button>
                  ))}
                </div>
                <div className="equipe-actions">
                  <button className="lien neutre" onClick={() => reinitialiserCode(u)}>Effacer son code</button>
                  <button className="lien" onClick={() => setASupprimer(u)}>Supprimer le compte</button>
                </div>
                {!u.pinHash && <p className="petit">Pas encore de code : il sera choisi à la première connexion.</p>}
              </>
            )}
          </li>
        ))}
      </ul>

      <section className="carte">
        <h3>Ajouter une personne</h3>
        <label>
          Nom
          <input id="nouveau-nom" type="text" value={nom} placeholder="ex. Paul" onChange={(e) => setNom(e.target.value)} />
        </label>
        <fieldset>
          <legend>Accès</legend>
          <div className="segments quatre">
            {ROLES.map((f) => (
              <button key={f} type="button" className={fonction === f ? 'actif' : ''} onClick={() => setFonction(f)}>
                {LIBELLE_ROLE[f]}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="petit">{ACCES_ROLE[fonction]}</p>
        {erreur && <p className="erreur">{erreur}</p>}
        <button className="principal" onClick={ajouter}>Créer le compte</button>
      </section>

      {aSupprimer && (
        <div className="confirmer" role="alertdialog">
          <p>Supprimer le compte de {aSupprimer.nom} ({LIBELLE_ROLE[aSupprimer.role]}) ? {aSupprimer.nom} ne pourra plus se connecter.</p>
          <div className="segments">
            <button onClick={() => setASupprimer(null)}>Annuler</button>
            <button className="actif" onClick={() => supprimer(aSupprimer)}>Supprimer</button>
          </div>
        </div>
      )}
    </div>
  )
}
