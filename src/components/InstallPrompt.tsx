import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isDismissed, setIsDismissed] = useState(() => {
    return sessionStorage.getItem('pwa_prompt_dismissed') === 'true'
  })
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if already running in standalone (installed) mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    setIsStandalone(standalone)

    // Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase()
    const ios = /iphone|ipad|ipod/.test(userAgent)
    setIsIOS(ios && !standalone)

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    sessionStorage.setItem('pwa_prompt_dismissed', 'true')
  }

  if (isStandalone || isDismissed) return null
  if (!deferredPrompt && !isIOS) return null

  return (
    <div className="install-banner" role="banner" aria-label="Instalar aplicación">
      <div className="install-content">
        <span className="install-icon">📲</span>
        <div className="install-text">
          <strong>Instalar Distrito 3 Tracker</strong>
          <small>
            {isIOS
              ? 'Pulsa Compartir ⎋ y "Agregar a Inicio" ➕'
              : 'Úsala como una app nativa, rápida y sin conexión'}
          </small>
        </div>
      </div>
      <div className="install-actions">
        {deferredPrompt && (
          <button className="install-btn" onClick={handleInstallClick}>
            Instalar
          </button>
        )}
        <button className="install-close-btn" onClick={handleDismiss} aria-label="Cerrar aviso">
          ✕
        </button>
      </div>
    </div>
  )
}
