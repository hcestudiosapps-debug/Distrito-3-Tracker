import { supabase } from './supabase'
import { getAllSessions, saveSession, getPendingDeletes, clearPendingDelete } from './db'
import { showToast } from '../components/Toast'
import type { RouteSession } from '../types'

/** Convert local session to Supabase row (camelCase → snake_case) */
function toSupabaseRow(session: RouteSession) {
  return {
    id: session.id,
    district_id: session.districtId,
    section_id: session.sectionId,
    state: session.state,
    started_at: session.startedAt ?? null,
    accepted_at: session.acceptedAt ?? null,
    finished_at: session.finishedAt ?? null,
    points: session.points,
    distance_meters: session.distanceMeters
  }
}

/** Sync a single session to Supabase, returns true on success */
export async function syncSession(session: RouteSession): Promise<boolean> {
  if (!navigator.onLine) return false

  try {
    const row = toSupabaseRow(session)
    const { error } = await supabase.from('sessions').upsert(row, { onConflict: 'id' })

    if (error) {
      console.warn('[sync] Supabase upsert error:', error.message)
      return false
    }

    // Mark as synced locally
    const synced: RouteSession = { ...session, syncedAt: Date.now() }
    await saveSession(synced)
    return true
  } catch (e) {
    console.warn('[sync] Failed:', e)
    return false
  }
}

/** Sync pending deletes to Supabase */
export async function syncPendingDeletes(): Promise<void> {
  if (!navigator.onLine) return
  try {
    const pendingIds = await getPendingDeletes()
    for (const id of pendingIds) {
      const { error } = await supabase.from('sessions').delete().eq('id', id)
      if (!error) {
        await clearPendingDelete(id)
      }
    }
  } catch (e) {
    console.warn('[sync] Pending deletes sync failed:', e)
  }
}

/** Sync all unsynced sessions that are finished or active */
export async function syncAllPending(): Promise<number> {
  if (!navigator.onLine) return 0

  try {
    await syncPendingDeletes()

    const sessions = await getAllSessions()
    const unsynced = sessions.filter(
      (s) => !s.syncedAt && (s.state === 'active' || s.state === 'paused' || s.state === 'finished')
    )

    let count = 0
    for (const session of unsynced) {
      const ok = await syncSession(session)
      if (ok) count++
    }

    if (count > 0) {
      showToast(
        `${count} recorrido${count > 1 ? 's' : ''} respaldado${count > 1 ? 's' : ''} en la nube ☁️`,
        'success'
      )
    }

    return count
  } catch (e) {
    console.warn('[sync] Bulk sync failed:', e)
    return 0
  }
}

/** Delete a session from Supabase and clear pending delete store if successful */
export async function deleteSyncedSession(id: string): Promise<void> {
  if (!navigator.onLine) return
  try {
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (!error) {
      await clearPendingDelete(id)
    }
  } catch (e) {
    console.warn('[sync] Remote delete failed:', e)
  }
}

/** Set up auto-sync: sync pending when coming back online */
let listenerAttached = false
export function setupAutoSync() {
  if (listenerAttached) return
  listenerAttached = true

  window.addEventListener('online', () => {
    showToast('Conexión restablecida. Sincronizando…', 'info')
    syncAllPending()
  })

  // Initial sync on load
  if (navigator.onLine) {
    setTimeout(() => syncAllPending(), 1500)
  }
}
