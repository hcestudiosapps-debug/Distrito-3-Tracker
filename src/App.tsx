import { useState } from 'react'
import { TrackerPage } from './pages/TrackerPage'
import { ConsultPage } from './pages/ConsultPage'
import { HistoryPage } from './pages/HistoryPage'
import { ToastContainer } from './components/Toast'
import { InstallPrompt } from './components/InstallPrompt'
import './styles.css'

export default function App() {
  const [tab, setTab] = useState<'tracker' | 'consult' | 'history'>('tracker')

  return (
    <div className="app-shell">
      <ToastContainer />
      <InstallPrompt />

      <div className="content fade-in-tab" key={tab}>
        {tab === 'tracker' && <TrackerPage />}
        {tab === 'consult' && <ConsultPage />}
        {tab === 'history' && <HistoryPage />}
      </div>

      <nav className="bottom-nav" role="tablist" aria-label="Navegación principal">
        <button
          role="tab"
          aria-selected={tab === 'tracker'}
          aria-controls="tracker-panel"
          className={tab === 'tracker' ? 'selected' : ''}
          onClick={() => setTab('tracker')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Tracker</span>
        </button>

        <button
          role="tab"
          aria-selected={tab === 'consult'}
          aria-controls="consult-panel"
          className={tab === 'consult' ? 'selected' : ''}
          onClick={() => setTab('consult')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>Consulta</span>
        </button>

        <button
          role="tab"
          aria-selected={tab === 'history'}
          aria-controls="history-panel"
          className={tab === 'history' ? 'selected' : ''}
          onClick={() => setTab('history')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>Historial</span>
        </button>
      </nav>
    </div>
  )
}
