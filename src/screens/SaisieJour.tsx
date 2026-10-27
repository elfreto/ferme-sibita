import { useEffect, useState } from 'react'
import { ClipboardPen } from 'lucide-react'
import TitrePage from '../TitrePage'
import { useLiveQuery } from 'dexie-react-hooks'
import { CHAMPS_SAISIE, champsEnRouge, db, enregistrer, nouvelId, peutGerer, peutSaisir, type Saisie } from '../db'
import { age, alimentPrevuKg, aujourdhui, dateCourte, dateLongue, gramme, nombre, rationPrevue } from '../calc'
import { useBande } from '../hooks'
import { useUtilisateur } from '../session'
import ChoixDate from '../ChoixDate'

const TRAITEMENTS = ['Vaccin', 'Vitamines', 'Antibiotique', 'Anticoccidien', 'Antitoxine', 'Désinfection']

function lireNombre(s: string): number | undefined {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

interface Props { bandeId: string; dateInitiale?: string; saisieId?: string; onFini: () => void }

export default function SaisieJour({ bandeId, dateInitiale, saisieId, onFini }: Props) {
  const data = useBande(bandeId)
  const u = useUtilisateur()
  const gestion = peutGerer(u)
  // Seuls le chef d'exploitation et le responsable d'élevage peuvent choisir un autre jour que celui d'aujourd'hui
  const [date, setDate] = useState(gestion && dateInitiale ? dateInitiale : aujourdhui())
  const [original, setOriginal] = useState<Saisie | null>(null)
  const [morts, setMorts] = useState(0)
  const [peser, setPeser] = useState(false)
  const [poids, setPoids] = useState('')
  const [nbPeses, setNbPeses] = useState('10')
  const [traitement, setTraitement] = useState('')
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState('')
  const [enregistre, setEnregistre] = useState(false)

  // Correction d'une saisie existante (chef d'exploitation ou responsable d'élevage) : on part des valeurs enregistrées
  useEffect(() => {
    if (!saisieId || !gestion) return
    db.journal.get(saisieId).then((s) => {
      if (!s) return
      setOriginal(s)
      setDate(s.date)
      setMorts(s.morts ?? 0)
      setPeser(!!s.poidsMoyenKg)
      setPoids(s.poidsMoyenKg !== undefined ? String(s.poidsMoyenKg).replace('.', ',') : '')
      setNbPeses(String(s.nbPeses ?? 10))
      setTraitement(s.traitement ?? '')
      setNote(s.note ?? '')
    })
  }, [saisieId, gestion])

  if (!data) return null
  if (!peutSaisir(u)) return <p>Votre accès est en lecture seule : vous ne pouvez pas saisir.</p>
  const { bande, jours } = data
  const ageJour = age(bande.dateReception, date)
  // Vivants ce jour-là : effectif de la veille moins les morts déjà saisis ce jour et ceux saisis ici
  const veille = [...jours].reverse().find((j) => j.date < date)
  const duJour = jours.find((j) => j.date === date)
  const vivantsAvant = (veille ? veille.vivants : bande.poussins) - (duJour?.morts ?? 0) + (original?.morts ?? 0)
  const vivants = vivantsAvant - morts
  const ration = rationPrevue(ageJour)
  // L'aliment n'est plus saisi : il est calculé (ration × vivants) et compté une seule fois par jour
  const kgDejaDonne = (duJour?.alimentKg ?? 0) - (original?.alimentKg ?? 0)
  const aDistribuer = alimentPrevuKg(ageJour, vivants)
  const kgN = kgDejaDonne > 0 || vivants <= 0 ? undefined : aDistribuer

  async function valider() {
    setErreur('')
    const poidsN = peser ? lireNombre(poids) : undefined
    if (morts > vivantsAvant) return setErreur(`Il ne reste que ${vivantsAvant} poulets vivants.`)
    if (peser && (!poidsN || poidsN <= 0 || poidsN > 6)) return setErreur('Le poids moyen doit être entre 0 et 6 kg.')
    if (date > aujourdhui()) return setErreur('La date ne peut pas être dans le futur.')
    if (date < bande.dateReception) return setErreur('La date est avant la réception des poussins.')
    const maintenant = new Date()
    const valeurs = {
      // 0 mort est une information : le jour est bien suivi
      morts,
      alimentKg: kgN,
      poidsMoyenKg: poidsN,
      nbPeses: poidsN ? lireNombre(nbPeses) : undefined,
      traitement: traitement.trim() || undefined,
      note: note.trim() || undefined,
    }
    if (original) {
      const avant: Partial<Saisie> = {}
      for (const c of CHAMPS_SAISIE) if (original[c] !== valeurs[c]) (avant as Record<string, unknown>)[c] = original[c] ?? null
      if (Object.keys(avant).length === 0) return onFini()
      await enregistrer('journal', {
        ...original,
        ...valeurs,
        modifications: [...(original.modifications ?? []), { le: maintenant.toISOString(), par: u.nom, avant }],
      })
      setEnregistre(true)
      setTimeout(onFini, 900)
      return
    }
    const s: Saisie = {
      id: nouvelId(),
      bandeId,
      date,
      heure: maintenant.toTimeString().slice(0, 5),
      ...valeurs,
      auteur: u.nom,
      creeLe: maintenant.toISOString(),
      source: 'terrain',
    }
    await enregistrer('journal', s)
    setEnregistre(true)
    setTimeout(onFini, 900)
  }

  if (enregistre) {
    return (
      <div className="confirmation">
        <div className="coche">✓</div>
        <p>{original ? 'Correction enregistrée' : 'Saisie enregistrée'}</p>
      </div>
    )
  }

  return (
    <div className="pile formulaire">
      <TitrePage icone={<ClipboardPen size={20} />} titre={bande.nom} sousTitre={`Espace ${bande.espace} · J${ageJour} · ${nombre(vivantsAvant)} vivants`} />

      {original && <p className="info alerte">Correction d'une saisie de {original.auteur ?? 'inconnu'}. Les valeurs changées apparaîtront en rouge.</p>}
      {gestion && !original ? (
        <label>
          Jour concerné
          <ChoixDate value={date} max={bande.dateCloture ?? aujourdhui()} min={bande.dateReception} onChange={setDate} />
        </label>
      ) : (
        <p className="sous-titre"><strong>{dateLongue(date)}</strong></p>
      )}
      {date < aujourdhui() && !original && (
        <p className="info alerte">Rattrapage du {dateLongue(date)} : cette saisie sera marquée en rouge.</p>
      )}

      <fieldset>
        <legend>Morts trouvés</legend>
        <div className="compteur">
          <button type="button" onClick={() => setMorts(Math.max(0, morts - 1))} aria-label="Un de moins">−</button>
          <input type="number" inputMode="numeric" min={0} value={morts}
            onChange={(e) => setMorts(Math.max(0, parseInt(e.target.value) || 0))} />
          <button type="button" onClick={() => setMorts(morts + 1)} aria-label="Un de plus">+</button>
        </div>
      </fieldset>

      <div className="champ-calcule">
        <span>Aliment à distribuer</span>
        <strong id="aliment-a-distribuer">{nombre(aDistribuer, 1)} kg</strong>
        <small className="petit">
          Calculé automatiquement : {ration} g × {nombre(vivants)} vivants (J{ageJour}).
          {kgDejaDonne > 0 && ` Déjà compté aujourd'hui (${nombre(kgDejaDonne, 1)} kg).`}
        </small>
      </div>

      <label className="case">
        <input type="checkbox" checked={peser} onChange={(e) => setPeser(e.target.checked)} />
        J'ai pesé des poulets
      </label>
      {peser && (
        <div className="deux">
          <label>
            Poids moyen (kg)
            <input type="text" inputMode="decimal" placeholder="ex. 1,45" value={poids} onChange={(e) => setPoids(e.target.value)} />
          </label>
          <label>
            Poulets pesés
            <input type="number" inputMode="numeric" value={nbPeses} onChange={(e) => setNbPeses(e.target.value)} />
          </label>
        </div>
      )}

      <label>
        Traitement donné
        <input type="text" list="traitements" placeholder="ex. Vaccin Gumboro" value={traitement} onChange={(e) => setTraitement(e.target.value)} />
        <datalist id="traitements">
          {TRAITEMENTS.map((t) => <option key={t} value={t} />)}
        </datalist>
      </label>

      <label>
        Note
        <textarea rows={2} placeholder="Observation, problème…" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {erreur && <p className="erreur">{erreur}</p>}
      <button className="principal" onClick={valider}>{original ? 'Enregistrer la correction' : 'Enregistrer'}</button>

      {!original && duJour && duJour.saisies.length > 0 && (
        <section>
          <h3>Déjà saisi le {dateCourte(date)}</h3>
          <ul className="liste-saisies">
            {duJour.saisies.map((s) => (
              <li key={s.id}><ResumeSaisie s={s} /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function ResumeSaisie({ s }: { s: Saisie }) {
  const rouges = champsEnRouge(s)
  const parts: [string, boolean][] = []
  if (s.morts !== undefined) parts.push([`${s.morts} mort${s.morts > 1 ? 's' : ''}`, rouges.has('morts')])
  if (s.alimentKg) parts.push([`${nombre(s.alimentKg, 1)} kg d'aliment`, rouges.has('alimentKg')])
  if (s.poidsMoyenKg) parts.push([`pesée ${nombre(s.poidsMoyenKg, 2)} kg`, rouges.has('poidsMoyenKg')])
  if (s.traitement) parts.push([s.traitement, rouges.has('traitement')])
  if (s.note) parts.push([`« ${s.note} »`, rouges.has('note')])
  const qui = [s.heure, s.auteur].filter(Boolean).join(', ')
  return (
    <>
      {parts.length === 0 && 'rien'}
      {parts.map(([texte, rouge], i) => (
        <span key={i}>{i > 0 && ' · '}<span className={rouge ? 'rouge' : ''}>{texte}</span></span>
      ))}
      {qui && <small> ({qui})</small>}
    </>
  )
}

/** Explique en clair ce qui a été changé : « morts : 2 → 3 (Justin, 22 oct.) » */
export function historiqueModifications(s: Saisie): string[] {
  const libelles: Record<string, string> = { morts: 'morts', alimentKg: 'aliment (kg)', poidsMoyenKg: 'poids (kg)', nbPeses: 'poulets pesés', traitement: 'traitement', note: 'note' }
  const lignes: string[] = []
  let courant: Partial<Saisie> = { ...s }
  // On remonte les corrections de la plus récente à la plus ancienne pour retrouver chaque valeur
  for (const m of [...(s.modifications ?? [])].reverse()) {
    const quand = new Date(m.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    for (const [c, v] of Object.entries(m.avant)) {
      const apres = (courant as Record<string, unknown>)[c]
      lignes.unshift(`${libelles[c] ?? c} : ${v ?? 'vide'} → ${apres ?? 'vide'} (${m.par}, ${quand})`)
    }
    courant = { ...courant, ...m.avant }
  }
  if (horsDelaiTexte(s)) lignes.unshift(horsDelaiTexte(s)!)
  return lignes
}

function horsDelaiTexte(s: Saisie): string | undefined {
  if (!s.creeLe || s.source === 'excel' || s.creeLe.slice(0, 10) <= s.date) return undefined
  return `Saisi en rattrapage le ${new Date(s.creeLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} par ${s.auteur ?? 'inconnu'}`
}
