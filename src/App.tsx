import { Calculator, ChevronLeft, Home, Link2, Package, PlusCircle, UserCheck, WifiOff } from 'lucide-react'
import { corrigerRation180 } from './corrections'
import BilanAnnuel from './screens/BilanAnnuel'
import { useEffect, useState } from 'react'
import { LIBELLE_ROLE, dirigeLesBandes, initialiser, type Mouvement, type Utilisateur } from './db'
import Equipe from './screens/Equipe'
import { SessionContext, deconnecter, utilisateurMemorise } from './session'
import Connexion from './screens/Connexion'
import Accueil from './screens/Accueil'
import SaisieJour from './screens/SaisieJour'
import FicheBande from './screens/FicheBande'
import NouvelleBande from './screens/NouvelleBande'
import ListeBandes from './screens/ListeBandes'
import Caisse from './screens/Caisse'
import { NouveauVersement, NouvelleDepense, NouvelleVente, Reglement } from './screens/Formulaires'
import Stock, { MouvementStock } from './screens/Stock'
import Plus from './screens/Plus'
import ConnexionFerme from './screens/ConnexionFerme'
import { demarrerSynchro, fermeMemorisee, supabase, synchroActive, useSynchro } from './sync'

export type Ecran =
  | { nom: 'accueil' }
  | { nom: 'saisie'; bandeId: string; date?: string; saisieId?: string }
  | { nom: 'bande'; bandeId: string }
  | { nom: 'nouvelle-bande'; espace?: 1 | 2 }
  | { nom: 'bandes' }
  | { nom: 'equipe' }
  | { nom: 'caisse' }
  | { nom: 'vente'; editId?: string }
  | { nom: 'depense'; editId?: string }
  | { nom: 'versement'; editId?: string }
  | { nom: 'reglement'; venteId: string }
  | { nom: 'stock' }
  | { nom: 'mouvement'; articleId: string; sens: Mouvement['sens']; mouvementId?: string }
  | { nom: 'plus' }
  | { nom: 'annuel' }

export type Naviguer = (e: Ecran) => void

export default function App() {
  const [pret, setPret] = useState(false)
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null)
  const [pile, setPile] = useState<Ecran[]>([{ nom: 'accueil' }])
  const enLigne = useEnLigne()
  const synchro = useSynchro()
  // Version partagée : le téléphone doit d'abord être relié au compte de la ferme
  const [fermeReliee, setFermeReliee] = useState(!synchroActive || fermeMemorisee())

  useEffect(() => {
    // Vérification auprès du serveur en arrière-plan : on n'attend jamais le réseau pour ouvrir l'appli
    supabase?.auth.getSession().then(({ data, error }) => {
      if (!data.session && !error) setFermeReliee(false)
    })
    initialiser()
      .then(() => (synchroActive ? undefined : corrigerRation180()))
      .then(utilisateurMemorise)
      .then((u) => setUtilisateur(u ?? null))
      .finally(() => setPret(true))
  }, [])

  useEffect(() => (fermeReliee ? demarrerSynchro() : undefined), [fermeReliee])

  // Le bouton retour du téléphone revient à l'écran précédent
  useEffect(() => {
    const retour = () => setPile((p) => (p.length > 1 ? p.slice(0, -1) : p))
    window.addEventListener('popstate', retour)
    return () => window.removeEventListener('popstate', retour)
  }, [])

  if (!pret) return <div className="chargement">Chargement…</div>
  if (!fermeReliee) return <ConnexionFerme onConnecte={() => setFermeReliee(true)} />
  if (!utilisateur) return <Connexion onConnecte={setUtilisateur} />

  const ecran = pile[pile.length - 1]
  const naviguer: Naviguer = (e) => {
    if (e.nom === 'accueil') {
      setPile([e])
    } else {
      history.pushState(null, '')
      setPile((p) => [...p, e])
    }
  }
  const retour = () => history.back()
  const quitter = () => {
    deconnecter()
    setUtilisateur(null)
    setPile([{ nom: 'accueil' }])
  }

  return (
    <SessionContext.Provider value={utilisateur}>
      <header className="entete">
        <svg className="entete-deco" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M260 92 C 290 40, 340 30, 352 36 C 344 70, 300 96, 260 92 Z" />
          <path d="M300 112 C 318 84, 350 78, 362 82 C 352 104, 326 116, 300 112 Z" />
        </svg>
        {pile.length > 1 ? (
          <button className="retour" onClick={retour} aria-label="Retour"><ChevronLeft size={30} /></button>
        ) : (
          <img src={`${import.meta.env.BASE_URL}logo-coq.png`} alt="" className="logo" />
        )}
        <div className="titre">
          <strong>La Ferme de Sibita</strong>
          <span>
            {utilisateur.nom} · {LIBELLE_ROLE[utilisateur.role].toLowerCase()}
          </span>
        </div>
        <span className={`reseau ${!enLigne || synchro.etat === 'erreur' ? 'hors' : 'ok'}`} onClick={() => naviguer({ nom: 'plus' })}>
          {!enLigne ? <WifiOff size={16} /> : <UserCheck size={16} />}
          {!enLigne ? 'Hors ligne' : !synchroActive ? 'En ligne'
            : synchro.etat === 'erreur' ? 'Pas synchronisé'
            : synchro.etat === 'en-cours' ? 'Envoi…'
            : synchro.enAttente > 0 ? `${synchro.enAttente} en attente` : 'À jour'}
        </span>
      </header>
      {!enLigne && (
        <div className="bandeau">Pas de réseau : vos saisies sont gardées sur le téléphone{synchroActive ? ' et partiront au retour du réseau' : ''}.</div>
      )}
      <main>
        {ecran.nom === 'accueil' && <Accueil naviguer={naviguer} />}
        {ecran.nom === 'saisie' && <SaisieJour key={`${ecran.date}-${ecran.saisieId}`} bandeId={ecran.bandeId} dateInitiale={ecran.date} saisieId={ecran.saisieId} onFini={retour} />}
        {ecran.nom === 'bande' && <FicheBande bandeId={ecran.bandeId} naviguer={naviguer} />}
        {ecran.nom === 'nouvelle-bande' && <NouvelleBande espace={ecran.espace} onFini={retour} />}
        {ecran.nom === 'bandes' && <ListeBandes naviguer={naviguer} />}
        {ecran.nom === 'equipe' && <Equipe />}
        {ecran.nom === 'caisse' && <Caisse naviguer={naviguer} />}
        {ecran.nom === 'vente' && <NouvelleVente editId={ecran.editId} onFini={retour} />}
        {ecran.nom === 'depense' && <NouvelleDepense editId={ecran.editId} onFini={retour} />}
        {ecran.nom === 'versement' && <NouveauVersement editId={ecran.editId} onFini={retour} />}
        {ecran.nom === 'reglement' && <Reglement venteId={ecran.venteId} onFini={retour} />}
        {ecran.nom === 'stock' && <Stock naviguer={naviguer} />}
        {ecran.nom === 'mouvement' && <MouvementStock articleId={ecran.articleId} sens={ecran.sens} mouvementId={ecran.mouvementId} onFini={retour} />}
        {ecran.nom === 'annuel' && dirigeLesBandes(utilisateur) && <BilanAnnuel naviguer={naviguer} />}
        {ecran.nom === 'plus' && <Plus naviguer={naviguer} onQuitter={quitter} />}
      </main>
      <nav className="barre">
        {([
          ['accueil', 'Accueil', Home],
          ['bandes', 'Bandes', Link2],
          ['caisse', 'Caisse', Calculator],
          ['stock', 'Stock', Package],
          ['plus', 'Plus', PlusCircle],
        ] as const).map(([nom, libelle, Icone]) => (
          <button key={nom} className={ecran.nom === nom ? 'actif' : ''} onClick={() => naviguer({ nom })}>
            <Icone size={24} strokeWidth={ecran.nom === nom ? 2.4 : 1.8} />
            {libelle}
          </button>
        ))}
      </nav>
    </SessionContext.Provider>
  )
}

function useEnLigne() {
  const [enLigne, setEnLigne] = useState(navigator.onLine)
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine)
    window.addEventListener('online', maj)
    window.addEventListener('offline', maj)
    return () => {
      window.removeEventListener('online', maj)
      window.removeEventListener('offline', maj)
    }
  }, [])
  return enLigne
}
