import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, CalendarCheck, CalendarDays, CalendarX, ChevronRight, Coins, Database, HeartPulse, Link2, MinusCircle, Package, Plus, Scale, Sprout, User, Users } from 'lucide-react'
import { ACCES_ROLE, LIBELLE_ROLE, db, dirigeLesBandes, peutSaisir, voitLesBilans } from '../db'
import { aujourdhui, consommations, dateLongue, fcfa, nombre, pourcent } from '../calc'
import { useBande, useDonnees } from '../hooks'
import { useUtilisateur } from '../session'
import type { Naviguer } from '../App'
import { argentEnMain, resteDu, totalVente } from '../argent'
import { estStockBas, etatStocks } from '../stock'

type Teinte = 'bleu' | 'vert' | 'orange' | 'rouge'

/** Tuile colorée du tableau de bord : pastille avec icône, chiffre, libellé, flèche. */
function Tuile({ teinte, icone, valeur, libelle, onClick }: { teinte: Teinte; icone: ReactNode; valeur: ReactNode; libelle: string; onClick: () => void }) {
  return (
    <button className={`tuile ${teinte}`} onClick={onClick}>
      <span className="tuile-haut">
        <span className="pastille">{icone}</span>
        <strong>{valeur}</strong>
        <ChevronRight className="fleche" size={20} />
      </span>
      <span className="tuile-libelle">{libelle}</span>
    </button>
  )
}

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
  const tuileStock = (
    <Tuile teinte="orange" icone={<Package size={22} />} onClick={() => naviguer({ nom: 'stock' })}
      valeur={stockBas.length ? `${stockBas.length} article${stockBas.length > 1 ? 's' : ''}` : 'OK'} libelle="stock bas" />
  )
  if (!voitLesBilans(u)) {
    if (u.role === 'lecteur') return null
    return (
      <div className="tableau-bord">
        {alerte}
        <Tuile teinte="bleu" icone={<Coins size={22} />} valeur={fcfa(enMain.get(u.nom) ?? 0)} libelle="argent des ventes en main" onClick={() => naviguer({ nom: 'caisse' })} />
        {tuileStock}
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
      <Tuile teinte="bleu" icone={<Users size={22} />} valeur={fcfa(chezEquipe)} libelle="argent des ventes chez l'équipe" onClick={() => naviguer({ nom: 'caisse' })} />
      <Tuile teinte="vert" icone={<User size={22} />} valeur={fcfa(dettes)} libelle="dettes des clients" onClick={() => naviguer({ nom: 'caisse' })} />
      {tuileStock}
      <Tuile teinte={resultat < 0 ? 'rouge' : 'vert'} icone={<Database size={22} />} valeur={fcfa(resultat)} libelle="ventes − dépenses des bandes en cours" onClick={() => naviguer({ nom: 'bandes' })} />
    </div>
  )
}

export default function Accueil({ naviguer }: { naviguer: Naviguer }) {
  const enCours = useLiveQuery(() => db.bandes.where('statut').equals('en_cours').toArray(), [])
  const u = useUtilisateur()
  if (!enCours) return null
  return (
    <div className="pile accueil">
      <p className="date-jour"><CalendarDays size={26} />{dateLongue(aujourdhui())}</p>
      <div className={`acces ${u.role}`}>
        <span className="pastille"><Sprout size={26} /></span>
        <div>
          <strong>Votre accès : {LIBELLE_ROLE[u.role]}</strong>
          <span>{ACCES_ROLE[u.role]}</span>
        </div>
      </div>
      <TableauDeBord naviguer={naviguer} />
      {([1, 2] as const).map((espace) => {
        const bande = enCours.find((b) => b.espace === espace)
        return bande ? (
          <CarteBande key={espace} bandeId={bande.id} naviguer={naviguer} />
        ) : (
          <section key={espace} className="carte espace-vide">
            <div className="espace-tete">
              <span className="pastille pleine"><Link2 size={24} /></span>
              <div>
                <h2>Espace {espace}</h2>
                <p>Aucune bande en cours.</p>
              </div>
              <ChevronRight className="fleche" size={22} />
            </div>
            {dirigeLesBandes(u) && (
              <button className="demarrer" onClick={() => naviguer({ nom: 'nouvelle-bande', espace })}>
                <Plus size={18} strokeWidth={3} /> Démarrer une bande
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
  const manquants = r.joursManquants.filter((d) => d < aujourdhui()).length
  const fait = auj && !auj.manquant
  return (
    <section className="carte carte-bande">
      <div className="bande-tete" onClick={() => naviguer({ nom: 'bande', bandeId })}>
        <span className="pastille"><Sprout size={26} /></span>
        <div className="bande-titre">
          <span>Espace {bande.espace}</span>
          <h2>{bande.nom}</h2>
        </div>
        <div className="age">
          <strong>J{r.ageJour}</strong>
          <span>âge</span>
        </div>
      </div>
      <div className="bande-corps">
        <div className="indicateurs">
          <div className="vert"><span className="pastille"><Users size={18} /></span><div><strong>{nombre(r.vivants)}</strong><span>vivants</span></div></div>
          <div className="orange"><span className="pastille"><HeartPulse size={18} /></span><div><strong>{nombre(r.mortsTotal)}</strong><span>morts ({pourcent(r.tauxMortalite)})</span></div></div>
          <div className="gris">
            <span className="pastille">{r.dernierPoidsKg ? <Scale size={18} /> : <MinusCircle size={18} />}</span>
            <div>
              <strong>{r.dernierPoidsKg ? `${nombre(r.dernierPoidsKg, 2)} kg` : '—'}</strong>
              <span>{r.dernierPoidsKg ? `poids à J${r.dernierPoidsAge}` : 'pas encore pesé'}</span>
            </div>
          </div>
        </div>
        {manquants > 0 && (
          <div className="aujourdhui manque" onClick={() => naviguer({ nom: 'bande', bandeId })}>
            <CalendarX size={22} />{manquants} jour(s) passé(s) sans saisie : voir la fiche
          </div>
        )}
        <div className={`aujourdhui ${fait ? 'fait' : 'afaire'}`}>
          {fait ? <CalendarCheck size={22} /> : <CalendarX size={22} />}
          {fait
            ? `Aujourd'hui : ${auj.morts} mort${auj.morts > 1 ? 's' : ''}${auj.alimentKg ? `, ${nombre(auj.alimentKg, 1)} kg d'aliment (${auj.ration} g/sujet)` : ', aliment pas encore saisi'}`
            : "Rien n'est encore saisi aujourd'hui"}
        </div>
        {peutSaisir(u) ? (
          <button className="principal grand" onClick={() => naviguer({ nom: 'saisie', bandeId })}>
            <BarChart3 size={22} /> Saisir pour aujourd'hui <ChevronRight size={20} />
          </button>
        ) : (
          <button className="secondaire" onClick={() => naviguer({ nom: 'bande', bandeId })}>Voir la fiche</button>
        )}
      </div>
    </section>
  )
}
