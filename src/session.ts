import { createContext, useContext } from 'react'
import { db, modifier, type Utilisateur } from './db'

const CLE = 'sibita-utilisateur'

export async function hacher(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sibita:' + pin))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function connecter(id: string, pin: string): Promise<Utilisateur | 'pin-incorrect'> {
  const u = await db.utilisateurs.get(id)
  if (!u || u.actif === false) return 'pin-incorrect'
  const h = await hacher(pin)
  if (!u.pinHash) {
    // Première connexion : le code choisi devient le code de l'utilisateur
    await modifier<Utilisateur>('utilisateurs', id, { pinHash: h })
  } else if (u.pinHash !== h) {
    return 'pin-incorrect'
  }
  try { localStorage.setItem(CLE, id) } catch { /* stockage indisponible */ }
  return { ...u, pinHash: h }
}

export async function utilisateurMemorise(): Promise<Utilisateur | undefined> {
  let id: string | null = null
  try { id = localStorage.getItem(CLE) } catch { /* stockage indisponible */ }
  const u = id ? await db.utilisateurs.get(id) : undefined
  return u?.actif === false ? undefined : u
}

export function deconnecter() {
  try { localStorage.removeItem(CLE) } catch { /* stockage indisponible */ }
}

export const SessionContext = createContext<Utilisateur | null>(null)
export function useUtilisateur(): Utilisateur {
  const u = useContext(SessionContext)
  if (!u) throw new Error('Aucun utilisateur connecté')
  return u
}
