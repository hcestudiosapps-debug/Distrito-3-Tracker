import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GPSPoint } from '../types'
import district3 from '../data/district3.geojson'

interface Props {
  points: GPSPoint[]
  selectedSectionId?: string
  showDistrict?: boolean
  onSectionClick?: (sectionId: string) => void
  interactive?: boolean
}

export function MapView({
  points,
  selectedSectionId,
  showDistrict = false,
  onSectionClick,
  interactive = true
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const routeRef = useRef<L.Polyline | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const districtLayerRef = useRef<L.GeoJSON | null>(null)

  // Initialize Map with dark tiles
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const map = L.map(mapRef.current, {
      zoomControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive
    }).setView([19.825, -90.495], 13)

    if (interactive) {
      L.control.zoom({ position: 'topright' }).addTo(map)
    }

    // OpenStreetMap 100% free & open tiles with custom dark styling class
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      className: 'map-tiles-dark'
    }).addTo(map)

    mapInstance.current = map

    // Polyline for tracked GPS route
    routeRef.current = L.polyline([], {
      color: '#38bdf8',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: undefined
    }).addTo(map)

    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [interactive])

  // Update District 3 GeoJSON overlay
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    districtLayerRef.current?.remove()
    districtLayerRef.current = null
    if (!showDistrict) return

    const data = district3 as GeoJSON.FeatureCollection
    districtLayerRef.current = L.geoJSON(data, {
      filter: (feature) => {
        const kind = feature?.properties?.kind
        return kind === 'boundary' || kind === 'boundary-line'
      },
      style: (feature) => {
        const sid = feature?.properties?.sectionId
        const isSelected = sid === selectedSectionId

        return {
          color: isSelected ? '#38bdf8' : '#6366f1',
          weight: isSelected ? 3.5 : 1.5,
          fillColor: isSelected ? '#38bdf8' : '#4338ca',
          fillOpacity: isSelected ? 0.35 : 0.12,
          opacity: isSelected ? 1 : 0.75,
          dashArray: isSelected ? undefined : '3, 4'
        }
      },
      onEachFeature: (feature, layer) => {
        const sid = feature.properties?.sectionId as string | undefined
        if (sid) {
          layer.bindTooltip(`Sección ${sid}`, {
            permanent: false,
            direction: 'center',
            className: 'map-tooltip'
          })

          if (interactive) {
            layer.on('click', () => onSectionClick?.(sid))
            layer.on('mouseover', () => {
              if (sid !== selectedSectionId) {
                ;(layer as L.Path).setStyle({
                  fillOpacity: 0.25,
                  weight: 2.5
                })
              }
            })
            layer.on('mouseout', () => {
              if (sid !== selectedSectionId) {
                ;(layer as L.Path).setStyle({
                  fillOpacity: 0.12,
                  weight: 1.5
                })
              }
            })
          }
        }
      }
    }).addTo(map)

    if (points.length === 0) {
      if (selectedSectionId && districtLayerRef.current) {
        // Zoom to selected section bounds
        const sectionLayers: L.Layer[] = []
        districtLayerRef.current.eachLayer((l: any) => {
          if (l.feature?.properties?.sectionId === selectedSectionId) {
            sectionLayers.push(l)
          }
        })
        if (sectionLayers.length > 0) {
          const group = L.featureGroup(sectionLayers)
          const b = group.getBounds()
          if (b.isValid()) map.fitBounds(b.pad(0.15))
        }
      } else {
        const bounds = districtLayerRef.current.getBounds()
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.06))
      }
    }
  }, [showDistrict, selectedSectionId, onSectionClick, points.length, interactive])

  // Update Points and Live Pulsing Marker
  useEffect(() => {
    const map = mapInstance.current
    const route = routeRef.current
    if (!map || !route) return

    const latLngs = points.map((p) => [p.lat, p.lng] as [number, number])
    route.setLatLngs(latLngs)

    const last = points.at(-1)
    if (last) {
      markerRef.current?.remove()

      // Custom pulsing pulse HTML icon
      const pulseIcon = L.divIcon({
        className: 'gps-pulse-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        html: `
          <div class="pulse-ring"></div>
          <div class="pulse-core"></div>
        `
      })

      markerRef.current = L.marker([last.lat, last.lng], { icon: pulseIcon }).addTo(map)

      if (points.length === 1) {
        map.setView([last.lat, last.lng], 16)
      } else {
        map.panTo([last.lat, last.lng], { animate: true })
      }
    }
  }, [points])

  return <div ref={mapRef} className="map" aria-label="Mapa interactivo del Distrito 3" />
}
