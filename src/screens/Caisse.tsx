import { useState } from 'react'
import { ArrowRightLeft, Calculator, Receipt, ShoppingCart } from 'lucide-react'
import TitrePage from '../TitrePage'
import { LIBELLE_ROLE, CATEGORIES, enregistrer, estVerrouillee, payeeAvecVentes, peutGerer, peutSaisir, supprimer, versementEnAttente, voitLesBilans, type Remise, type Vente } from '../db'
import { argentEnMain, resteDu, totalVente } from '../argent'
import { aujourdhui, dateCourte, fcfa, nombre } from '../calc'
import { useDonnees } from '../hooks'
import { useUtilisateur } from '../session'
import type { Naviguer } from '../App'

type Ligne = { cle: string; date: string; creeLe?: string; texte: string; montant: number; qui?: string; table: 'ventes' | 'depenses' | 'remises'; id: string; modifie?: string; stock?: boolean; bandeId?: string }

export default function Caisse({ naviguer }: { naviguer: Naviguer }) {
  const d = useDonnees()
  const u = useUtilisateur()
  const [demande, setDemande] = useState<{ message: string; action: () => Promise<void> } | null>(null)
  // '' = toutes les opérations, 'generale' = dépenses sans bande, sinon l'id d'une bande
  const [filtre, setFiltre] = useState('')
  if (!d) return null
  const gestion = peutGerer(u)
  const enMain = argentEnMain(d.utilisateurs, d.ventes, d.depenses, d.remises)
  const nomBande = (id?: string) => d.bandes.find((b) => b.id === id)?.nom ?? 'Dépense générale'
  const dettes = d.ventes.filter((v) => resteDu(v) > 0).sort((a, b) => a.date.localeCompare(b.date))
  const totalDettes = dettes.reduce((t, v) => t + resteDu(v), 0)

  // Toutes les opérations d'argent, y compris l'historique Excel
  const lignes: Ligne[] = [
    ...d.ventes.map((v) => ({ bandeId: v.bandeId as string | undefined,
      cle: 'v' + v.id, id: v.id, table: 'ventes' as const, date: v.date, creeLe: v.creeLe, qui: v.auteur, modifie: v.modifiePar,
      texte: v.aucuneVente ? `Pas de vente ce jour · ${nomBande(v.bandeId)}` : `Vente ${v.qte} × ${nombre(v.prixUnitaire)}${v.client ? ` à ${v.client}` : ''} · ${nomBande(v.bandeId)}${resteDu(v) ? ` · reste dû ${fcfa(resteDu(v))}` : ''}`,
      montant: totalVente(v),
    })),
    ...d.depenses.map((x) => ({ bandeId: x.bandeId,
      cle: 'd' + x.id, id: x.id, table: 'depenses' as const, date: x.date, creeLe: x.creeLe, qui: x.auteur, modifie: x.modifiePar, stock: x.origine === 'stock',
      texte: `${x.designation} · ${CATEGORIES[x.categorie]}${payeeAvecVentes(x) ? " · payé avec l'argent des ventes" : ''}`,
      montant: -x.montant,
    })),
    ...d.remises.map((r) => ({
      cle: 'r' + r.id, id: r.id, table: 'remises' as const, date: r.date, creeLe: r.creeLe, qui: r.auteur, modifie: r.modifiePar,
      texte: `Versement de ${r.de} à ${r.a}${r.statut === 'en_attente' ? ' · en attente de confirmation' : r.statut === 'refuse' ? ' · refusé (pas reçu)' : ''}`, montant: 0,
    })),
  ].sort((a, b) => `${b.date}${b.creeLe}`.localeCompare(`${a.date}${a.creeLe}`))

  const visibles = voitLesBilans(u) ? lignes : lignes.filter((l) => l.qui === u.nom)
  const montrees = filtre === '' ? visibles
    : filtre === 'generale' ? visibles.filter((l) => l.table === 'depenses' && !l.bandeId)
    : visibles.filter((l) => l.bandeId === filtre)
  const totalVentes = montrees.filter((l) => l.table === 'ventes').reduce((t, l) => t + l.montant, 0)
  const totalDepenses = -montrees.filter((l) => l.table === 'depenses').reduce((t, l) => t + l.montant, 0)
  const bandesTriees = [...d.bandes].sort((a, b) => b.dateReception.localeCompare(a.dateReception))
  const moi = enMain.get(u.nom)
  const aConfirmer = d.remises.filter((r) => versementEnAttente(r) && r.a === u.nom)
  const sortant = d.remises.filter((r) => versementEnAttente(r) && r.de === u.nom).reduce((t, r) => t + r.montant, 0)
  const repondre = (r: Remise, statut: 'confirme' | 'refuse') =>
    enregistrer('remises', { ...r, statut, confirmeLe: new Date().toISOString() })

  return (
    <div className="pile">
      <TitrePage icone={<Calculator size={20} />} titre="Caisse" />
      {u.role !== 'lecteur' && (u.role !== 'cofondateur' || moi) && (
        <section className="carte grosse-somme">
          <span>Argent des ventes que vous avez en main</span>
          <strong>{fcfa(moi ?? 0)}</strong>
          <small>Ventes encaissées − dépenses payées avec − versements confirmés</small>
          {sortant > 0 && <small>dont {fcfa(sortant)} versés, en attente de confirmation</small>}
        </section>
      )}

      {aConfirmer.length > 0 && (
        <section className="carte a-confirmer">
          <h3>Versements à confirmer</h3>
          {aConfirmer.map((r) => (
            <div key={r.id} className="versement">
              <p><strong>{r.de}</strong> dit vous avoir versé <strong>{fcfa(r.montant)}</strong> le {dateCourte(r.date)}</p>
              <div className="segments">
                <button onClick={() => repondre(r, 'refuse')}>Pas reçu</button>
                <button className="actif" onClick={() => repondre(r, 'confirme')}>J'ai bien reçu</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {peutSaisir(u) && (
        <div className="boutons-trois">
          <button className="action-caisse vert" onClick={() => naviguer({ nom: 'vente' })}><span className="pastille"><ShoppingCart size={18} /></span>Vente</button>
          <button className="action-caisse rouge" onClick={() => naviguer({ nom: 'depense' })}><span className="pastille"><Receipt size={18} /></span>Dépense</button>
          <button className="action-caisse bleu" onClick={() => naviguer({ nom: 'versement' })}><span className="pastille"><ArrowRightLeft size={18} /></span>Versement</button>
        </div>
      )}

      {voitLesBilans(u) && (
        <section className="carte">
          <h3>Argent chez l'équipe</h3>
          {[...enMain.entries()].filter(([, m]) => m !== 0).length === 0 && <p className="petit">Personne n'a d'argent des ventes en main.</p>}
          {d.remises.some(versementEnAttente) && (
            <p className="petit">En attente de confirmation : {d.remises.filter(versementEnAttente).map((r) => `${r.de} → ${r.a} ${fcfa(r.montant)}`).join(', ')}</p>
          )}
          <dl className="bilan">
            {[...enMain.entries()].filter(([, m]) => m !== 0).map(([nom, m]) => (
              <div key={nom}><dt>{nom} <small>({LIBELLE_ROLE[d.utilisateurs.find((x) => x.nom === nom)?.role ?? 'employe']})</small></dt><dd>{fcfa(m)}</dd></div>
            ))}
          </dl>
        </section>
      )}

      <section className="carte">
        <h3>Dettes des clients {totalDettes > 0 && <span className="rouge">· {fcfa(totalDettes)}</span>}</h3>
        {dettes.length === 0 && <p className="petit">Aucune dette.</p>}
        <ul className="liste-operations">
          {dettes.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{v.client ?? 'Client sans nom'}</strong>
                <small>{dateCourte(v.date)} · {v.qte} poulets · vendu par {v.auteur ?? '?'}</small>
              </span>
              <span className="droite">
                <strong className="rouge">{fcfa(resteDu(v))}</strong>
                {peutSaisir(u) && <button className="lien neutre" onClick={() => naviguer({ nom: 'reglement', venteId: v.id })}>Encaisser</button>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Toutes les opérations</h3>
        <label className="filtre-bande">
          Bande
          <select id="filtre-bande" value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            <option value="">Toutes les bandes et les versements</option>
            {bandesTriees.map((b) => <option key={b.id} value={b.id}>{b.nom}{b.statut === 'cloturee' ? ' (clôturée)' : ''}</option>)}
            <option value="generale">Dépenses générales (sans bande)</option>
          </select>
        </label>
        {filtre !== '' && montrees.length > 0 && (
          <p className="info">
            {montrees.length} opération{montrees.length > 1 ? 's' : ''} · ventes {fcfa(totalVentes)} · dépenses {fcfa(totalDepenses)}
          </p>
        )}
        {montrees.length === 0 && <p className="petit">Aucune opération{filtre ? ' pour ce choix' : " pour l'instant"}.</p>}
        <ul className="liste-operations">
          {montrees.map((l) => (
            <li key={l.cle}>
              <span className={l.modifie ? 'rouge' : ''}>
                {l.texte}
                <small>{dateCourte(l.date)}{l.qui ? ` · ${l.qui}` : ''}{l.modifie ? ` · modifié par ${l.modifie}` : ''}{l.stock ? ' · achat saisi dans Stock' : ''}</small>
              </span>
              <span className="droite">
                {l.table === 'remises' ? <strong>{fcfa(d.remises.find((r) => r.id === l.id)!.montant)}</strong>
                  : l.montant === 0 && l.table === 'ventes' ? <strong>—</strong>
                  : <strong className={l.montant < 0 ? 'negatif' : 'positif'}>{l.montant < 0 ? '−' : '+'}{fcfa(Math.abs(l.montant))}</strong>}
                {gestion && estVerrouillee(d.bandes, l.bandeId) && <small className="verrou">bande clôturée</small>}
                {gestion && !l.stock && !estVerrouillee(d.bandes, l.bandeId) && (
                  <button className="lien neutre" onClick={() => naviguer({ nom: l.table === 'ventes' ? 'vente' : l.table === 'depenses' ? 'depense' : 'versement', editId: l.id })}>
                    Modifier
                  </button>
                )}
                {gestion && !estVerrouillee(d.bandes, l.bandeId) && (
                  <button className="lien" onClick={() => setDemande({ message: `Supprimer : ${l.texte} ?`, action: () => supprimer(l.table, l.id) })}>
                    Supprimer
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {demande && (
        <div className="confirmer" role="alertdialog">
          <p>{demande.message}</p>
          <div className="segments">
            <button onClick={() => setDemande(null)}>Annuler</button>
            <button className="actif" onClick={async () => { await demande.action(); setDemande(null) }}>Confirmer</button>
          </div>
        </div>
      )}
    </div>
  )
}

export async function ajouterReglement(v: Vente, montant: number, par: string, date = aujourdhui()) {
  await enregistrer('ventes', { ...v, reglements: [...(v.reglements ?? []), { date, montant, par }] })
}
