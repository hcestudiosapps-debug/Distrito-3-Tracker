import { useState, useMemo, useEffect } from 'react'
import { sections as baseSections } from '../data/sections'
import { formatDistance } from '../lib/geo'
import { MapView } from '../components/MapView'
import { getAllSessions, onDatabaseChange } from '../lib/db'
import type { RouteSession, SectionSummary } from '../types'

export function ConsultPage() {
  const [filter, setFilter] = useState<'all' | 'done' | 'pending'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [sessions, setSessions] = useState<RouteSession[]>([])

  const loadSessions = () => {
    getAllSessions()
      .then(setSessions)
      .catch(() => {})
  }

  // Load sessions on mount and subscribe to real-time database changes
  useEffect(() => {
    loadSessions()
    const unsubscribe = onDatabaseChange(loadSessions)
    return () => unsubscribe()
  }, [])

  // Calculate real progress per section from recorded sessions
  const sections: SectionSummary[] = useMemo(() => {
    // Group finished/active sessions by sectionId and sum distances
    const distanceBySectionId = new Map<string, number>()
    for (const s of sessions) {
      if (s.state === 'finished' || s.state === 'active' || s.state === 'paused') {
        const prev = distanceBySectionId.get(s.sectionId) ?? 0
        distanceBySectionId.set(s.sectionId, prev + s.distanceMeters)
      }
    }

    return baseSections.map((sec) => {
      const completed = distanceBySectionId.get(sec.id) ?? 0
      const total = sec.totalDistanceMeters
      const progress = Math.min(100, Math.round((completed / Math.max(total, 1)) * 100))
      return {
        ...sec,
        completedDistanceMeters: completed,
        progress
      }
    })
  }, [sessions])

  const filteredSections = useMemo(() => {
    return sections.filter((s) => {
      const matchesFilter =
        filter === 'all' || (filter === 'done' ? s.progress === 100 : s.progress < 100)
      const q = searchQuery.trim().toLowerCase()
      if (!q) return matchesFilter

      const matchesName = s.name.toLowerCase().includes(q) || s.id.includes(q)
      const matchesColonia = s.neighborhoods?.some((n) => n.toLowerCase().includes(q))
      return matchesFilter && (matchesName || matchesColonia)
    })
  }, [filter, searchQuery, sections])

  const overall = Math.round(
    sections.reduce((a, s) => a + s.progress, 0) / Math.max(sections.length, 1)
  )

  const completedCount = sections.filter((s) => s.progress === 100).length
  const current = sections.find((s) => s.id === selected)

  return (
    <main className="screen" id="consult-panel" role="tabpanel" aria-label="Consulta de secciones">
      <header className="hero">
        <div>
          <span className="eyebrow">DISTRITO 3 CAMPECHE</span>
          <h1>Consulta</h1>
        </div>
        <div className="overall-badge">
          <span className="overall-label">Distrito</span>
          <span className="big-percent">{overall}%</span>
        </div>
      </header>

      {/* Global District Overview Card */}
      <section className="glass-card">
        <div className="row">
          <div>
            <span className="card-subtitle">Cobertura Distrital</span>
            <h3 style={{ margin: '2px 0 0', fontSize: '18px' }}>24 Secciones Electorales</h3>
          </div>
          <span className="pill-tag">
            {completedCount} de {sections.length} completadas
          </span>
        </div>
        <div className="progress" style={{ margin: '14px 0 8px' }}>
          <i style={{ width: `${overall}%` }} />
        </div>
        <div className="metrics-compact">
          <span>{sections.length} Secciones totales</span>
          <span>·</span>
          <span>{sections.filter((s) => s.progress < 100).length} Pendientes</span>
          <span>·</span>
          <span>{sessions.length} Recorridos grabados</span>
        </div>
      </section>

      {/* Interactive Map */}
      <section className="map-wrap glass-panel">
        <MapView
          points={[]}
          showDistrict
          selectedSectionId={selected}
          onSectionClick={setSelected}
        />
        {selected && (
          <div className="map-overlay-badge">
            <span>Sección {selected} seleccionada</span>
          </div>
        )}
      </section>

      {/* Selected Section Details Card */}
      {current && (
        <section className="glass-card selected-detail-card">
          <div className="row">
            <div>
              <span className="history-section-badge">{current.name}</span>
              <h3 style={{ margin: '4px 0 0' }}>Detalle de Sección</h3>
            </div>
            <span className={`status ${current.progress === 100 ? 'finished' : current.progress > 0 ? 'active' : ''}`}>
              {current.progress}% avance
            </span>
          </div>

          {current.neighborhoods?.length ? (
            <div className="neighborhoods-tags" style={{ marginTop: '12px' }}>
              <span className="tag-label">Colonias / Asentamientos:</span>
              <div className="tags-container">
                {current.neighborhoods.map((n) => (
                  <span key={n} className="pill-tag">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="progress" style={{ marginTop: '14px' }}>
            <i style={{ width: `${current.progress}%` }} />
          </div>

          <div className="row" style={{ marginTop: '8px', fontSize: '12px', color: '#94a3b8' }}>
            <span>Completado: {formatDistance(current.completedDistanceMeters)}</span>
            <span>Meta: {formatDistance(current.totalDistanceMeters)}</span>
          </div>
        </section>
      )}

      {/* Search & Filter Controls */}
      <div className="search-filter-box">
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            className="search-input"
            placeholder="Buscar sección o colonia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Buscar sección o colonia"
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filters" role="group" aria-label="Filtrar por estado">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            Todas ({sections.length})
          </button>
          <button className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>
            Completadas ({completedCount})
          </button>
          <button
            className={filter === 'pending' ? 'active' : ''}
            onClick={() => setFilter('pending')}
          >
            Pendientes ({sections.length - completedCount})
          </button>
        </div>
      </div>

      {/* Grid of Sections */}
      {filteredSections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>Sin resultados</h3>
          <p>
            No se encontraron secciones que coincidan con la búsqueda o filtro seleccionado.
          </p>
        </div>
      ) : (
        <section className="section-grid" aria-label="Lista de secciones del Distrito 3">
          {filteredSections.map((s) => {
            const isSelected = selected === s.id
            return (
              <article
                className={`section-card ${isSelected ? 'selected' : ''}`}
                key={s.id}
                onClick={() => setSelected(s.id)}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                aria-label={`${s.name}, ${s.progress}% completado. Clic para enfocar en mapa.`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected(s.id)
                  }
                }}
              >
                <div className="row">
                  <div className="section-card-title">
                    <span className="section-num">{s.name}</span>
                    <span className="section-col-count">
                      {s.neighborhoods?.length || 0}{' '}
                      {(s.neighborhoods?.length || 0) === 1 ? 'colonia' : 'colonias'}
                    </span>
                  </div>
                  <span
                    className={`progress-badge ${s.progress === 100 ? 'badge-complete' : ''}`}
                  >
                    {s.progress}%
                  </span>
                </div>

                <div className="progress">
                  <i style={{ width: `${s.progress}%` }} />
                </div>

                <small className="section-col-text">
                  {s.neighborhoods?.join(' · ') || 'Sin colonias especificadas'}
                </small>
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}
