import { useEffect, useState } from 'react'
import { getAllSessions, deleteSession, onDatabaseChange } from '../lib/db'
import { deleteSyncedSession } from '../lib/sync'
import { formatDistance, calculateAvgSpeed, generateGPX, downloadFile, getActiveDurationMs } from '../lib/geo'
import { sections } from '../data/sections'
import { MapView } from '../components/MapView'
import { showToast } from '../components/Toast'
import type { RouteSession } from '../types'

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return new Date(s * 1000).toISOString().slice(11, 19)
}

export function HistoryPage() {
  const [sessions, setSessions] = useState<RouteSession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<RouteSession | null>(null)
  const [sessionToDelete, setSessionToDelete] = useState<RouteSession | null>(null)

  const loadSessions = async () => {
    try {
      const data = await getAllSessions()
      setSessions(data)
    } catch (e) {
      showToast('Error al cargar el historial de sesiones', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
    const unsubscribe = onDatabaseChange(loadSessions)
    return () => unsubscribe()
  }, [])

  const handleDelete = async (id: string) => {
    try {
      await deleteSession(id)
      deleteSyncedSession(id) // Also remove from Supabase / offline queue
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (selectedSession?.id === id) setSelectedSession(null)
      setSessionToDelete(null)
      showToast('Recorrido eliminado del historial', 'info')
    } catch (e) {
      showToast('Error al eliminar la sesión', 'error')
    }
  }

  const handleExportGPX = (session: RouteSession) => {
    const sec = sections.find((s) => s.id === session.sectionId)
    const xml = generateGPX(session, sec?.name)
    const dateStr = session.startedAt
      ? new Date(session.startedAt).toISOString().slice(0, 10)
      : 'recorrido'
    downloadFile(`distrito3_sec${session.sectionId}_${dateStr}.gpx`, xml, 'application/gpx+xml')
    showToast('Archivo GPX descargado exitosamente', 'success')
  }

  // Summary statistics
  const totalDistance = sessions.reduce((acc, s) => acc + s.distanceMeters, 0)
  const totalPoints = sessions.reduce((acc, s) => acc + (s.points?.length || 0), 0)

  return (
    <main className="screen" id="history-panel" role="tabpanel" aria-label="Historial de recorridos">
      <header className="hero">
        <div>
          <span className="eyebrow">DISTRITO 3</span>
          <h1>Historial</h1>
        </div>
        <span className="status finished">{sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'}</span>
      </header>

      {/* Global summary metrics */}
      <section className="metrics">
        <div className="metric-box">
          <span>Recorridos</span>
          <b>{sessions.length}</b>
        </div>
        <div className="metric-box">
          <span>Distancia total</span>
          <b>{formatDistance(totalDistance)}</b>
        </div>
        <div className="metric-box">
          <span>Puntos GPS</span>
          <b>{totalPoints}</b>
        </div>
      </section>

      {loading ? (
        <div className="gps-loading" role="status">
          <div className="spinner" />
          Cargando historial…
        </div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📍</div>
          <h3>Sin recorridos grabados</h3>
          <p>Los recorridos que inicies en el Tracker se guardarán automáticamente aquí.</p>
        </div>
      ) : (
        <section className="history-list" aria-label="Lista de sesiones grabadas">
          {sessions.map((session) => {
            const sec = sections.find((s) => s.id === session.sectionId)
            const dateFormatted = session.startedAt
              ? new Intl.DateTimeFormat('es-MX', {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                }).format(new Date(session.startedAt))
              : 'Fecha no registrada'

            const activeMs = getActiveDurationMs(session)
            const durationFormatted = formatDuration(activeMs)

            return (
              <article key={session.id} className="history-card">
                <div className="history-card-header">
                  <div>
                    <span className="history-section-badge">{sec?.name ?? `Sección ${session.sectionId}`}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                      <span className="history-date">{dateFormatted}</span>
                      {session.syncedAt ? (
                        <span title="Respaldado en Supabase" style={{ fontSize: '11px', color: '#38bdf8' }}>☁️ En la nube</span>
                      ) : (
                        <span title="Guardado localmente" style={{ fontSize: '11px', color: '#94a3b8' }}>💾 Solo local</span>
                      )}
                    </div>
                  </div>
                  <span className={`status ${session.state}`}>
                    {session.state === 'active'
                      ? '● En curso'
                      : session.state === 'paused'
                      ? '⏸️ En pausa'
                      : '✓ Finalizado'}
                  </span>
                </div>

                <div className="history-stats-grid">
                  <div>
                    <small>Distancia</small>
                    <strong>{formatDistance(session.distanceMeters)}</strong>
                  </div>
                  <div>
                    <small>Duración</small>
                    <strong>{durationFormatted}</strong>
                  </div>
                  <div>
                    <small>Vel. Promedio</small>
                    <strong>{calculateAvgSpeed(session)}</strong>
                  </div>
                  <div>
                    <small>Puntos</small>
                    <strong>{session.points?.length || 0}</strong>
                  </div>
                </div>

                <div className="history-actions">
                  <button
                    className="history-btn primary-subtle"
                    onClick={() => setSelectedSession(session)}
                    aria-label={`Ver mapa del recorrido ${sec?.name || session.sectionId}`}
                  >
                    🗺️ Ver mapa
                  </button>
                  <button
                    className="history-btn secondary-subtle"
                    onClick={() => handleExportGPX(session)}
                    aria-label={`Exportar GPX del recorrido ${sec?.name || session.sectionId}`}
                  >
                    📥 GPX
                  </button>
                  <button
                    className="history-btn danger-subtle"
                    onClick={() => setSessionToDelete(session)}
                    aria-label={`Eliminar recorrido ${sec?.name || session.sectionId}`}
                  >
                    🗑️
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {/* Map modal preview */}
      {selectedSession && (
        <div className="confirm-overlay" onClick={() => setSelectedSession(null)}>
          <div className="modal-map-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {sections.find((s) => s.id === selectedSession.sectionId)?.name ?? `Sección ${selectedSession.sectionId}`}
              </h3>
              <button className="modal-close-btn" onClick={() => setSelectedSession(null)}>✕</button>
            </div>
            <div className="modal-map-wrap">
              <MapView
                points={selectedSession.points || []}
                showDistrict
                selectedSectionId={selectedSession.sectionId}
              />
            </div>
            <div className="modal-footer">
              <div>
                <span>{formatDistance(selectedSession.distanceMeters)}</span> · <span>{selectedSession.points?.length || 0} puntos GPS</span>
              </div>
              <button
                className="primary-btn glow-effect"
                style={{ width: 'auto', minHeight: '40px', margin: 0, padding: '0 18px', fontSize: '13px' }}
                onClick={() => handleExportGPX(selectedSession)}
              >
                📥 Exportar GPX
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {sessionToDelete && (
        <div className="confirm-overlay" onClick={() => setSessionToDelete(null)}>
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-title"
            aria-describedby="del-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-icon">⚠️</div>
            <h3 id="del-title">¿Eliminar este recorrido?</h3>
            <p id="del-desc">Esta acción eliminará permanentemente la sesión del almacenamiento local y de la nube.</p>
            <button className="danger-btn" onClick={() => handleDelete(sessionToDelete.id)}>
              Sí, eliminar
            </button>
            <button className="secondary-btn" onClick={() => setSessionToDelete(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
