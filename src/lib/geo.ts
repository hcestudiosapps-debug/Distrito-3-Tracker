import type { GPSPoint, RouteSession } from '../types'

/**
 * Calculates distance between two GPS coordinates using Haversine formula
 */
export function distanceMeters(a: GPSPoint, b: GPSPoint): number {
  const R = 6371000 // Earth radius in meters
  const p1 = (a.lat * Math.PI) / 180
  const p2 = (b.lat * Math.PI) / 180
  const dp = ((b.lat - a.lat) * Math.PI) / 180
  const dl = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/**
 * Filters out inaccurate points (>80m accuracy) and negligible movement (<2m)
 */
export function appendPoint(points: GPSPoint[], point: GPSPoint): { points: GPSPoint[]; addedMeters: number } {
  const last = points[points.length - 1]
  if (!last) return { points: [point], addedMeters: 0 }
  if (point.accuracy > 80) return { points, addedMeters: 0 }
  const delta = distanceMeters(last, point)
  if (delta < 2) return { points, addedMeters: 0 }
  
  // Create shallow copy with pushed element to keep immutability for React state while minimizing allocations
  const newPoints = points.concat(point)
  return { points: newPoints, addedMeters: delta }
}

/**
 * Formats distance in meters or kilometers nicely
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`
  }
  return `${Math.round(meters)} m`
}

/**
 * Calculates total active duration in milliseconds excluding pauses
 */
export function getActiveDurationMs(session: RouteSession): number {
  if (!session.startedAt) return 0
  const end = session.finishedAt ?? (session.state === 'paused' && session.lastPausedAt ? session.lastPausedAt : Date.now())
  const totalElapsed = Math.max(0, end - session.startedAt)
  const pausedMs = session.pausedDurationMs ?? 0
  return Math.max(0, totalElapsed - pausedMs)
}

/**
 * Calculates average speed in km/h from a RouteSession
 */
export function calculateAvgSpeed(session: RouteSession): string {
  if (!session.startedAt || session.distanceMeters <= 0) return '0.0 km/h'
  const activeMs = getActiveDurationMs(session)
  const durationHours = Math.max(1, activeMs / 1000) / 3600
  const km = session.distanceMeters / 1000
  const speed = km / durationHours
  return `${speed.toFixed(1)} km/h`
}

/**
 * Generates standard GPX XML content from recorded RouteSession
 */
export function generateGPX(session: RouteSession, sectionName?: string): string {
  const name = sectionName ? `Recorrido - ${sectionName}` : `Recorrido Seccion ${session.sectionId}`
  const startTimeISO = session.startedAt ? new Date(session.startedAt).toISOString() : new Date().toISOString()
  
  const trkpts = session.points
    .map((p) => {
      const timeStr = new Date(p.timestamp).toISOString()
      return `      <trkpt lat="${p.lat}" lon="${p.lng}">
        <time>${timeStr}</time>
        ${p.speed !== null && p.speed !== undefined ? `<speed>${p.speed}</speed>` : ''}
      </trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Distrito 3 Tracker - Campeche" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${startTimeISO}</time>
    <desc>Distrito 3 Tracker - Seccion ${session.sectionId}. Distancia total: ${formatDistance(session.distanceMeters)}</desc>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
}

/**
 * Helper to trigger client-side file download
 */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
