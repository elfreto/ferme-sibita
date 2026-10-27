import type { ReactNode } from 'react'

/** Titre de page du nouveau design : pastille verte avec icône, titre et sous-titre facultatif. */
export default function TitrePage({ icone, titre, sousTitre }: { icone: ReactNode; titre: ReactNode; sousTitre?: ReactNode }) {
  return (
    <div className="titre-page">
      <span className="pastille pleine">{icone}</span>
      <div>
        <h1>{titre}</h1>
        {sousTitre && <p>{sousTitre}</p>}
      </div>
    </div>
  )
}
