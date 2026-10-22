import { useLiveQuery } from 'dexie-react-hooks'
import { db, dirigeLesBandes, voitLesBilans, type Bande } from '../db'
import { dateCourte, fcfa, nombre } from '../calc'
import { useUtilisateur } from '../session'
import type { Naviguer } from '../App'

export default function ListeBandes({ naviguer }: { naviguer: Naviguer }) {
  const bandes = useLiveQuery(() => db.bandes.orderBy('id').toArray(), [])
  const u = useUtilisateur()
  if (!bandes) return null
  const tri = [...bandes].sort((a, b) => b.dateReception.localeCompare(a.dateReception))
  const enCours = tri.filter((b) => b.statut === 'en_cours')
  const closes = tri.filter((b) => b.statut === 'cloturee')
  return (
    <div className="pile">
      <h1>Bandes</h1>
      {dirigeLesBandes(u) && enCours.length < 2 && (
        <button className="secondaire" onClick={() => naviguer({ nom: 'nouvelle-bande' })}>Démarrer une bande</button>
      )}
      <h3>En cours</h3>
      {enCours.map((b) => <Ligne key={b.id} b={b} naviguer={naviguer} montrerArgent={false} />)}
      {enCours.length === 0 && <p>Aucune.</p>}
      <h3>Terminées</h3>
      {closes.map((b) => <Ligne key={b.id} b={b} naviguer={naviguer} montrerArgent={voitLesBilans(u)} />)}
    </div>
  )
}

function Ligne({ b, naviguer, montrerArgent }: { b: Bande; naviguer: Naviguer; montrerArgent: boolean }) {
  const net = b.bilanExcel?.['RESULTAT NET']
  return (
    <button className="ligne-bande" onClick={() => naviguer({ nom: 'bande', bandeId: b.id })}>
      <span>
        <strong>{b.nom}</strong>
        <small>Espace {b.espace} · {nombre(b.poussins)} poussins · reçus le {dateCourte(b.dateReception)}</small>
      </span>
      {montrerArgent && net !== undefined && <span className={net >= 0 ? 'positif' : 'negatif'}>{fcfa(net)}</span>}
    </button>
  )
}
