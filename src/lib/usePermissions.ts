import { useState, useEffect, useCallback } from 'react'

export interface PermissionsState {
  geolocation: PermissionState | 'unavailable'
  wakeLock: 'available' | 'unavailable'
  persistentStorage: boolean | null
  notifications: PermissionState | 'unavailable'
}

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionsState>({
    geolocation: 'prompt',
    wakeLock: 'wakeLock' in navigator ? 'available' : 'unavailable',
    persistentStorage: null,
    notifications: 'Notification' in window ? ('default' as PermissionState) : 'unavailable'
  })
  const [checking, setChecking] = useState(true)

  // Query geolocation permission state
  useEffect(() => {
    if (!navigator.permissions) {
      setChecking(false)
      return
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        setPermissions((p) => ({ ...p, geolocation: status.state }))
        status.onchange = () => {
          setPermissions((p) => ({ ...p, geolocation: status.state }))
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  // Check notifications permission
  useEffect(() => {
    if ('Notification' in window) {
      setPermissions((p) => ({ ...p, notifications: Notification.permission as PermissionState }))
    }
  }, [])

  // Check persistent storage
  useEffect(() => {
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then((persisted) => {
        setPermissions((p) => ({ ...p, persistentStorage: persisted }))
      })
    }
  }, [])

  /** Triggers the browser's geolocation permission prompt */
  const requestGeolocation = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setPermissions((p) => ({ ...p, geolocation: 'granted' }))
          resolve(true)
        },
        () => {
          setPermissions((p) => ({ ...p, geolocation: 'denied' }))
          resolve(false)
        },
        { enableHighAccuracy: true, timeout: 15000 }
      )
    })
  }, [])

  /** Request push notifications permission */
  const requestNotifications = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false
    const result = await Notification.requestPermission()
    setPermissions((p) => ({ ...p, notifications: result as PermissionState }))
    return result === 'granted'
  }, [])

  /** Request persistent storage from the browser */
  const requestPersistentStorage = useCallback(async (): Promise<boolean> => {
    if (!navigator.storage?.persist) return false
    const granted = await navigator.storage.persist()
    setPermissions((p) => ({ ...p, persistentStorage: granted }))
    return granted
  }, [])

  const allCriticalGranted = permissions.geolocation === 'granted'

  return {
    permissions,
    checking,
    requestGeolocation,
    requestNotifications,
    requestPersistentStorage,
    allCriticalGranted
  }
}
