import { useEffect, useState } from 'react'
import { CATEGORIES, enregistrer, nouvelId, payeeAvecVentes, peutGerer, type Categorie, type Depense, type Remise, type Vente, versementEnAttente } from '../db'
import { argentEnMain, resteDu, totalVente } from '../argent'
import { aujourdhui, fcfa, journees, nombre, resume } from '../calc'
import { useDonnees } from '../hooks'
import { useUtilisateur } from '../session'
import { ajouterReglement } from './Caisse'
import ChoixDate from '../ChoixDate'

const lire = (s: string) => {
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function Confirmation({ texte }: { texte: string }) {
  return (
    <div className="confirmation">
      <div className="coche">✓</div>
      <p>{texte}</p>
    </div>
  )
}

/** Date : les gestionnaires choisissent le jour, les autres saisissent pour aujourd'hui. */
function ChampDate({ date, setDate, min }: { date: string; setDate: (d: string) => void; min?: string }) {
  const u = useUtilisateur()
  if (!peutGerer(u)) return <p className="sous-titre">Aujourd'hui</p>
  return (
    <label>
      Date
      <ChoixDate value={date} min={min} onChange={setDate} />
    </label>
  )
}

const modification = (nom: string) => ({ modifieLe: new Date().toISOString(), modifiePar: nom })

export function NouvelleVente({ editId, onFini }: { editId?: string; onFini: () => void }) {
  const d = useDonnees()
  const u = useUtilisateur()
  const [bandeId, setBandeId] = useState('')
  const [date, setDate] = useState(aujourdhui())
  const [qte, setQte] = useState('')
  const [prix, setPrix] = useState('')
  const [client, setClient] = useState('')
  const [credit, setCredit] = useState(false)
  const [recu, setRecu] = useState('')
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState('')
  const [fini, setFini] = useState(false)

  const existant = editId ? d?.ventes.find((v) => v.id === editId) : undefined
  const enCours = d?.bandes.filter((b) => b.statut === 'en_cours' || b.id === existant?.bandeId) ?? []
  useEffect(() => {
    if (!editId && !bandeId && enCours.length) setBandeId(enCours[0].id)
  }, [enCours.length])
  // Modification : on part des valeurs enregistrées
  useEffect(() => {
    if (!existant) return
    const total = totalVente({ ...existant, montantRecu: undefined, reglements: undefined })
    setBandeId(existant.bandeId); setDate(existant.date); setQte(String(existant.qte)); setPrix(String(existant.prixUnitaire))
    setClient(existant.client ?? ''); setNote(existant.note ?? '')
    const recuInitial = existant.montantRecu ?? total
    setCredit(recuInitial < total); setRecu(recuInitial < total ? String(recuInitial) : '')
  }, [existant?.id])
  // Prix proposé : celui de la dernière vente
  useEffect(() => {
    if (!d || prix || editId) return
    const derniere = [...d.ventes].sort((a, b) => `${b.date}${b.creeLe}`.localeCompare(`${a.date}${a.creeLe}`))[0]
    if (derniere) setPrix(String(derniere.prixUnitaire))
  }, [d])

  if (!d) return null
  if (fini) return <Confirmation texte={existant ? 'Vente modifiée' : 'Vente enregistrée'} />
  if (!enCours.length) return <p>Aucune bande en cours : rien à vendre.</p>

  const bande = d.bandes.find((b) => b.id === bandeId)
  const restants = bande
    ? resume(bande, journees(bande, d.saisies.filter((s) => s.bandeId === bande.id), d.ventes.filter((v) => v.bandeId === bande.id))).vivants
    : 0
  const dispo = restants + (existant && existant.bandeId === bandeId ? existant.qte : 0)
  const q = lire(qte), p = lire(prix)
  const total = q && p ? q * p : 0
  const clients = [...new Set(d.ventes.map((v) => v.client).filter((c): c is string => !!c))].sort()

  async function valider() {
    setErreur('')
    if (!bande) return setErreur('Choisissez la bande.')
    if (!q || q <= 0 || !Number.isInteger(q)) return setErreur('Indiquez le nombre de poulets vendus.')
    if (q > dispo) return setErreur(`Il ne reste que ${dispo} poulets dans cette bande.`)
    if (!p || p <= 0) return setErreur('Indiquez le prix d\'un poulet.')
    const montantRecu = credit ? (lire(recu) ?? 0) : total
    if (montantRecu < 0 || montantRecu > total) return setErreur(`Le montant reçu doit être entre 0 et ${fcfa(total)}.`)
    if (montantRecu < total && !client.trim()) return setErreur('Pour une vente à crédit, indiquez le nom du client.')
    const champs = { bandeId: bande.id, date, qte: q, prixUnitaire: p, montantRecu, client: client.trim() || undefined, note: note.trim() || undefined }
    const v: Vente = existant
      ? { ...existant, ...champs, ...modification(u.nom) }
      : { id: nouvelId(), ...champs, auteur: u.nom, creeLe: new Date().toISOString() }
    await enregistrer('ventes', v)
    setFini(true)
    setTimeout(onFini, 900)
  }

  return (
    <div className="pile formulaire">
      <h1>{existant ? 'Modifier la vente' : 'Nouvelle vente'}</h1>
      {enCours.length > 1 ? (
        <fieldset>
          <legend>Bande</legend>
          <div className="segments">
            {enCours.map((b) => (
              <button key={b.id} type="button" className={bandeId === b.id ? 'actif' : ''} onClick={() => setBandeId(b.id)}>
                Espace {b.espace}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <p className="sous-titre">{bande?.nom} · {nombre(dispo)} poulets restants</p>
      <ChampDate date={date} setDate={setDate} min={bande?.dateReception} />
      <div className="deux">
        <label>
          Poulets vendus
          <input id="vente-qte" type="number" inputMode="numeric" value={qte} onChange={(e) => setQte(e.target.value)} />
        </label>
        <label>
          Prix d'un poulet (FCFA)
          <input id="vente-prix" type="number" inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value)} />
        </label>
      </div>
      {total > 0 && <p className="info">Total : <strong>{fcfa(total)}</strong></p>}
      <label>
        Client
        <input id="vente-client" type="text" list="clients" placeholder="Facultatif, sauf à crédit" value={client} onChange={(e) => setClient(e.target.value)} />
        <datalist id="clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="case">
        <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
        Pas payé en entier (crédit)
      </label>
      {credit && (
        <label>
          Montant reçu maintenant (FCFA)
          <input id="vente-recu" type="number" inputMode="numeric" placeholder="0" value={recu} onChange={(e) => setRecu(e.target.value)} />
          {total > 0 && <small className="petit">Reste dû : {fcfa(Math.max(0, total - (lire(recu) ?? 0)))}</small>}
        </label>
      )}
      <label>
        Note
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="principal" onClick={valider}>{existant ? 'Enregistrer la modification' : 'Enregistrer la vente'}</button>
    </div>
  )
}

// Liste fixée par Justin, avec la catégorie du bilan proposée par défaut
const POSTES: [string, Categorie][] = [
  ['Transport', 5], ['Fiches', 5], ['Ticket marché', 5], ['Poussins', 1], ['Autres ingrédients', 3], ['Médicaments', 2], ['Désinfectant', 2], ['Entretien', 2], ['Maintenance', 2],
  ['Chauffage', 2], ['Electricité', 2], ['Salaires', 4], ['Autres', 2],
]

export function NouvelleDepense({ editId, onFini }: { editId?: string; onFini: () => void }) {
  const d = useDonnees()
  const u = useUtilisateur()
  const gestion = peutGerer(u)
  const [date, setDate] = useState(aujourdhui())
  const [bandeId, setBandeId] = useState<string>('')
  const [categorie, setCategorie] = useState<Categorie>(5)
  const [designation, setDesignation] = useState('')
  const [precision, setPrecision] = useState('')
  const [montant, setMontant] = useState('')
  const [avecVentes, setAvecVentes] = useState(false)
  const [erreur, setErreur] = useState('')
  const [fini, setFini] = useState(false)
  const existant = editId ? d?.depenses.find((x) => x.id === editId) : undefined
  const enCours = d?.bandes.filter((b) => b.statut === 'en_cours') ?? []
  useEffect(() => {
    if (!editId && !bandeId && enCours.length) setBandeId(enCours[0].id)
  }, [enCours.length])
  useEffect(() => {
    if (!existant) return
    const [poste, ...reste] = existant.designation.split(' – ')
    const connu = POSTES.some(([nom]) => nom === poste)
    setDate(existant.date); setBandeId(existant.bandeId ?? ''); setCategorie(existant.categorie)
    setDesignation(connu ? poste : 'Autres'); setPrecision(connu ? reste.join(' – ') : existant.designation)
    setMontant(String(existant.montant)); setAvecVentes(payeeAvecVentes(existant))
  }, [existant?.id])

  if (!d) return null
  if (fini) return <Confirmation texte={existant ? 'Dépense modifiée' : 'Dépense enregistrée'} />
  const m = lire(montant)
  // L'argent en main de l'auteur de la dépense (en modification, on lui rend d'abord l'ancien montant)
  const payeur = existant?.auteur ?? u.nom
  const enMain = (argentEnMain(d.utilisateurs, d.ventes, d.depenses, d.remises).get(payeur) ?? 0) + (existant && payeeAvecVentes(existant) ? existant.montant : 0)

  async function valider() {
    setErreur('')
    if (!designation) return setErreur('Choisissez ce qui a été payé.')
    if (!m || m <= 0) return setErreur('Indiquez le montant.')
    if ((!gestion || categorie === 5 || avecVentes) && m > enMain) return setErreur(`${existant ? payeur + ' n\'a' : 'Vous n\'avez'} que ${fcfa(enMain)} d'argent des ventes en main.`)
    const champs = {
      date, bandeId: bandeId || undefined, categorie: gestion ? categorie : (5 as Categorie),
      designation: precision.trim() ? `${designation} – ${precision.trim()}` : designation, montant: m, payeAvecVentes: !gestion || categorie === 5 || avecVentes,
    }
    const dep: Depense = existant
      ? { ...existant, ...champs, ...modification(u.nom) }
      : { id: nouvelId(), ...champs, auteur: u.nom, creeLe: new Date().toISOString() }
    await enregistrer('depenses', dep)
    setFini(true)
    setTimeout(onFini, 900)
  }

  return (
    <div className="pile formulaire">
      <h1>{existant ? 'Modifier la dépense' : 'Nouvelle dépense'}</h1>
      {!gestion && <p className="info">Petite dépense payée avec l'argent des ventes (transport, fiches, ticket marché…). Vous avez {fcfa(enMain)} en main.</p>}
      <ChampDate date={date} setDate={setDate} />
      <label>
        Bande
        <select value={bandeId} onChange={(e) => setBandeId(e.target.value)}>
          {enCours.map((b) => <option key={b.id} value={b.id}>{b.nom} (espace {b.espace})</option>)}
          {gestion && d.bandes.filter((b) => b.statut !== 'en_cours').map((b) => <option key={b.id} value={b.id}>{b.nom} (terminée)</option>)}
          {gestion && <option value="">Dépense générale (aucune bande)</option>}
        </select>
      </label>
      {gestion && (
        <label>
          Catégorie du bilan
          <select value={categorie} onChange={(e) => setCategorie(Number(e.target.value) as Categorie)}>
            {([1, 2, 3, 4, 5] as Categorie[]).map((c) => <option key={c} value={c}>{c}. {CATEGORIES[c]}</option>)}
          </select>
        </label>
      )}
      <label>
        Ce qui a été payé
        <select id="depense-designation" value={designation} onChange={(e) => {
          const poste = POSTES.find(([nom]) => nom === e.target.value)
          setDesignation(e.target.value)
          if (poste) setCategorie(poste[1])
        }}>
          <option value="">Choisir…</option>
          {POSTES.map(([nom]) => <option key={nom} value={nom}>{nom}</option>)}
        </select>
      </label>
      <label>
        Précision (facultatif)
        <input id="depense-precision" type="text" value={precision} onChange={(e) => setPrecision(e.target.value)} />
      </label>
      <label>
        Montant (FCFA)
        <input id="depense-montant" type="number" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} />
      </label>
      {gestion && categorie !== 5 && (
        <label className="case">
          <input type="checkbox" checked={avecVentes} onChange={(e) => setAvecVentes(e.target.checked)} />
          Payé avec l'argent des ventes
        </label>
      )}
      {gestion && categorie === 5 && <p className="petit">Une dépense pendant la vente est retirée de votre argent des ventes en main ({fcfa(enMain)}).</p>}
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="principal" onClick={valider}>{existant ? 'Enregistrer la modification' : 'Enregistrer la dépense'}</button>
    </div>
  )
}

export function NouveauVersement({ editId, onFini }: { editId?: string; onFini: () => void }) {
  const d = useDonnees()
  const u = useUtilisateur()
  const gestion = peutGerer(u)
  const [date, setDate] = useState(aujourdhui())
  const [de, setDe] = useState(u.role === 'cofondateur' ? '' : u.nom)
  const [a, setA] = useState('')
  const [montant, setMontant] = useState('')
  const [erreur, setErreur] = useState('')
  const [fini, setFini] = useState(false)
  const existant = editId ? d?.remises.find((r) => r.id === editId) : undefined
  useEffect(() => {
    if (!existant) return
    setDate(existant.date); setDe(existant.de); setA(existant.a); setMontant(String(existant.montant))
  }, [existant?.id])
  if (!d) return null
  if (fini) return <Confirmation texte={existant ? 'Versement modifié' : 'Versement enregistré : en attente de confirmation'} />
  const enMain = argentEnMain(d.utilisateurs, d.ventes, d.depenses, d.remises)
  const actifs = d.utilisateurs.filter((x) => x.actif !== false && x.role !== 'lecteur')
  const donneurs = actifs.filter((x) => x.role !== 'cofondateur' && (gestion || x.nom === u.nom))
  const receveurs = actifs.filter((x) => x.nom !== de)
  const enAttente = d.remises.filter((r) => versementEnAttente(r) && r.de === de && r.id !== existant?.id).reduce((t, r) => t + r.montant, 0)
  // En modification d'un versement déjà confirmé, son montant revient d'abord à celui qui a versé
  const rendu = existant && existant.de === de && !versementEnAttente(existant) && existant.statut !== 'refuse' ? existant.montant : 0
  const disponible = (enMain.get(de) ?? 0) + rendu - enAttente

  async function valider() {
    setErreur('')
    const m = lire(montant)
    if (!de) return setErreur("Choisissez qui verse l'argent.")
    if (!a) return setErreur("Choisissez qui reçoit l'argent.")
    if (!m || m <= 0) return setErreur('Indiquez le montant.')
    if (m > disponible) return setErreur(`${de} n'a que ${fcfa(disponible)} disponible${enAttente ? ` (${fcfa(enAttente)} déjà en attente de confirmation)` : ''}.`)
    // Si qui verse, qui reçoit ou le montant change, le destinataire doit confirmer à nouveau
    const change = existant && (existant.de !== de || existant.a !== a || existant.montant !== m)
    const r: Remise = existant
      ? { ...existant, date, de, a, montant: m, ...modification(u.nom), ...(change ? { statut: 'en_attente' as const, confirmeLe: undefined } : {}) }
      : { id: nouvelId(), date, de, a, montant: m, auteur: u.nom, creeLe: new Date().toISOString(), statut: 'en_attente' }
    await enregistrer('remises', r)
    setFini(true)
    setTimeout(onFini, 900)
  }

  return (
    <div className="pile formulaire">
      <h1>{existant ? 'Modifier le versement' : 'Versement'}</h1>
      {existant && <p className="info">Si vous changez qui verse, qui reçoit ou le montant, le versement devra être confirmé à nouveau.</p>}
      <p className="petit">L'argent des ventes passe d'une personne à une autre, en général au chef d'exploitation. Il ne sort de la caisse que lorsque la personne qui le reçoit confirme dans l'application.</p>
      <ChampDate date={date} setDate={setDate} />
      <label>
        Qui verse l'argent
        <select value={de} onChange={(e) => setDe(e.target.value)}>
          <option value="">Choisir…</option>
          {donneurs.map((x) => <option key={x.id} value={x.nom}>{x.nom} ({fcfa(enMain.get(x.nom) ?? 0)} en main)</option>)}
        </select>
      </label>
      <label>
        Qui reçoit le versement
        <select value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">Choisir…</option>
          {receveurs.map((x) => <option key={x.id} value={x.nom}>{x.nom}</option>)}
        </select>
      </label>
      <label>
        Montant (FCFA)
        <input id="remise-montant" type="number" inputMode="numeric" placeholder={disponible ? String(disponible) : ''} value={montant} onChange={(e) => setMontant(e.target.value)} />
      </label>
      {de && <button type="button" className="lien neutre" onClick={() => setMontant(String(disponible))}>Tout verser ({fcfa(disponible)})</button>}
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="principal" onClick={valider}>{existant ? 'Enregistrer la modification' : 'Enregistrer le versement'}</button>
    </div>
  )
}

export function Reglement({ venteId, onFini }: { venteId: string; onFini: () => void }) {
  const d = useDonnees()
  const u = useUtilisateur()
  const [montant, setMontant] = useState('')
  const [erreur, setErreur] = useState('')
  const [fini, setFini] = useState(false)
  if (!d) return null
  if (fini) return <Confirmation texte="Paiement enregistré" />
  const v = d.ventes.find((x) => x.id === venteId)
  if (!v) return <p>Vente introuvable.</p>
  const reste = resteDu(v)

  async function valider() {
    const m = lire(montant)
    if (!m || m <= 0 || m > reste) return setErreur(`Le montant doit être entre 1 et ${fcfa(reste)}.`)
    await ajouterReglement(v!, m, u.nom)
    setFini(true)
    setTimeout(onFini, 900)
  }

  return (
    <div className="pile formulaire">
      <h1>Encaisser une dette</h1>
      <p className="sous-titre">{v.client ?? 'Client sans nom'} · vente du {v.date} · {v.qte} poulets pour {fcfa(totalVente(v))}</p>
      <p className="info">Reste dû : <strong>{fcfa(reste)}</strong></p>
      <label>
        Montant reçu (FCFA)
        <input id="reglement-montant" type="number" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} />
      </label>
      <button type="button" className="lien neutre" onClick={() => setMontant(String(reste))}>Tout le reste ({fcfa(reste)})</button>
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="principal" onClick={valider}>Enregistrer le paiement</button>
    </div>
  )
}

