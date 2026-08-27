import { openDB } from 'idb'
import type { RouteSession } from '../types'

const DB_NAME = 'distrito3-tracker'
const DB_VERSION = 2
const STORE_SESSIONS = 'sessions'
const STORE_PENDING_DELETES = 'pending_deletes'

type ChangeListener = () => void
const changeListeners = new Set<ChangeListener>()

export function onDatabaseChange(listener: ChangeListener): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

function notifyChange() {
  changeListeners.forEach((l) => {
    try {
      l()
    } catch (e) {
      console.warn('DB listener error:', e)
    }
  })
}

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion) {
    if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
      db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
    }
    if (!db.objectStoreNames.contains(STORE_PENDING_DELETES)) {
      db.createObjectStore(STORE_PENDING_DELETES, { keyPath: 'id' })
    }
  }
})

/**
 * Request persistent storage so the browser doesn't auto-purge IndexedDB
 * under storage pressure. Returns true if granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) {
    try {
      const granted = await navigator.storage.persist()
      return granted
    } catch {
      return false
    }
  }
  return false
}

/** Get storage usage estimate */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate()
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
  }
  return null
}

export async function saveSession(session: RouteSession): Promise<IDBValidKey> {
  const db = await dbPromise
  const res = await db.put(STORE_SESSIONS, session)
  notifyChange()
  return res
}

export async function getSession(id: string): Promise<RouteSession | undefined> {
  const db = await dbPromise
  return db.get(STORE_SESSIONS, id) as Promise<RouteSession | undefined>
}

export async function getAllSessions(): Promise<RouteSession[]> {
  const db = await dbPromise
  const sessions = await db.getAll(STORE_SESSIONS)
  // Sort most recent first
  return sessions.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
}

export async function deleteSession(id: string): Promise<void> {
  const db = await dbPromise
  await db.delete(STORE_SESSIONS, id)
  // Add to pending deletes in case we are offline
  await db.put(STORE_PENDING_DELETES, { id, timestamp: Date.now() })
  notifyChange()
}

export async function getPendingDeletes(): Promise<string[]> {
  const db = await dbPromise
  const records = await db.getAll(STORE_PENDING_DELETES)
  return records.map((r: { id: string }) => r.id)
}

export async function clearPendingDelete(id: string): Promise<void> {
  const db = await dbPromise
  await db.delete(STORE_PENDING_DELETES, id)
}

// Request persistent storage on module load
requestPersistentStorage()
