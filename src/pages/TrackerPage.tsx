import { useEffect, useRef, useState, useCallback } from 'react'
import { MapView } from '../components/MapView'
import { appendPoint, formatDistance, calculateAvgSpeed, generateGPX, downloadFile, getActiveDurationMs } from '../lib/geo'
import { saveSession, getSession } from '../lib/db'
import { syncSession, setupAutoSync } from '../lib/sync'
import { usePermissions } from '../lib/usePermissions'
import { sections } from '../data/sections'
import { showToast } from '../components/Toast'
import type { GPSPoint, RouteSession } from '../types'

const ACTIVE_SESSION_KEY = 'distrito3_active_session'

/** Translate browser geolocation error codes to user-friendly Spanish messages */
function humanizeGeoError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Permiso de ubicación denegado. Actívalo en los ajustes de tu navegador.'
    case err.POSITION_UNAVAILABLE:
      return 'No se pudo obtener la señal GPS. Verifica que la ubicación esté activa.'
    case err.TIMEOUT:
      return 'Tiempo de espera de GPS agotado. Reintentando...'
    default:
      return 'Error de geolocalización. Inténtalo de nuevo.'
  }
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return new Date(s * 1000).toISOString().slice(11, 19)
}

function newSession(defaultSectionId = '39'): RouteSession {
  return {
    id: crypto.randomUUID(),
    districtId: '3',
    sectionId: defaultSectionId,
    state: 'idle',
    points: [],
    distanceMeters: 0,
    pausedDurationMs: 0
  }
}

/** GPS accuracy quality label */
function gpsQuality(accuracy: number): { label: string; className: string } {
  if (accuracy <= 10) return { label: 'Excelente', className: 'gps-excellent' }
  if (accuracy <= 30) return { label: 'Buena', className: 'gps-good' }
  if (accuracy <= 80) return { label: 'Regular', className: 'gps-fair' }
  return { label: 'Débil', className: 'gps-poor' }
}

export function TrackerPage() {
  const [session, setSession] = useState<RouteSession>(() => newSession(sections[0]?.id ?? '39'))
  const [watchId, setWatchId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState('00:00:00')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const lastSaveTimeRef = useRef<number>(0)
  const sessionRef = useRef<RouteSession>(session)
  sessionRef.current = session

  const selectedSection = sections.find((s) => s.id === session.sectionId) ?? sections[0]

  // Permissions hook
  const {
    permissions,
    requestGeolocation,
    requestNotifications,
    requestPersistentStorage,
    allCriticalGranted
  } = usePermissions()

  // Setup auto-sync on mount
  useEffect(() => {
    setupAutoSync()
  }, [])

  // Track online/offline status
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  /** Acquire Screen Wake Lock to prevent screen from sleeping during recording */
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch (e) {
      console.warn('[wakeLock] Failed:', e)
    }
  }, [])

  /** Release Screen Wake Lock */
  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  /** Lock orientation to portrait during recording */
  const lockOrientation = useCallback(() => {
    try {
      (screen.orientation as any)?.lock?.('portrait').catch(() => {})
    } catch {
      // Not supported on this platform
    }
  }, [])

  /** Unlock orientation */
  const unlockOrientation = useCallback(() => {
    try {
      (screen.orientation as any)?.unlock?.()
    } catch {
      // Not supported
    }
  }, [])

  const startGPS = useCallback(() => {
    if (!('geolocation' in navigator)) {
      const msg = 'Este dispositivo o navegador no soporta geolocalización.'
      setError(msg)
      showToast(msg, 'error')
      return
    }

    setError('')
    setGpsLoading(true)

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsLoading(false)
        setLastAccuracy(pos.coords.accuracy)

        const point: GPSPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          timestamp: pos.timestamp
        }

        setSession((current) => {
          if (current.state !== 'active') return current

          const result = appendPoint(current.points, point)
          if (result.addedMeters === 0 && current.points.length > 0) {
            return current
          }

          const next: RouteSession = {
            ...current,
            points: result.points,
            distanceMeters: current.distanceMeters + result.addedMeters
          }

          // Throttle database persistence (at most once every 5 seconds) to prevent GC pressure
          const now = Date.now()
          if (now - lastSaveTimeRef.current > 5000) {
            lastSaveTimeRef.current = now
            saveSession(next).catch(() => {})
          }

          return next
        })
      },
      (err) => {
        setGpsLoading(false)
        const humanMsg = humanizeGeoError(err)
        setError(humanMsg)
        showToast(humanMsg, 'error')

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Distrito 3 Tracker', {
            body: humanMsg,
            icon: '/favicon.svg'
          })
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    )

    setWatchId(id)
  }, [])

  const stopGPS = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      setWatchId(null)
    }
    setGpsLoading(false)
  }, [watchId])

  // Recover active/paused session from IndexedDB on mount
  useEffect(() => {
    const savedId = localStorage.getItem(ACTIVE_SESSION_KEY)
    if (!savedId) return

    getSession(savedId)
      .then((saved) => {
        if (saved && (saved.state === 'active' || saved.state === 'paused')) {
          setSession(saved)
          if (saved.state === 'active') {
            showToast('Recorrido activo reanudado. Reiniciando GPS…', 'info')
            startGPS()
            acquireWakeLock()
          } else {
            showToast('Recorrido pausado recuperado.', 'info')
          }
        } else {
          localStorage.removeItem(ACTIVE_SESSION_KEY)
        }
      })
      .catch(() => {
        localStorage.removeItem(ACTIVE_SESSION_KEY)
      })
  }, [acquireWakeLock, startGPS])

  // Live chronometer
  useEffect(() => {
    if (session.state === 'idle') {
      setElapsed('00:00:00')
      return
    }

    if (session.state === 'finished' || session.state === 'paused') {
      setElapsed(formatDuration(getActiveDurationMs(session)))
      return
    }

    setElapsed(formatDuration(getActiveDurationMs(session)))
    const id = setInterval(() => {
      setElapsed(formatDuration(getActiveDurationMs(sessionRef.current)))
    }, 1000)
    return () => clearInterval(id)
  }, [session.state, session.startedAt, session.finishedAt, session.pausedDurationMs, session.lastPausedAt])

  // Cleanup GPS watcher on unmount
  useEffect(() => {
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
    }
  }, [watchId])

  // Cleanup wake lock on unmount
  useEffect(() => {
    return () => {
      wakeLockRef.current?.release().catch(() => {})
    }
  }, [])

  // Re-acquire wake lock on visibility change
  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && session.state === 'active') {
        await acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [session.state, acquireWakeLock])

  const accept = async () => {
    requestPersistentStorage()
    if (permissions.notifications === 'prompt') {
      requestNotifications()
    }

    await acquireWakeLock()
    lockOrientation()

    const now = Date.now()
    const next: RouteSession = {
      ...session,
      state: 'active',
      acceptedAt: now,
      startedAt: now,
      pausedDurationMs: 0
    }

    localStorage.setItem(ACTIVE_SESSION_KEY, next.id)
    await saveSession(next)
    setSession(next)
    showToast('GPS activado. Grabando recorrido...', 'success')
    startGPS()
  }

  const pauseTracking = async () => {
    stopGPS()
    releaseWakeLock()

    const now = Date.now()
    const next: RouteSession = {
      ...session,
      state: 'paused',
      lastPausedAt: now
    }

    await saveSession(next)
    setSession(next)
    showToast('Recorrido en pausa', 'info')
  }

  const resumeTracking = async () => {
    await acquireWakeLock()
    lockOrientation()

    const now = Date.now()
    const pauseDelta = session.lastPausedAt ? now - session.lastPausedAt : 0
    const next: RouteSession = {
      ...session,
      state: 'active',
      pausedDurationMs: (session.pausedDurationMs ?? 0) + pauseDelta,
      lastPausedAt: undefined
    }

    await saveSession(next)
    setSession(next)
    showToast('Grabación GPS reanudada', 'success')
    startGPS()
  }

  const finish = async () => {
    stopGPS()
    setLastAccuracy(null)
    releaseWakeLock()
    unlockOrientation()

    const now = Date.now()
    let finalPausedDuration = session.pausedDurationMs ?? 0
    if (session.state === 'paused' && session.lastPausedAt) {
      finalPausedDuration += (now - session.lastPausedAt)
    }

    const finishedSession: RouteSession = {
      ...session,
      state: 'finished',
      finishedAt: now,
      pausedDurationMs: finalPausedDuration,
      lastPausedAt: undefined
    }

    // Clean up active session key immediately
    localStorage.removeItem(ACTIVE_SESSION_KEY)
    
    // Save to IndexedDB first
    await saveSession(finishedSession)
    setSession(finishedSession)
    setConfirmFinish(false)
    showToast('¡Recorrido finalizado y guardado con éxito!', 'success')

    // Trigger cloud sync cleanly
    syncSession(finishedSession).catch(() => {
      console.warn('[sync] Will retry when online')
    })
  }

  const reset = () => {
    localStorage.removeItem(ACTIVE_SESSION_KEY)
    setError('')
    setLastAccuracy(null)
    setSession(newSession(selectedSection?.id ?? '39'))
  }

  const handleExportGPX = () => {
    const xml = generateGPX(session, selectedSection?.name)
    const dateStr = session.startedAt
      ? new Date(session.startedAt).toISOString().slice(0, 10)
      : 'recorrido'
    downloadFile(`recorrido_sec${session.sectionId}_${dateStr}.gpx`, xml, 'application/gpx+xml')
    showToast('Archivo GPX descargado', 'success')
  }

  const chooseSection = (id: string) => setSession((s) => ({ ...s, sectionId: id }))

  const progressPercent = Math.min(
    100,
    Math.round(
      (session.distanceMeters / Math.max(selectedSection?.totalDistanceMeters ?? 1000, 1)) * 100
    )
  )

  const accuracyInfo = lastAccuracy !== null ? gpsQuality(lastAccuracy) : null

  return (
    <main className="screen" id="tracker-panel" role="tabpanel" aria-label="Tracker de recorridos">
      <header className="hero">
        <div>
          <span className="eyebrow">DISTRITO 3 CAMPECHE</span>
          <h1>Tracker GPS</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className={`connectivity-dot ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'En línea' : 'Sin conexión'} />
          <div className={`status-pill ${session.state}`}>
            <span className="status-dot" />
            <span>
              {session.state === 'active'
                ? 'Grabando'
                : session.state === 'paused'
                ? 'En Pausa'
                : session.state === 'finished'
                ? 'Finalizado'
                : 'Listo para iniciar'}
            </span>
          </div>
        </div>
      </header>

      {/* STATE 1: IDLE */}
      {session.state === 'idle' && (
        <section className="glass-card">
          <div className="section-selector-header">
            <span className="badge-chip">Paso 1 de 2</span>
            <h2>Selecciona tu sección</h2>
          </div>
          <p className="muted">
            Elige la sección electoral asignada para comenzar el rastreo en campo.
          </p>

          <label className="input-label" htmlFor="section-select">
            Sección Electoral
          </label>
          <div className="select-wrapper">
            <select
              id="section-select"
              className="section-select"
              value={session.sectionId}
              onChange={(e) => chooseSection(e.target.value)}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.neighborhoods?.length ? `(${s.neighborhoods[0]})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedSection?.neighborhoods?.length ? (
            <div className="neighborhoods-tags">
              <span className="tag-label">Colonias / Asentamientos:</span>
              <div className="tags-container">
                {selectedSection.neighborhoods.map((n) => (
                  <span key={n} className="pill-tag">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <button
            className="primary-btn glow-effect"
            onClick={() => setSession((s) => ({ ...s, state: 'pending_acceptance' }))}
          >
            <span>Continuar al recorrido</span>
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path
                fillRule="evenodd"
                d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </section>
      )}

      {/* STATE 2: PENDING ACCEPTANCE (with Permissions Gate) */}
      {session.state === 'pending_acceptance' && (
        <section className="glass-card center-card">
          <div className="icon-badge">📍</div>
          <span className="badge-chip">Paso 2 de 2</span>
          <h2>Confirmar inicio</h2>
          <p className="highlight-section">{selectedSection?.name}</p>

          {/* ── Permissions Checklist ── */}
          <div className="permissions-checklist">
            <span className="permissions-title">Permisos del dispositivo</span>

            {/* Geolocation */}
            <div className="permission-row">
              <span className="permission-icon">📍</span>
              <div className="permission-info">
                <span className="permission-name">Ubicación GPS</span>
                <span className="permission-desc">Rastrear tu recorrido en tiempo real</span>
              </div>
              {permissions.geolocation === 'granted' ? (
                <span className="perm-status perm-granted">✓</span>
              ) : permissions.geolocation === 'denied' ? (
                <span className="perm-status perm-denied">✕</span>
              ) : (
                <button className="perm-request-btn" onClick={requestGeolocation}>
                  Conceder
                </button>
              )}
            </div>

            {/* Wake Lock */}
            <div className="permission-row">
              <span className="permission-icon">🔆</span>
              <div className="permission-info">
                <span className="permission-name">Pantalla activa</span>
                <span className="permission-desc">Mantener pantalla encendida al grabar</span>
              </div>
              {permissions.wakeLock === 'available' ? (
                <span className="perm-status perm-granted">✓</span>
              ) : (
                <span className="perm-status perm-na">N/D</span>
              )}
            </div>

            {/* Persistent Storage */}
            <div className="permission-row">
              <span className="permission-icon">💾</span>
              <div className="permission-info">
                <span className="permission-name">Almacenamiento seguro</span>
                <span className="permission-desc">Evitar que el navegador borre tus datos</span>
              </div>
              {permissions.persistentStorage === true ? (
                <span className="perm-status perm-granted">✓</span>
              ) : permissions.persistentStorage === false ? (
                <button className="perm-request-btn" onClick={requestPersistentStorage}>
                  Conceder
                </button>
              ) : (
                <span className="perm-status perm-na">…</span>
              )}
            </div>

            {/* Notifications */}
            <div className="permission-row">
              <span className="permission-icon">🔔</span>
              <div className="permission-info">
                <span className="permission-name">Notificaciones</span>
                <span className="permission-desc">Alertas de pérdida de señal GPS</span>
              </div>
              {permissions.notifications === 'granted' ? (
                <span className="perm-status perm-granted">✓</span>
              ) : permissions.notifications === 'denied' ? (
                <span className="perm-status perm-denied">✕</span>
              ) : permissions.notifications === 'unavailable' ? (
                <span className="perm-status perm-na">N/D</span>
              ) : (
                <button className="perm-request-btn" onClick={requestNotifications}>
                  Conceder
                </button>
              )}
            </div>

            {permissions.geolocation === 'denied' && (
              <div className="perm-denied-hint">
                ⚠️ La ubicación fue denegada. Actívala manualmente en la configuración de tu
                navegador y recarga la página.
              </div>
            )}
          </div>

          <p className="muted">
            Se activará el sensor GPS de alta precisión en segundo plano para registrar tu ruta en
            esta sección.
          </p>

          <button
            className="primary-btn glow-effect"
            onClick={accept}
            disabled={!allCriticalGranted}
          >
            🚀 Aceptar y comenzar a grabar
          </button>
          {!allCriticalGranted && (
            <p className="muted" style={{ marginTop: '8px', fontSize: '12px' }}>
              Concede el permiso de ubicación para continuar
            </p>
          )}
          <button
            className="secondary-btn"
            onClick={() => setSession((s) => ({ ...s, state: 'idle' }))}
          >
            Volver a cambiar sección
          </button>
        </section>
      )}

      {/* STATE 3, 4 & 5: ACTIVE, PAUSED OR FINISHED */}
      {(session.state === 'active' || session.state === 'paused' || session.state === 'finished') && (
        <>
          {gpsLoading && (
            <div className="gps-loading" role="status" aria-live="polite">
              <div className="spinner" />
              Sincronizando señal GPS de alta precisión…
            </div>
          )}

          {/* GPS Quality Indicator */}
          {session.state === 'active' && accuracyInfo && (
            <div className={`gps-quality-bar ${accuracyInfo.className}`}>
              <span className="gps-quality-dot" />
              <span>
                Señal GPS: <strong>{accuracyInfo.label}</strong>
              </span>
              <span className="gps-accuracy-value">±{Math.round(lastAccuracy!)}m</span>
            </div>
          )}

          {session.state === 'paused' && (
            <div className="gps-quality-bar gps-fair">
              <span>⏸️ <strong>Grabación en Pausa</strong> — Pulsa reanudar cuando continúes caminando</span>
            </div>
          )}

          <section className="map-wrap glass-panel">
            <MapView points={session.points} showDistrict selectedSectionId={session.sectionId} />
            <div className="map-overlay-badge">
              <span>{selectedSection?.name}</span>
            </div>
          </section>

          {/* Live Metrics Grid */}
          <section className="metrics">
            <div className="metric-box">
              <span>Distancia</span>
              <b className="tabular-num">{formatDistance(session.distanceMeters)}</b>
            </div>
            <div className="metric-box">
              <span>Tiempo Activo</span>
              <b className="tabular-num text-glow">{elapsed}</b>
            </div>
            <div className="metric-box">
              <span>Puntos GPS</span>
              <b className="tabular-num">{session.points.length}</b>
            </div>
          </section>

          {/* Progress Card */}
          <section className="glass-card">
            <div className="row">
              <span className="card-subtitle">Estimado de avance</span>
              <b className="progress-value">{progressPercent}%</b>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i
                style={{ width: `${progressPercent}%` }}
                className={session.state === 'active' ? 'progress-active' : ''}
              />
            </div>
            <small className="muted progress-hint">
              {formatDistance(session.distanceMeters)} registrados en {selectedSection?.name}
            </small>
          </section>

          {/* POST-SESSION SUMMARY CARD (When finished) */}
          {session.state === 'finished' && (
            <section className="glass-card summary-card">
              <div className="summary-header">
                <span className="summary-check">✓</span>
                <div>
                  <h3>¡Recorrido guardado exitosamente!</h3>
                  <p className="muted">
                    {session.syncedAt
                      ? 'Datos respaldados en la nube ☁️'
                      : isOnline
                      ? 'Sincronizando con la nube…'
                      : 'Se sincronizará cuando haya internet'}
                  </p>
                </div>
              </div>

              <div className="summary-grid">
                <div className="summary-item">
                  <small>Distancia Total</small>
                  <strong>{formatDistance(session.distanceMeters)}</strong>
                </div>
                <div className="summary-item">
                  <small>Tiempo Total</small>
                  <strong>{elapsed}</strong>
                </div>
                <div className="summary-item">
                  <small>Velocidad Promedio</small>
                  <strong>{calculateAvgSpeed(session)}</strong>
                </div>
                <div className="summary-item">
                  <small>Muestras GPS</small>
                  <strong>{session.points.length} coords</strong>
                </div>
              </div>

              <div className="summary-actions">
                <button className="primary-btn glow-effect" onClick={handleExportGPX}>
                  📥 Descargar Archivo GPX
                </button>
                <button className="secondary-btn" onClick={reset}>
                  🔄 Iniciar otro recorrido
                </button>
              </div>
            </section>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          {/* Recording Controls (Pause / Resume / Finish) */}
          {session.state === 'active' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
              <button className="secondary-btn" style={{ margin: 0 }} onClick={pauseTracking}>
                ⏸️ Pausar
              </button>
              <button className="danger-btn glow-danger" style={{ margin: 0 }} onClick={() => setConfirmFinish(true)}>
                🛑 Finalizar
              </button>
            </div>
          )}

          {session.state === 'paused' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
              <button className="primary-btn glow-effect" style={{ margin: 0 }} onClick={resumeTracking}>
                ▶️ Reanudar
              </button>
              <button className="danger-btn glow-danger" style={{ margin: 0 }} onClick={() => setConfirmFinish(true)}>
                🛑 Finalizar
              </button>
            </div>
          )}
        </>
      )}

      {session.state === 'idle' && error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {/* Confirmation modal before ending route */}
      {confirmFinish && (
        <div className="confirm-overlay" onClick={() => setConfirmFinish(false)}>
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-icon">⚠️</div>
            <h3 id="confirm-title">¿Finalizar el recorrido?</h3>
            <p id="confirm-desc">
              Se detendrá el GPS y se guardará el recorrido con{' '}
              {formatDistance(session.distanceMeters)} y {session.points.length} puntos registrados.
            </p>
            <button className="danger-btn" onClick={finish}>
              Sí, finalizar y guardar
            </button>
            <button className="secondary-btn" onClick={() => setConfirmFinish(false)}>
              Continuar grabando
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
