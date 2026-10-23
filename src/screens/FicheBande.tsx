import { useState } from 'react'
import { CATEGORIES, apresCloture, cloturerBande, dirigeLesBandes, enregistrer, peutGerer, peutSaisir, supprimer, supprimerBande, voitLesBilans, type Categorie } from '../db'
import { MOIS } from './NouvelleBande'
import type { Bilan } from '../argent'
import { alimentPrevuKg, aujourdhui, journees, dateCourte, dateLongue, fcfa, nombre, pourcent, type Jour } from '../calc'
import { useBande } from '../hooks'
import { useUtilisateur } from '../session'
import { ResumeSaisie, historiqueModifications } from './SaisieJour'
import type { Naviguer } from '../App'
import ChoixDate from '../ChoixDate'

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

export default function FicheBande({ bandeId, naviguer }: { bandeId: string; naviguer: Naviguer }) {
  const data = useBande(bandeId)
  const u = useUtilisateur()
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [demande, setDemande] = useState<{ message: string; action: () => Promise<void>; titre?: string; bouton?: string } | null>(null)
  const [nouvelleDate, setNouvelleDate] = useState<string | null>(null)
  const [erreurDate, setErreurDate] = useState('')
  const [dateFin, setDateFin] = useState<string | null>(null)
  if (!data) return null
  const { bande, jours, resume: r } = data
  const gestion = peutGerer(u)
  const saisit = peutSaisir(u)

  async function cloturer() {
    if (!dateFin) return
    const saisies = jours.flatMap((j) => j.saisies)
    const manquants = journees({ ...bande, dateCloture: dateFin }, saisies, data!.ventes, dateFin).filter((j) => j.manquant).map((j) => j.date)
    if (manquants.length) {
      setDemande({
        message: `Impossible de clôturer au ${dateCourte(dateFin)} : ${pluriel(manquants.length, 'jour')} sans saisie avant cette date. Rattrapez-les d'abord.`,
        action: async () => naviguer({ nom: 'saisie', bandeId, date: manquants[0] }),
      })
      return
    }
    const apres = await apresCloture(bandeId, dateFin)
    const n = apres.saisies.length + apres.ventes.length + apres.depenses.length
    const fin = dateFin
    setDemande({
      titre: bande.statut === 'cloturee' ? 'Changer la date de clôture ?' : 'Clôturer la bande ?',
      bouton: n ? 'Oui, clôturer et supprimer' : 'Oui, clôturer',
      message: `${bande.nom} sera clôturée le ${dateLongue(fin)}.` + (n
        ? ` Les données après cette date seront supprimées : ${pluriel(apres.saisies.length, 'saisie')}, ${pluriel(apres.ventes.length, 'vente')} et ${pluriel(apres.depenses.length, 'dépense')}. Cette action est irréversible.`
        : ' Elle disparaîtra de l\'accueil.'),
      action: async () => {
        await cloturerBande(bande, fin)
        setDateFin(null)
        naviguer({ nom: 'accueil' })
      },
    })
  }
  function supprimerLaBande() {
    const n = jours.reduce((t, j) => t + j.saisies.length, 0)
    setDemande({
      titre: 'Supprimer la bande ?',
      bouton: 'Oui, supprimer',
      message: `Voulez-vous vraiment supprimer définitivement ${bande.nom} ? Ses ${pluriel(n, 'saisie')}, ${pluriel(data!.ventes.length, 'vente')} et ${pluriel(data!.depenses.length, 'dépense')} seront aussi supprimées. Cette action est irréversible.`,
      action: async () => {
        await supprimerBande(bande.id)
        naviguer({ nom: 'accueil' })
      },
    })
  }

  async function changerDate() {
    setErreurDate('')
    const premiere = jours.find((j) => j.saisies.length)?.date
    if (!nouvelleDate || nouvelleDate > aujourdhui()) return setErreurDate('Choisissez une date qui n\'est pas dans le futur.')
    if (premiere && nouvelleDate > premiere) return setErreurDate(`Il y a déjà des saisies dès le ${dateCourte(premiere)} : la date doit être au plus tard ce jour-là.`)
    const auto = MOIS.some((m) => bande.nom.startsWith(`Bande ${m} `))
    const d = new Date(nouvelleDate + 'T12:00:00')
    await enregistrer('bandes', { ...bande, dateReception: nouvelleDate, nom: auto ? `Bande ${MOIS[d.getMonth()]} ${d.getFullYear()}` : bande.nom })
    setNouvelleDate(null)
  }

  const demanderSuppression = (id: string) =>
    setDemande({ message: 'Supprimer cette saisie ?', action: () => supprimer('journal', id) })

  return (
    <div className="pile">
      <div>
        <span className="etiquette">Espace {bande.espace} · {bande.statut === 'en_cours' ? 'en cours' : 'clôturée'}</span>
        <h1>{bande.nom}</h1>
        <p className="sous-titre">
          {nombre(bande.poussins)} poussins reçus le {dateLongue(bande.dateReception)}
          {bande.responsable ? ` · responsable ${bande.responsable}` : ''}
          {dirigeLesBandes(u) && nouvelleDate === null && <> · <button className="lien" onClick={() => setNouvelleDate(bande.dateReception)}>Changer la date</button></>}
        </p>
        {nouvelleDate !== null && (
          <div className="carte pile">
            <label>
              Date de création (réception des poussins)
              <ChoixDate id="bande-nouvelle-date" value={nouvelleDate} onChange={setNouvelleDate} />
            </label>
            {erreurDate && <p className="erreur">{erreurDate}</p>}
            <div className="segments">
              <button onClick={() => { setNouvelleDate(null); setErreurDate('') }}>Annuler</button>
              <button className="actif" onClick={changerDate}>Enregistrer la date</button>
            </div>
          </div>
        )}
      </div>

      <div className="chiffres grille">
        <div><strong>J{r.ageJour}</strong><span>âge</span></div>
        <div><strong>{nombre(r.vivants)}</strong><span>{bande.statut === 'cloturee' ? 'non vendus' : 'restants'}</span></div>
        <div><strong>{nombre(r.mortsTotal)}</strong><span>morts · {pourcent(r.tauxMortalite)}</span></div>
        <div><strong>{nombre(r.vendusTotal)}</strong><span>vendus</span></div>
        <div><strong>{nombre(r.alimentTotalKg)} kg</strong><span>aliment donné</span></div>
        <div>
          <strong>{r.indiceConso ? nombre(r.indiceConso, 2) : '—'}</strong>
          <span>{r.indiceConso ? 'indice de conso.' : 'indice : peser les poulets'}</span>
        </div>
      </div>

      {r.joursManquants.filter((d) => d < aujourdhui()).length > 0 && (
        <JoursManquants dates={r.joursManquants.filter((d) => d < aujourdhui())} gestion={gestion}
          onRattraper={(date) => naviguer({ nom: 'saisie', bandeId, date })} />
      )}

      {bande.statut === 'en_cours' && saisit && (
        <button className="principal" onClick={() => naviguer({ nom: 'saisie', bandeId })}>Saisir pour aujourd'hui</button>
      )}

      <GraphiqueVentes jours={jours} />

      {voitLesBilans(u) && (bande.bilanExcel ? <BilanExcel bilan={bande.bilanExcel} /> : <BilanCalcule b={data.bilan} enCours={bande.statut === 'en_cours'} />)}

      <section>
        <h3>Jour par jour</h3>
        {jours.some((j) => j.saisies.some((s) => s.source === 'excel')) && (
          <p className="petit">Pour les jours venant du fichier Excel, l'aliment est la ration prévue, pas la quantité réellement donnée.</p>
        )}
        <p className="petit">Aliment = kg à distribuer, calculés automatiquement (ration × vivants).</p>
        <p className="petit">En <span className="rouge">rouge</span> : valeurs corrigées ou saisies en rattrapage. Touchez un jour pour le détail.</p>
        <table className="tableau">
          <thead>
            <tr><th>Jour</th><th>Morts</th><th>Vivants</th><th>Aliment</th><th>g/poulet</th></tr>
          </thead>
          <tbody>
            {[...jours].reverse().map((j) => (
              <LigneJour key={j.date} j={j} ouvert={ouvert === j.date} onClic={() => setOuvert(ouvert === j.date ? null : j.date)}
                onSupprimer={gestion ? demanderSuppression : undefined}
                onModifier={gestion ? (saisieId) => naviguer({ nom: 'saisie', bandeId, saisieId }) : undefined}
                onRattraper={gestion && j.manquant ? () => naviguer({ nom: 'saisie', bandeId, date: j.date }) : undefined} />
            ))}
          </tbody>
        </table>
        {jours.length === 0 && <p>Aucune saisie pour l'instant.</p>}
      </section>

      {dirigeLesBandes(u) && dateFin === null && (
        bande.statut === 'en_cours'
          ? <button className="danger" onClick={() => setDateFin(aujourdhui())}>Clôturer la bande</button>
          : <button onClick={() => setDateFin(bande.dateCloture ?? aujourdhui())}>Changer la date de clôture</button>
      )}
      {dateFin !== null && (
        <div className="carte pile">
          <label>
            Date de clôture
            <ChoixDate id="bande-date-cloture" value={dateFin} onChange={setDateFin} min={bande.dateReception} />
          </label>
          <p className="petit">Les saisies, ventes et dépenses de la bande après cette date seront supprimées.</p>
          <div className="segments">
            <button onClick={() => setDateFin(null)}>Annuler</button>
            <button className="actif" onClick={cloturer}>Clôturer à cette date</button>
          </div>
        </div>
      )}
      {dirigeLesBandes(u) && (
        <button className="danger" onClick={supprimerLaBande}>Supprimer la bande</button>
      )}
      {demande && (
        <div className={`confirmer ${demande.bouton ? 'danger' : ''}`} role="alertdialog">
          {demande.titre && <h3>{demande.titre}</h3>}
          <p>{demande.message}</p>
          <div className="segments">
            <button onClick={() => setDemande(null)}>Annuler</button>
            <button className="actif" onClick={async () => { await demande.action(); setDemande(null) }}>{demande.bouton ?? 'Confirmer'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

interface LigneProps {
  j: Jour
  ouvert: boolean
  onClic: () => void
  onSupprimer?: (id: string) => void
  onModifier?: (id: string) => void
  onRattraper?: () => void
}

function LigneJour({ j, ouvert, onClic, onSupprimer, onModifier, onRattraper }: LigneProps) {
  const bas = j.gParSujet !== undefined && j.gParSujet < j.ration * 0.85
  if (j.manquant) {
    const auj = j.date === aujourdhui()
    return (
      <tr className={auj ? 'a-faire' : 'manquant'}>
        <td>{dateCourte(j.date)} <small>J{j.age}</small></td>
        <td colSpan={4}>
          {auj ? `Pas encore saisi aujourd'hui · prévu ${nombre(alimentPrevuKg(j.age, j.vivants), 1)} kg` : 'Non saisi'}
          {j.vendus > 0 && ` · ${j.vendus} vendus`}
          {onRattraper && !auj && <button className="lien rattraper" onClick={onRattraper}>Rattraper</button>}
        </td>
      </tr>
    )
  }
  return (
    <>
      <tr onClick={onClic} className="cliquable">
        <td>{dateCourte(j.date)} <small>J{j.age}</small></td>
        <td className={j.rouge.morts ? 'rouge' : j.morts ? 'fort' : ''}>{j.morts || '·'}</td>
        <td>{nombre(j.vivants)}{j.vendus > 0 && <small className="vendus"> −{j.vendus} vendus</small>}</td>
        <td>{nombre(alimentPrevuKg(j.age, j.vivants), 1)} kg</td>
        <td className={j.rouge.aliment ? 'rouge' : bas ? 'alerte' : ''}>{j.gParSujet ?? '·'}</td>
      </tr>
      {ouvert && (
        <tr className="detail">
          <td colSpan={5}>
            {j.poidsMoyenKg && <p className={j.rouge.poids ? 'rouge' : ''}>Poids moyen : {nombre(j.poidsMoyenKg, 2)} kg</p>}
            {j.vendus > 0 && <p>{j.vendus} poulet{j.vendus > 1 ? 's' : ''} vendu{j.vendus > 1 ? 's' : ''}</p>}
            <p>Ration prévue : {j.ration} g par poulet, soit {nombre(alimentPrevuKg(j.age, j.vivants), 1)} kg pour {nombre(j.vivants)} vivants</p>
            {j.alimentKg !== undefined && <p className={j.rouge.aliment ? 'rouge' : ''}>Aliment compté : {nombre(j.alimentKg, 1)} kg</p>}
            <ul className="liste-saisies">
              {j.saisies.map((s) => (
                <li key={s.id}>
                  <ResumeSaisie s={s} />
                  {s.source === 'excel' && <small> · fichier Excel</small>}
                  {historiqueModifications(s).map((l, i) => <small key={i} className="rouge historique">{l}</small>)}
                  {(onModifier || onSupprimer) && (
                    <span className="actions">
                      {onModifier && <button className="lien neutre" onClick={(e) => { e.stopPropagation(); onModifier(s.id) }}>Corriger</button>}
                      {onSupprimer && s.source !== 'excel' && (
                        <button className="lien" onClick={(e) => { e.stopPropagation(); onSupprimer(s.id) }}>Supprimer</button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

function JoursManquants({ dates, gestion, onRattraper }: { dates: string[]; gestion: boolean; onRattraper: (d: string) => void }) {
  return (
    <section className="manquants">
      <strong>{dates.length} jour{dates.length > 1 ? 's' : ''} sans saisie</strong>
      <p>{dates.slice(0, 6).map(dateCourte).join(', ')}{dates.length > 6 ? '…' : ''}</p>
      {gestion ? (
        <button className="secondaire" onClick={() => onRattraper(dates[0])}>Rattraper le {dateCourte(dates[0])}</button>
      ) : (
        <p className="petit">Seuls le chef d'exploitation et le responsable d'élevage peuvent rattraper un jour passé.</p>
      )}
    </section>
  )
}

/** Barres des poulets vendus par jour, du premier au dernier jour de vente, dessinées en SVG. */
function GraphiqueVentes({ jours }: { jours: Jour[] }) {
  const ventes = jours.filter((j) => j.vendus > 0)
  if (!ventes.length) {
    return (
      <section>
        <h3>Vendus par jour</h3>
        <p className="petit">Aucune vente pour l'instant.</p>
      </section>
    )
  }
  const total = ventes.reduce((t, j) => t + j.vendus, 0)
  const max = Math.max(...ventes.map((j) => j.vendus))
  const premiere = ventes[0]
  const derniere = ventes[ventes.length - 1]
  const debut = premiere.age
  const nbJours = derniere.age - debut + 1
  // Marges pour que les étiquettes des extrémités ne soient pas coupées
  const L = 320, H = 90, marge = 10, pas = (L - 2 * marge) / nbJours
  const x = (age: number) => marge + (age - debut) * pas
  const milieu = (age: number) => x(age) + pas / 2
  // Graduations intermédiaires tous les 7 jours, sans chevaucher les extrémités
  const graduations = Array.from({ length: nbJours }, (_, i) => debut + i)
    .filter((a) => a % 7 === 0 && a - debut > nbJours / 8 && derniere.age - a > nbJours / 8)
  return (
    <section>
      <h3>Vendus par jour <small className="petit">· {nombre(total)} au total</small></h3>
      <p className="petit">
        Du <strong>{dateCourte(premiere.date)} (J{premiere.age})</strong> au{' '}
        <strong>{dateCourte(derniere.date)} (J{derniere.age})</strong>, soit {nombre(nbJours)} jour{nbJours > 1 ? 's' : ''}.
        Dernière vente : {derniere.vendus} poulet{derniere.vendus > 1 ? 's' : ''}.
      </p>
      <svg viewBox={`0 0 ${L} ${H + 16}`} className="graphique" role="img" aria-label="Poulets vendus par jour">
        <line x1={0} y1={H} x2={L} y2={H} className="axe" />
        {ventes.map((j) => {
          const h = (j.vendus / max) * (H - 12)
          const estDerniere = j === derniere
          return (
            <g key={j.date}>
              <rect x={x(j.age) + 0.5} y={H - h} width={Math.max(2, pas - 1)} height={h} rx={1}
                className={estDerniere ? 'barre-ventes derniere' : 'barre-ventes'}>
                <title>{`${dateCourte(j.date)} (J${j.age}) : ${j.vendus} vendus`}</title>
              </rect>
              {(j.vendus === max || estDerniere) && (
                <text x={milieu(j.age)} y={H - h - 3} textAnchor="middle" className={estDerniere ? 'derniere' : ''}>{j.vendus}</text>
              )}
            </g>
          )
        })}
        <text x={milieu(premiere.age)} y={H + 13} textAnchor="middle" className="graduation">J{premiere.age}</text>
        {graduations.map((a) => (
          <text key={a} x={milieu(a)} y={H + 13} textAnchor="middle" className="graduation">J{a}</text>
        ))}
        {derniere !== premiere && (
          <text x={milieu(derniere.age)} y={H + 13} textAnchor="middle" className="derniere">J{derniere.age}</text>
        )}
      </svg>
    </section>
  )
}

function BilanCalcule({ b, enCours }: { b: Bilan; enCours: boolean }) {
  const lignes: [string, string, string?][] = [
    ['Poussins reçus', nombre(b.poussins)],
    ['Morts avant la vente', nombre(b.mortsAvantVente)],
    ['Morts pendant la vente', nombre(b.pertesPendantVente)],
    ['Taux de perte', pourcent(b.tauxPerte)],
    ['Poulets vendus', nombre(b.vendus)],
    ['Poulets restants', nombre(b.restants)],
  ]
  return (
    <section className="carte">
      <h3>{enCours ? 'Bilan provisoire' : 'Bilan'}</h3>
      <dl className="bilan">
        <div className="bilan-depenses"><dt>Dépenses totales</dt><dd>{fcfa(b.totalDepenses)}</dd></div>
        {([1, 2, 3, 4, 5] as Categorie[]).filter((c) => b.depensesParCategorie[c]).map((c) => (
          <div key={c} className="categorie"><dt>{CATEGORIES[c]}</dt><dd>{fcfa(b.depensesParCategorie[c])}</dd></div>
        ))}
        <div className="bilan-ventes"><dt>Ventes totales</dt><dd>{fcfa(b.totalVentes)}</dd></div>
        {b.dettesClients > 0 && <div><dt>dont dettes clients</dt><dd className="rouge">{fcfa(b.dettesClients)}</dd></div>}
        <div className="fort bilan-resultat"><dt>Résultat net</dt><dd>{fcfa(b.resultatNet)}</dd></div>
        {b.coutParPoulet !== undefined && <div><dt>Coût production / poulet</dt><dd>{fcfa(Math.round(b.coutParPoulet))}</dd></div>}
        {b.prixMoyen !== undefined && <div><dt>Prix de vente moyen</dt><dd>{fcfa(Math.round(b.prixMoyen))}</dd></div>}
        {lignes.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
      </dl>
    </section>
  )
}

const LIBELLES_BILAN: [string, string, 'fcfa' | 'nb' | 'pct'][] = [
  ['MONTANT TOTAL DES DEPENSES', 'Dépenses totales', 'fcfa'],
  ['PRIX TOTAL DES VENTES', 'Ventes totales', 'fcfa'],
  ['RESULTAT NET', 'Résultat net', 'fcfa'],
  ['Prix de production / poulet', 'Coût production / poulet', 'fcfa'],
  ['Prix moyen du poulet', 'Prix de vente moyen', 'fcfa'],
  ['Nombre de poulets vendus', 'Poulets vendus', 'nb'],
  ['Taux de perte', 'Taux de perte', 'pct'],
]

const COULEUR_BILAN: Record<string, string> = {
  'MONTANT TOTAL DES DEPENSES': 'bilan-depenses',
  'PRIX TOTAL DES VENTES': 'bilan-ventes',
  'RESULTAT NET': 'fort bilan-resultat',
}

function BilanExcel({ bilan }: { bilan: Record<string, number> }) {
  return (
    <section className="carte">
      <h3>Bilan (repris du fichier Excel)</h3>
      <dl className="bilan">
        {LIBELLES_BILAN.filter(([cle]) => bilan[cle] !== undefined).map(([cle, lib, fmt]) => (
          <div key={cle} className={COULEUR_BILAN[cle] ?? ''}>
            <dt>{lib}</dt>
            <dd>{fmt === 'fcfa' ? fcfa(Math.round(bilan[cle])) : fmt === 'pct' ? pourcent(bilan[cle]) : nombre(bilan[cle])}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
