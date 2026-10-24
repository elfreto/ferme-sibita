import { useEffect, useState } from 'react'
import { MESSAGE_VERROU, enregistrer, estVerrouillee, nouvelId, payeeAvecVentes, peutGerer, peutSaisir, supprimer, type Categorie, type Mouvement, type TypeArticle } from '../db'
import { aujourdhui, consommations, dateCourte, fcfa, nombre } from '../calc'
import { useDonnees } from '../hooks'
import { argentEnMain } from '../argent'
import { estStockBas, etatStocks, MAIS, seuilAlerte, PROVENDE_MAISON, PROVENDE_SPC, SACS_MAISON_PAR_SAC_MAIS } from '../stock'
import { useUtilisateur } from '../session'
import type { Naviguer } from '../App'
import ChoixDate from '../ChoixDate'

const TYPES: Record<TypeArticle, string> = { aliment: 'Aliment', medicament: 'Médicament / vaccin', autre: 'Matière première' }

const FIXES = [PROVENDE_SPC, PROVENDE_MAISON, MAIS]

const EXPLICATION: Record<string, string> = {
  [PROVENDE_SPC]: "Utilisée en premier pour l'aliment du jour.",
  [PROVENDE_MAISON]: `Utilisée quand la Provende SPC est terminée. Chaque entrée retire 1 sac de maïs pour ${SACS_MAISON_PAR_SAC_MAIS} sacs entrés.`,
  [MAIS]: `Retiré automatiquement : 1 sac pour ${SACS_MAISON_PAR_SAC_MAIS} sacs de Provende maison entrés.`,
}

export default function Stock({ naviguer }: { naviguer: Naviguer }) {
  const d = useDonnees()
  const u = useUtilisateur()
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [aSupprimer, setASupprimer] = useState<Mouvement | null>(null)
  if (!d) return null
  const stocks = etatStocks(d.articles, d.mouvements, consommations(d.bandes, d.saisies, d.ventes))
  const gestion = peutGerer(u)
  return (
    <div className="pile">
      <h1>Stock</h1>
      <p className="petit">L'aliment donné chaque jour (en kg) est retiré automatiquement, converti en sacs : d'abord de la Provende SPC, puis de la Provende maison quand la SPC est terminée.</p>
      <ul className="liste-stock">
        {d.articles.map((a) => {
          const q = stocks.get(a.id) ?? 0
          const bas = estStockBas(a, q, d.mouvements)
          const seuil = seuilAlerte(a)
          const mvts = d.mouvements.filter((m) => m.articleId === a.id).sort((x, y) => `${y.date}${y.creeLe}`.localeCompare(`${x.date}${x.creeLe}`))
          return (
            <li key={a.id} className={`carte ${bas ? 'stock-bas' : ''}`}>
              <div className="stock-tete" onClick={() => setOuvert(ouvert === a.id ? null : a.id)}>
                <span>
                  <strong>{a.nom}</strong>
                  <small>{TYPES[a.type]}{a.poidsSacKg ? ` · sac de ${a.poidsSacKg} kg` : ''} · {seuil === undefined ? "pas d'alerte" : `alerte sous ${seuil} ${a.unite}s`}</small>
                </span>
                <span className="quantite">
                  <strong>{nombre(q, Number.isInteger(q) ? 0 : 1)}</strong>
                  <small>{a.unite}{Math.abs(q) > 1 ? 's' : ''}</small>
                </span>
              </div>
              {EXPLICATION[a.id] && <p className="petit">{EXPLICATION[a.id]}</p>}
              {!mvts.length && <p className="petit">Pas encore de stock enregistré : faites un inventaire ou une entrée.</p>}
              {bas && mvts.length > 0 && <p className="alerte-stock">Stock bas : prévoir un achat.</p>}
              {peutSaisir(u) && (
                <div className="boutons-trois">
                  {gestion && <button className="secondaire" onClick={() => naviguer({ nom: 'mouvement', articleId: a.id, sens: 'entree' })}>Entrée</button>}
                  {!FIXES.includes(a.id) && <button className="secondaire" onClick={() => naviguer({ nom: 'mouvement', articleId: a.id, sens: 'sortie' })}>Sortie</button>}
                  {gestion && <button className="secondaire" onClick={() => naviguer({ nom: 'mouvement', articleId: a.id, sens: 'inventaire' })}>Inventaire</button>}
                </div>
              )}
              {ouvert === a.id && (
                <ul className="liste-operations">
                  {mvts.slice(0, 20).map((m) => (
                    <li key={m.id}>
                      <span>
                        {m.sens === 'entree' ? 'Entrée' : m.sens === 'sortie' ? 'Sortie' : 'Inventaire'} {nombre(m.quantite, 1)} {a.unite}s
                        {m.prixTotal ? ` · ${fcfa(m.prixTotal)}` : ''}
                        <small>{dateCourte(m.date)} · {m.auteur}{m.note ? ` · ${m.note}` : ''}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <section>
        <h3>Toutes les saisies de stock</h3>
        {d.mouvements.length === 0 ? <p className="petit">Aucune saisie de stock pour l'instant.</p> : (
          <div className="defile">
            <table className="tableau tableau-stock">
              <thead>
                <tr><th>Date</th><th>Article</th><th>Opération</th><th>Qté</th>{gestion && <th></th>}</tr>
              </thead>
              <tbody>
                {[...d.mouvements].sort((x, y) => `${y.date}${y.creeLe}`.localeCompare(`${x.date}${x.creeLe}`)).map((m) => {
                  const a = d.articles.find((x) => x.id === m.articleId)
                  return (
                    <tr key={m.id}>
                      <td className={m.modifieLe ? 'rouge' : ''}>{dateCourte(m.date)}<small className={m.modifieLe ? 'rouge' : ''}>{m.modifieLe ? `modifié ${dateCourte(m.modifieLe.slice(0, 10))}` : `saisi ${dateCourte(m.creeLe.slice(0, 10))}`}</small></td>
                      <td>{a?.nom ?? '?'}<small>{m.auteur}</small></td>
                      <td>{SENS[m.sens]}{m.prixTotal ? <small>{fcfa(m.prixTotal)}</small> : null}</td>
                      <td className={m.modifieLe ? 'rouge' : ''}>{nombre(m.quantite, Number.isInteger(m.quantite) ? 0 : 1)}</td>
                      {gestion && estVerrouillee(d.bandes, m.bandeId) && <td><small className="verrou">bande clôturée</small></td>}
                      {gestion && !estVerrouillee(d.bandes, m.bandeId) && (
                        <td>
                          <div className="actions-stock">
                          <button className="lien neutre" onClick={() => naviguer({ nom: 'mouvement', articleId: m.articleId, sens: m.sens, mouvementId: m.id })}>Modifier</button>
                          <button className="lien danger-lien" onClick={() => setASupprimer(m)}>Supprimer</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {aSupprimer && (
        <div className="confirmer danger" role="alertdialog">
          <h3>Supprimer cette saisie ?</h3>
          <p>
            {SENS[aSupprimer.sens]} de {nombre(aSupprimer.quantite, Number.isInteger(aSupprimer.quantite) ? 0 : 1)} sacs de {d.articles.find((x) => x.id === aSupprimer.articleId)?.nom} du {dateCourte(aSupprimer.date).replace(/\.$/, '')}.
            {aSupprimer.depenseId ? ' La dépense liée sera aussi supprimée.' : ''} Le stock sera recalculé.
          </p>
          <div className="segments">
            <button onClick={() => setASupprimer(null)}>Annuler</button>
            <button className="actif" onClick={async () => {
              if (aSupprimer.depenseId) await supprimer('depenses', aSupprimer.depenseId)
              await supprimer('mouvements', aSupprimer.id)
              setASupprimer(null)
            }}>Oui, supprimer</button>
          </div>
        </div>
      )}
    </div>
  )
}

const SENS: Record<Mouvement['sens'], string> = { entree: 'Entrée', sortie: 'Sortie', inventaire: 'Inventaire' }

const lire = (s: string) => {
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function MouvementStock({ articleId, sens, mouvementId, onFini }: { articleId: string; sens: Mouvement['sens']; mouvementId?: string; onFini: () => void }) {
  const d = useDonnees()
  const u = useUtilisateur()
  const [date, setDate] = useState(aujourdhui())
  const [quantite, setQuantite] = useState('')
  const [prix, setPrix] = useState('')
  const [bandeId, setBandeId] = useState('')
  const [note, setNote] = useState('')
  const [avecVentes, setAvecVentes] = useState(false)
  const [erreur, setErreur] = useState('')
  const existant = mouvementId ? d?.mouvements.find((m) => m.id === mouvementId) : undefined
  useEffect(() => {
    if (!existant) return
    setDate(existant.date)
    setQuantite(String(existant.quantite).replace('.', ','))
    setPrix(existant.prixTotal ? String(existant.prixTotal) : '')
    setBandeId(existant.bandeId ?? '')
    setNote(existant.note ?? '')
    const dep = existant.depenseId ? d?.depenses.find((x) => x.id === existant.depenseId) : undefined
    setAvecVentes(!!dep && payeeAvecVentes(dep))
  }, [existant?.id])
  if (!d) return null
  const a = d.articles.find((x) => x.id === articleId)
  if (!a) return <p>Article introuvable.</p>
  if (existant && estVerrouillee(d.bandes, existant.bandeId)) return <p className="info">{MESSAGE_VERROU}</p>
  const actuel = etatStocks(d.articles, d.mouvements, consommations(d.bandes, d.saisies, d.ventes)).get(a.id) ?? 0
  const fabrication = sens === 'entree' && a.id === PROVENDE_MAISON
  const caseVentes = sens === 'entree' && (a.id === PROVENDE_SPC || a.id === MAIS)
  // Seules les bandes en cours reçoivent des entrées : une bande clôturée est figée
  const bandesChoix = d.bandes.filter((b) => b.statut === 'en_cours')
  const titre = (existant ? 'Modifier : ' : '') + (fabrication ? 'Entrée de provende maison' : sens === 'entree' ? 'Entrée en stock (achat)' : sens === 'sortie' ? 'Sortie du stock' : 'Inventaire')

  async function valider() {
    setErreur('')
    const q = lire(quantite)
    if (q === undefined || q < 0 || (sens !== 'inventaire' && q === 0)) return setErreur('Indiquez la quantité.')
    const dispo = actuel + (existant?.sens === 'sortie' ? existant.quantite : 0)
    if (sens === 'sortie' && q > dispo) return setErreur(`Il n'y a que ${dispo} ${a!.unite}s en stock.`)
    const p = fabrication ? undefined : lire(prix)
    // Achat de Provende SPC ou de maïs payé avec l'argent des ventes : retiré de l'argent en main de celui qui saisit
    const ancienneDep = existant?.depenseId ? d!.depenses.find((x) => x.id === existant.depenseId) : undefined
    const payeur = ancienneDep?.auteur ?? u.nom
    const enMain = (argentEnMain(d!.utilisateurs, d!.ventes, d!.depenses, d!.remises).get(payeur) ?? 0) + (ancienneDep && payeeAvecVentes(ancienneDep) ? ancienneDep.montant : 0)
    if (caseVentes && avecVentes && p && p > enMain) return setErreur(`${payeur} n'a que ${fcfa(enMain)} d'argent des ventes en main.`)
    const maintenant = new Date().toISOString()
    const m: Mouvement = existant
      ? { ...existant, date, quantite: q, bandeId: bandeId || undefined, prixTotal: sens === 'entree' ? p : undefined,
          note: note.trim() || undefined, modifieLe: maintenant, modifiePar: u.nom }
      : { id: nouvelId(), articleId: a!.id, date, sens, quantite: q, bandeId: bandeId || undefined,
          prixTotal: sens === 'entree' ? p : undefined, note: note.trim() || undefined, auteur: u.nom, creeLe: maintenant }
    // Un achat avec prix devient aussi une dépense de la bande (mise à jour ou retirée si le prix change)
    if (sens === 'entree' && p) {
      const categorie: Categorie = a!.type === 'aliment' || a!.id === MAIS ? 3 : 2
      const ancienne = m.depenseId ? d!.depenses.find((x) => x.id === m.depenseId) : undefined
      m.depenseId = ancienne?.id ?? nouvelId()
      await enregistrer('depenses', {
        ...ancienne, id: m.depenseId, date, bandeId: bandeId || undefined, categorie, designation: `${a!.nom} : ${q} ${a!.unite}s`,
        montant: p, auteur: ancienne?.auteur ?? u.nom, creeLe: ancienne?.creeLe ?? maintenant, origine: 'stock' as const,
        payeAvecVentes: caseVentes && avecVentes,
      })
    } else if (m.depenseId) {
      await supprimer('depenses', m.depenseId)
      m.depenseId = undefined
    }
    await enregistrer('mouvements', m)
    onFini()
  }

  return (
    <div className="pile formulaire">
      <h1>{titre}</h1>
      <p className="sous-titre">{a.nom} · {nombre(actuel, 1)} {a.unite}s en stock d'après l'application</p>
      {fabrication && <p className="info">Sacs de provende fabriqués à la ferme. 1 sac de maïs est retiré pour {SACS_MAISON_PAR_SAC_MAIS} sacs entrés. Les ingrédients sont déjà comptés dans les dépenses, il n'y a donc pas de prix à saisir.</p>}
      {sens === 'inventaire' && <p className="info">Comptez ce qu'il y a vraiment dans le magasin. Le stock repartira de ce nombre.</p>}
      <label>
        Date
        <ChoixDate value={date} onChange={setDate} />
      </label>
      <label>
        {sens === 'inventaire' ? `Nombre de ${a.unite}s comptés` : `Nombre de ${a.unite}s`}
        <input id="mvt-quantite" type="text" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
      </label>
      {sens === 'entree' && !fabrication && (
        <label>
          Prix total payé (FCFA)
          <input id="mvt-prix" type="number" inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value)} />
          <small className="petit">Avec un prix, l'achat est aussi ajouté aux dépenses de la bande choisie.</small>
        </label>
      )}
      {caseVentes && (
        <label className="case">
          <input id="mvt-avec-ventes" type="checkbox" checked={avecVentes} onChange={(e) => setAvecVentes(e.target.checked)} />
          Payé avec l'argent des ventes
        </label>
      )}
      {sens !== 'inventaire' && (
        <label>
          Bande
          <select value={bandeId} onChange={(e) => setBandeId(e.target.value)}>
            <option value="">Aucune en particulier</option>
            {bandesChoix.map((b) => <option key={b.id} value={b.id}>{b.nom} (espace {b.espace})</option>)}
          </select>
        </label>
      )}
      <label>
        Note
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {erreur && <p className="erreur">{erreur}</p>}
      <button className="principal" onClick={valider}>Enregistrer</button>
    </div>
  )
}
