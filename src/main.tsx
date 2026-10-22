import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

try {
  registerSW({ immediate: true })
  navigator.storage?.persist?.().catch(() => {})
} catch {
  // Pas de mode hors ligne dans les environnements sans service worker
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
