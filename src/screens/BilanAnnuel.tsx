import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Bande, type Mouvement } from '../db'
import { aujourdhui, fcfa, journees, nombre, resume } from '../calc'
import { bilanBande } from '../argent'
import { MAIS, PROVENDE_MAISON, PROVENDE_SPC } from '../stock'
import type { Naviguer } from '../App'

interface LigneBande {
  bande: Bande
  depenses: number
  ventes: number
  resultat: number
  vendus: number
  morts: number
  alimentKg: number
}

/** Chiffres de chaque bande, comme sur sa fiche : bilan repris de l'Excel s'il existe, sinon calculé. */
function useAnnees() {
  return useLiveQuery(async () => {
    const [bandes, saisies, ventes, depenses, mouvements] = await Promise.all([
      db.bandes.toArray(), db.journal.toArray(), db.ventes.toArray(), db.depenses.toArray(), db.mouvements.toArray(),
    ])
    const lignes: LigneBande[] = bandes.map((bande) => {
      const v = ventes.filter((x) => x.bandeId === bande.id)
      const jours = journees(bande, saisies.filter((s) => s.bandeId === bande.id), v)
      const r = resume(bande, jours)
      const b = bilanBande(bande, jours, v, depenses.filter((d) => d.bandeId === bande.id))
      const x = bande.bilanExcel
      const dep = x?.['MONTANT TOTAL DES DEPENSES'] ?? b.totalDepenses
      const ven = x?.['PRIX TOTAL DES VENTES'] ?? b.totalVentes
      return {
        bande,
        depenses: dep,
        ventes: ven,
        resultat: x?.['RESULTAT NET'] ?? ven - dep,
        vendus: x?.['Nombre de poulets vendus'] ?? b.vendus,
        morts: r.mortsTotal,
        alimentKg: r.alimentTotalKg,
      }
    })
    return { lignes, mouvements }
  }, [])
}

const sacsEntres = (mouvements: Mouvement[], articleId: string, annee: string) =>
  mouvements.filter((m) => m.articleId === articleId && m.sens === 'entree' && m.date.startsWith(annee)).reduce((t, m) => t + m.quantite, 0)

export default function BilanAnnuel({ naviguer }: { naviguer: Naviguer }) {
  const d = useAnnees()
  const [annee, setAnnee] = useState(aujourdhui().slice(0, 4))
  if (!d) return null
  const annees = [...new Set([aujourdhui().slice(0, 4), ...d.lignes.map((l) => l.bande.dateReception.slice(0, 4))])].sort().reverse()
  // Une bande compte dans l'année où ses poussins ont été reçus
  const lignes = d.lignes.filter((l) => l.bande.dateReception.startsWith(annee)).sort((a, b) => a.bande.dateReception.localeCompare(b.bande.dateReception))
  const somme = (f: (l: LigneBande) => number) => lignes.reduce((t, l) => t + f(l), 0)
  const depenses = somme((l) => l.depenses)
  const ventes = somme((l) => l.ventes)
  const vendus = somme((l) => l.vendus)
  return (
    <div className="pile">
      <h1>Tableau de bord annuel</h1>
      <label className="filtre-bande">
        Année
        <select id="annee" value={annee} onChange={(e) => setAnnee(e.target.value)}>
          {annees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      <p className="petit">
        {lignes.length ? `${lignes.length} bande${lignes.length > 1 ? 's' : ''} reçue${lignes.length > 1 ? 's' : ''} en ${annee}` : `Aucune bande reçue en ${annee}.`}
        {lignes.some((l) => l.bande.statut === 'en_cours') ? ', dont une en cours : ses chiffres sont provisoires.' : lignes.length ? '.' : ''}
      </p>

      <section className="carte">
        <dl className="bilan">
          <div className="bilan-depenses"><dt>Dépenses totales</dt><dd>{fcfa(Math.round(depenses))}</dd></div>
          <div className="bilan-ventes"><dt>Ventes totales</dt><dd>{fcfa(Math.round(ventes))}</dd></div>
          <div className="fort bilan-resultat"><dt>Résultat net</dt><dd>{fcfa(Math.round(somme((l) => l.resultat)))}</dd></div>
          <div className="bilan-separation"><span>Indicateurs clés</span></div>
          <div><dt>Total poulets vendus</dt><dd>{nombre(vendus)}</dd></div>
          <div><dt>Total poulets morts</dt><dd>{nombre(somme((l) => l.morts))}</dd></div>
          <div><dt>Total aliment donné</dt><dd>{nombre(somme((l) => l.alimentKg), 1)} kg</dd></div>
          <div><dt>Coût production / poulet</dt><dd>{vendus ? fcfa(Math.round(depenses / vendus)) : '—'}</dd></div>
          <div><dt>Prix de vente moyen</dt><dd>{vendus ? fcfa(Math.round(ventes / vendus)) : '—'}</dd></div>
          <div className="bilan-separation"><span>Sacs entrés en stock en {annee}</span></div>
          <div><dt>Maïs acheté</dt><dd>{nombre(sacsEntres(d.mouvements, MAIS, annee), 1)} sacs</dd></div>
          <div><dt>Provende maison</dt><dd>{nombre(sacsEntres(d.mouvements, PROVENDE_MAISON, annee), 1)} sacs</dd></div>
          <div><dt>Provende SPC</dt><dd>{nombre(sacsEntres(d.mouvements, PROVENDE_SPC, annee), 1)} sacs</dd></div>
        </dl>
      </section>

      <ResultatsParBande lignes={lignes} naviguer={naviguer} />
    </div>
  )
}

const kfcfa = (n: number) => `${n < 0 ? '−' : ''}${nombre(Math.round(Math.abs(n) / 1000))} k`

function ResultatsParBande({ lignes, naviguer }: { lignes: LigneBande[]; naviguer: Naviguer }) {
  const [choisie, setChoisie] = useState<string | null>(null)
  if (!lignes.length) return null
  const max = Math.max(1, ...lignes.map((l) => l.resultat))
  const min = Math.min(0, ...lignes.map((l) => l.resultat))
  const L = 320, H = 160, haut = 16, bas = 40
  const zone = H - haut - bas
  const y = (v: number) => haut + ((max - v) / (max - min)) * zone
  const zero = y(0)
  const pas = L / lignes.length
  const largeur = Math.min(48, pas * 0.6)
  const detail = lignes.find((l) => l.bande.id === choisie)
  return (
    <section>
      <h3>Résultat net par bande</h3>
      <p className="petit">En milliers de FCFA (k). Touchez une barre pour le détail.</p>
      <svg viewBox={`0 0 ${L} ${H}`} className="graphique" role="img" aria-label="Résultat net par bande">
        <line x1={0} y1={zero} x2={L} y2={zero} className="axe" />
        {lignes.map((l, i) => {
          const cx = pas * i + pas / 2
          const haut0 = Math.min(y(l.resultat), zero)
          const h = Math.max(1, Math.abs(y(l.resultat) - zero))
          const r = Math.min(4, h / 2, largeur / 2)
          const positif = l.resultat >= 0
          // Coins arrondis seulement du côté de la valeur, la barre reste posée sur la ligne zéro
          const chemin = positif
            ? `M${cx - largeur / 2},${zero} V${haut0 + r} Q${cx - largeur / 2},${haut0} ${cx - largeur / 2 + r},${haut0} H${cx + largeur / 2 - r} Q${cx + largeur / 2},${haut0} ${cx + largeur / 2},${haut0 + r} V${zero} Z`
            : `M${cx - largeur / 2},${zero} V${zero + h - r} Q${cx - largeur / 2},${zero + h} ${cx - largeur / 2 + r},${zero + h} H${cx + largeur / 2 - r} Q${cx + largeur / 2},${zero + h} ${cx + largeur / 2},${zero + h - r} V${zero} Z`
          return (
            <g key={l.bande.id} className={`barre-resultat ${positif ? 'positif' : 'negatif'} ${choisie === l.bande.id ? 'choisie' : ''}`}
              onClick={() => setChoisie(choisie === l.bande.id ? null : l.bande.id)}>
              <rect x={pas * i} y={0} width={pas} height={H} fill="transparent" />
              <path d={chemin} />
              <text x={cx} y={positif ? haut0 - 4 : zero + h + 10} textAnchor="middle" className="valeur">{kfcfa(l.resultat)}</text>
              <text x={cx} y={H - 8} textAnchor="middle">{l.bande.nom.replace(/^Bande /, '')}</text>
            </g>
          )
        })}
      </svg>
      {detail && (
        <div className="carte pile">
          <strong>{detail.bande.nom}{detail.bande.statut === 'en_cours' ? ' (en cours)' : ''}</strong>
          <dl className="bilan">
            <div className="bilan-depenses"><dt>Dépenses</dt><dd>{fcfa(Math.round(detail.depenses))}</dd></div>
            <div className="bilan-ventes"><dt>Ventes</dt><dd>{fcfa(Math.round(detail.ventes))}</dd></div>
            <div className="fort bilan-resultat"><dt>Résultat net</dt><dd>{fcfa(Math.round(detail.resultat))}</dd></div>
          </dl>
          <button className="lien" onClick={() => naviguer({ nom: 'bande', bandeId: detail.bande.id })}>Voir la fiche de la bande</button>
        </div>
      )}
    </section>
  )
}
