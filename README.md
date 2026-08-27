# Distrito 3 Tracker

PWA de seguimiento GPS de recorridos de campo para las secciones electorales del Distrito 3, Campeche.

## Funcionalidades

- **Tracker GPS**: Selección de sección, confirmación, grabación GPS en tiempo real con cronómetro, barra de progreso y persistencia en IndexedDB.
- **Consulta**: Vista general del avance del distrito con mapa interactivo, filtros por estado (todas / completadas / pendientes) y detalle por sección.
- **Mapa**: Visualización de polígonos y líneas de secciones del distrito sobre OpenStreetMap vía Leaflet.
- **PWA**: Instalable como app, funciona offline tras la primera carga.
- **Recuperación de sesión**: Si el navegador se cierra durante un recorrido, la sesión activa se recupera automáticamente al recargar.

## Stack

| Componente | Tecnología |
|---|---|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 7 |
| Mapas | Leaflet 1.9 |
| Persistencia | IndexedDB (via `idb`) |
| PWA | `vite-plugin-pwa` (Workbox) |
| Backend | Ninguno — 100% client-side |

## Instalación y ejecución

1. Instala [Node.js LTS](https://nodejs.org/).
2. Clona el repositorio y abre una terminal en la carpeta del proyecto.
3. Instala dependencias:

```bash
npm install
```

4. Inicia el servidor de desarrollo:

```bash
npm run dev
```

5. Abre la URL que Vite muestre (normalmente `http://localhost:5173/`).

> **⚠️ No abras `index.html` con doble clic.** Este proyecto usa React + Vite + TypeScript. Abrir el HTML como `file://...` producirá una pantalla en blanco.

## Build para producción

```bash
npm run build
npm run preview
```

El contenido generado en `dist/` puede publicarse en GitHub Pages, Netlify, o cualquier hosting de archivos estáticos.

## Estructura del proyecto

```
├── docs/                       # Archivos fuente originales (KML)
├── public/
│   └── favicon.svg             # Favicon SVG
├── src/
│   ├── components/
│   │   └── MapView.tsx         # Componente de mapa Leaflet
│   ├── data/
│   │   ├── district3.geojson   # GeoJSON del distrito (producción)
│   │   ├── district3.geojson.d.ts
│   │   └── sections.ts        # Datos de las 24 secciones
│   ├── lib/
│   │   ├── db.ts               # IndexedDB (guardar/recuperar sesiones)
│   │   └── geo.ts              # Haversine, filtrado GPS, formato distancia
│   ├── pages/
│   │   ├── ConsultPage.tsx     # Vista de consulta del distrito
│   │   └── TrackerPage.tsx     # Vista principal de tracking GPS
│   ├── types/
│   │   └── index.ts            # Tipos TypeScript compartidos
│   ├── App.tsx                 # Shell con navegación por tabs
│   ├── main.tsx                # Entry point React
│   └── styles.css              # Estilos globales
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Datos

- El GeoJSON del Distrito 3 fue convertido desde el KML original (disponible en `docs/`).
- Las 24 secciones detectadas están en `src/data/sections.ts`.
- `totalDistanceMeters` es actualmente un placeholder de 1000m por sección. Se actualizará cuando se integre la red vial y/o Supabase.

## Publicar en GitHub Pages

La configuración usa `base: './'` para que los recursos funcionen bajo una URL de repositorio de GitHub Pages.

Para producción, publica el contenido generado en `dist/` usando GitHub Actions o el panel de GitHub Pages.
