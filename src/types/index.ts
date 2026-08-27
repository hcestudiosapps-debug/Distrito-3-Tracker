export type TrackerState = 'idle' | 'pending_acceptance' | 'active' | 'paused' | 'finished'

export interface GPSPoint {
  lat: number
  lng: number
  accuracy: number
  speed: number | null
  timestamp: number
}

export interface RouteSession {
  id: string
  districtId: string
  sectionId: string
  state: TrackerState
  startedAt?: number
  acceptedAt?: number
  finishedAt?: number
  pausedDurationMs?: number
  lastPausedAt?: number
  points: GPSPoint[]
  distanceMeters: number
  syncedAt?: number
}

export interface SectionSummary {
  id: string
  name: string
  progress: number
  totalDistanceMeters: number
  completedDistanceMeters: number
  neighborhoods?: string[]
}
