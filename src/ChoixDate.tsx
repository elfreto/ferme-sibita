import { aujourdhui } from './calc'

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const deux = (n: number) => String(n).padStart(2, '0')
const joursDansMois = (a: number, m: number) => new Date(a, m, 0).getDate()

/**
 * Choix de date en trois listes (jour, mois, année).
 * Remplace le calendrier du téléphone, qui ne s'ouvre pas partout (ex. dans l'application Claude).
 */
export default function ChoixDate({ value, onChange, min, max = aujourdhui(), id }: {
  value: string; onChange: (d: string) => void; min?: string; max?: string; id?: string
}) {
  const [a, m, j] = value.split('-').map(Number)
  const anMax = Number(max.slice(0, 4))
  const anMin = min ? Number(min.slice(0, 4)) : Math.min(a, anMax - 2)
  const annees = Array.from({ length: anMax - anMin + 1 }, (_, i) => anMin + i)

  function choisir(an: number, mois: number, jour: number) {
    let d = `${an}-${deux(mois)}-${deux(Math.min(jour, joursDansMois(an, mois)))}`
    if (d > max) d = max
    if (min && d < min) d = min
    onChange(d)
  }

  return (
    <div className="choix-date" id={id}>
      <select aria-label="Jour" value={j} onChange={(e) => choisir(a, m, Number(e.target.value))}>
        {Array.from({ length: joursDansMois(a, m) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select aria-label="Mois" value={m} onChange={(e) => choisir(a, Number(e.target.value), j)}>
        {MOIS_COURTS.map((nom, i) => <option key={i} value={i + 1}>{nom}</option>)}
      </select>
      <select aria-label="Année" value={a} onChange={(e) => choisir(Number(e.target.value), m, j)}>
        {annees.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  )
}
