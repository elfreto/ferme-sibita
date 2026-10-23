import { useLiveQuery } from 'dexie-react-hooks'
import { ACCES_ROLE, LIBELLE_ROLE, db, dirigeLesBandes, peutSaisir } from '../db'
import { aujourdhui, consommations, dateLongue, nombre, pourcent } from '../calc'
import { useBande } from '../hooks'
import { useUtilisateur } from '../session'
import type { Naviguer } from '../App'
import { useDonnees } from '../hooks'
import { argentEnMain, resteDu, totalVente } from '../argent'
import { estStockBas, etatStocks } from '../stock'
import { fcfa } from '../calc'
import { voitLesBilans } from '../db'

/** Les chiffres qui demandent une action : argent à récupérer, dettes, stock bas, résultat en cours. */
function TableauDeBord({ naviguer }: { naviguer: Naviguer }) {
  const d = useDonnees()
  const u = useUtilisateur()
  if (!d) return null
  const enMain = argentEnMain(d.utilisateurs, d.ventes, d.depenses, d.remises)
  const stocks = etatStocks(d.articles, d.mouvements, consommations(d.bandes, d.saisies, d.ventes))
  const stockBas = d.articles.filter((a) => estStockBas(a, stocks.get(a.id) ?? 0, d.mouvements))
  const aConfirmer = d.remises.filter((r) => r.statut === 'en_attente' && r.a === u.nom)
  const alerte = aConfirmer.length > 0 && (
    <button className="confirmer-accueil" onClick={() => naviguer({ nom: 'caisse' })}>
      {aConfirmer.length} versement{aConfirmer.length > 1 ? 's' : ''} à confirmer ({fcfa(aConfirmer.reduce((t, r) => t + r.montant, 0))})
    </button>
  )
  if (!voitLesBilans(u)) {
    if (u.role === 'lecteur') return null
    return (
      <div className="tableau-bord">
        {alerte}
        <button onClick={() => naviguer({ nom: 'caisse' })}>
          <strong>{fcfa(enMain.get(u.nom) ?? 0)}</strong><span>argent des ventes en main</span>
        </button>
        <button className={stockBas.length ? 'attention' : ''} onClick={() => naviguer({ nom: 'stock' })}>
          <strong>{stockBas.length ? `${stockBas.length} article${stockBas.length > 1 ? 's' : ''}` : 'OK'}</strong><span>stock bas</span>
        </button>
      </div>
    )
  }
  const cofondateurs = new Set(d.utilisateurs.filter((x) => x.role === 'cofondateur').map((x) => x.nom))
  const chezEquipe = [...enMain.entries()].filter(([nom]) => !cofondateurs.has(nom)).reduce((t, [, m]) => t + m, 0)
  const dettes = d.ventes.reduce((t, v) => t + resteDu(v), 0)
  const enCours = new Set(d.bandes.filter((b) => b.statut === 'en_cours').map((b) => b.id))
  const resultat = d.ventes.filter((v) => enCours.has(v.bandeId)).reduce((t, v) => t + totalVente(v), 0)
    - d.depenses.filter((x) => x.bandeId && enCours.has(x.bandeId)).reduce((t, x) => t + x.montant, 0)
  return (
    <div className="tableau-bord">
      {alerte}
      <button className={chezEquipe > 0 ? 'attention' : ''} onClick={() => naviguer({ nom: 'caisse' })}>
        <strong>{fcfa(chezEquipe)}</strong><span>argent des ventes chez l'équipe</span>
      </button>
      <button className={dettes > 0 ? 'attention' : ''} onClick={() => naviguer({ nom: 'caisse' })}>
        <strong>{fcfa(dettes)}</strong><span>dettes des clients</span>
      </button>
      <button className={stockBas.length ? 'attention' : ''} onClick={() => naviguer({ nom: 'stock' })}>
        <strong>{stockBas.length ? `${stockBas.length} article${stockBas.length > 1 ? 's' : ''}` : 'OK'}</strong><span>stock bas</span>
      </button>
      <button onClick={() => naviguer({ nom: 'bandes' })}>
        <strong className={resultat < 0 ? 'rouge' : ''}>{fcfa(resultat)}</strong><span>ventes − dépenses des bandes en cours</span>
      </button>
    </div>
  )
}

export default function Accueil({ naviguer }: { naviguer: Naviguer }) {
  const enCours = useLiveQuery(() => db.bandes.where('statut').equals('en_cours').toArray(), [])
  const u = useUtilisateur()
  if (!enCours) return null
  return (
    <div className="pile">
      <p className="date-jour">{dateLongue(aujourdhui())}</p>
      <div className={`acces ${u.role}`}>
        <strong>Votre accès : {LIBELLE_ROLE[u.role]}</strong>
        <span>{ACCES_ROLE[u.role]}</span>
      </div>
      <TableauDeBord naviguer={naviguer} />
      {([1, 2] as const).map((espace) => {
        const bande = enCours.find((b) => b.espace === espace)
        return bande ? (
          <CarteBande key={espace} bandeId={bande.id} naviguer={naviguer} />
        ) : (
          <section key={espace} className="carte vide">
            <h2>Espace {espace}</h2>
            <p>Aucune bande en cours.</p>
            {dirigeLesBandes(u) && (
              <button className="secondaire" onClick={() => naviguer({ nom: 'nouvelle-bande', espace })}>
                Démarrer une bande
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}

function CarteBande({ bandeId, naviguer }: { bandeId: string; naviguer: Naviguer }) {
  const data = useBande(bandeId)
  const u = useUtilisateur()
  if (!data) return null
  const { bande, jours, resume: r } = data
  const auj = jours.find((j) => j.date === aujourdhui())
  return (
    <section className="carte">
      <div className="carte-tete" onClick={() => naviguer({ nom: 'bande', bandeId })}>
        <div>
          <span className="etiquette">Espace {bande.espace}</span>
          <h2>{bande.nom}</h2>
        </div>
        <div className="age">
          <strong>J{r.ageJour}</strong>
          <span>âge</span>
        </div>
      </div>
      <div className="chiffres">
        <div><strong>{nombre(r.vivants)}</strong><span>vivants</span></div>
        <div><strong>{nombre(r.mortsTotal)}</strong><span>morts ({pourcent(r.tauxMortalite)})</span></div>
        <div>
          <strong>{r.dernierPoidsKg ? `${nombre(r.dernierPoidsKg, 2)} kg` : '—'}</strong>
          <span>{r.dernierPoidsKg ? `poids à J${r.dernierPoidsAge}` : 'pas encore pesé'}</span>
        </div>
      </div>
      {r.joursManquants.filter((d) => d < aujourdhui()).length > 0 && (
        <div className="aujourdhui manque" onClick={() => naviguer({ nom: 'bande', bandeId })}>
          {r.joursManquants.filter((d) => d < aujourdhui()).length} jour(s) passé(s) sans saisie : voir la fiche
        </div>
      )}
      <div className={`aujourdhui ${auj && !auj.manquant ? 'fait' : 'afaire'}`}>
        {auj && !auj.manquant
          ? `Aujourd'hui : ${auj.morts} mort${auj.morts > 1 ? 's' : ''}${auj.alimentKg ? `, ${nombre(auj.alimentKg, 1)} kg d'aliment (${auj.ration} g/sujet)` : ', aliment pas encore saisi'}`
          : "Rien n'est encore saisi aujourd'hui"}
      </div>
      {peutSaisir(u) ? (
        <button className="principal" onClick={() => naviguer({ nom: 'saisie', bandeId })}>
          Saisir pour aujourd'hui
        </button>
      ) : (
        <button className="secondaire" onClick={() => naviguer({ nom: 'bande', bandeId })}>Voir la fiche</button>
      )}
    </section>
  )
}
