import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LAYOUT_FIELDS } from './config/layoutFields.js'
import { topFirst } from './config/layerOrder.js'
import { readInitialCity, rememberCity } from './lib/cityStore.js'
import { loadLayoutCatalog } from './lib/layoutCatalog.js'
import { layoutFilter, schemeBoundaryFilter, sectorBoundaryFilter } from './lib/vrindavan.js'
import BasemapSwitcher from './components/BasemapSwitcher.jsx'
import CityLayerPanel from './components/CityLayerPanel.jsx'
import Footer from './components/Footer.jsx'
import Header from './components/Header.jsx'
import LulcChart from './components/LulcChart.jsx'
import MapContainer from './components/MapContainer.jsx'
import MapActionsToolbar from './components/MapActionsToolbar.jsx'
import './App.css'

const cityLayers = {
  katra: [
    { id: 'katra-lulc', name: 'Land use / land cover', layer: 'Landuse_LULC:lulc_katra' },
    { id: 'katra-cadastral', name: 'Cadastral map', layer: 'Landuse_LULC:cadastral_katra' },
    
    { id: 'katra-scheme', name: 'Scheme boundary', layer: 'Landuse_LULC:scheme_boundary_katra' },
    { id: 'katra-village', name: 'Village boundary', layer: 'Landuse_LULC:village_boundary_katra' },
  ],
  majhola: [
      { id: 'majhola-lulc', name: 'Land use / land cover', layer: 'Landuse_LULC:lulc_majhole' },
    { id: 'majhola-cadastral', name: 'Cadastral map', layer: 'Landuse_LULC:cadastral_majhole' },
    { id: 'majhola-scheme', name: 'Majhola scheme boundary', layer: 'Landuse_LULC:scheme_boundary_majhole' },
    { id: 'majhola-village', name: 'Majhola village boundary', layer: 'Landuse_LULC:village_boundary_majhole' },
  ],
  hardoi: [
     { id: 'hardoi-lulc', name: 'Land use / land cover', layer: 'Landuse_LULC:lulc_hardoi' },
    { id: 'hardoi-cadastral', name: 'Cadastral map', layer: 'Landuse_LULC:cadastral_hardoi' },
    { id: 'hardoi-scheme', name: 'Hardoi scheme boundary', layer: 'Landuse_LULC:scheme_boundary_hardoi' },
    { id: 'hardoi-village', name: 'Village boundary', layer: 'Landuse_LULC:village_boundary_hardoi' },
  ],
  ayodhya: [
      { id: 'ayodhya-lulc', name: 'Land use / land cover', layer: 'Landuse_LULC:lulc_ayodhya' },
    { id: 'ayodhya-cadastral', name: 'Cadastral map', layer: 'Landuse_LULC:cadastral_ayodhya' },
    { id: 'ayodhya-scheme', name: 'Scheme boundary', layer: 'Landuse_LULC:scheme_boundary_ayodhya' },
    { id: 'ayodhya-village', name: 'Village boundary', layer: 'Landuse_LULC:village_boundary_ayodhya' },
  ],
  barabanki: [
    { id: 'barabanki-lulc', name: 'Land use / land cover', layer: 'Landuse_LULC:lulc_barabanki' },
    { id: 'barabanki-cadastral', name: 'Cadastral map', layer: 'Landuse_LULC:cadastral_barabanki' },
    { id: 'barabanki-scheme', name: 'Scheme boundary', layer: 'Landuse_LULC:scheme_boundary_barabanki' },
    { id: 'barabanki-village', name: 'Village boundary', layer: 'Landuse_LULC:village_boundary_barabanki' },
  ],
  sikandra: [
    { id: 'sikandra-lulc', name: 'Land use / land cover', layer: 'Landuse_LULC:lulc_sikandra' },
    { id: 'sikandra-cadastral', name: 'Cadastral map', layer: 'Landuse_LULC:cadastral_sikandra' },
    { id: 'sikandra-railway', name: 'Railway line', layer: 'Landuse_LULC:railway_line_sikandra' },
    { id: 'sikandra-scheme', name: 'Scheme boundary', layer: 'Landuse_LULC:scheme_boundary_sikandra' },
    { id: 'sikandra-village', name: 'Village boundary', layer: 'Landuse_LULC:village_boundary_sikandra' },
  ],
  unnao: [
    { id: 'unnao-lulc', name: 'Land use / land cover', layer: 'Landuse_LULC:lulc_unnao' },
    { id: 'unnao-cadastral', name: 'Cadastral map', layer: 'Landuse_LULC:cadastral_unnao' },
    { id: 'unnao-scheme', name: 'Scheme boundary', layer: 'Landuse_LULC:scheme_boundary_unnao' },
    { id: 'unnao-village', name: 'Village boundary', layer: 'Landuse_LULC:village_boundary_unnao' },
  ],
  // Lucknow / Vrindavan "Land Acquisition layers" (workspace Planning). "Village Boundary" is the GIS team's styled
  // "vrindavan merge layer"; Dhara 28 / Dhara 32 are the two statutory outlines.
  lucknow: [
    {
      id: 'vrindavan-village-boundary',
      name: 'Village Boundary',
      layer: 'Planning:vrindavan merge layer',
    },
    { id: 'dhara-28', name: 'Dhara 28 Layer', layer: 'Planning:dhara28' },
    { id: 'dhara-32', name: 'Dhara 32 Layer', layer: 'Planning:dhara32' },
  ],
}

// Lucknow / Vrindavan "Planning & Development layers" (workspace Planning). `defaultVisible: false` = listed in the panel but
// switched on by the user (heavy or overlapping layers). The names are what the panel, legend and info popup show; GeoServer's own
// titles are just the table names.
const planningLayers = [
  {
    id: 'vrindavan-layout',
    name: 'Vrindavan Plot Layout',
    layer: 'Planning:vrindavan_layout',
    zoomStyle: {
      threshold: 16,
      style: 'vrindavan_PropertyType_label_plot_cat',
      statusStyle: 'vrindavan_Alloted_label_plot_cat',
    },
  },
  {
    id: 'vrindavan-sector6-landuse',
    name: 'Vrindavan Sector 6 Land Use',
    layer: 'Planning:vrindavan sector 6 landuse',
    defaultVisible: false,
  },
  { id: 'vrindavan-scheme-boundary', name: 'Vrindavan Scheme Boundary', layer: 'Planning:vrindavan scheme boundary' },
  { id: 'vrindavan-sector-boundary', name: 'Vrindavan Sector Boundary', layer: 'Planning:sector boundary' },
]

const planningDefaults = () =>
  planningLayers.map(({ id, defaultVisible }) => [id, defaultVisible !== false])

const defaultVisibility = (city) =>
  Object.fromEntries([...cityLayers[city].map(({ id }) => [id, true]), ...planningDefaults()])

// Cities whose plot layout can be narrowed by scheme (yojana) and sector. Lucknow has its own schema and its own layers; another city
// with several schemes adds its entry here (and its names to lib/vrindavan.js-style matching).
const LAYOUT_SCOPE_CITIES = ['lucknow']
const LAYOUT_LAYER = 'Planning:vrindavan_layout'
const SCHEME_BOUNDARY_LAYER = 'Planning:vrindavan scheme boundary'
const SECTOR_BOUNDARY_LAYER = 'Planning:sector boundary'

function App() {
  const [basemap, setBasemap] = useState('hybrid')
  const [city, setCity] = useState(() => readInitialCity(Object.keys(cityLayers))) // survives a refresh
  const [mapInstance, setMapInstance] = useState(null)
  const [zoomLevel, setZoomLevel] = useState(14.5)
  const previousZoomLevelRef = useRef(14.5)
  const zoomDependentChartRef = useRef(false) // true while the chart's categories change at zoom 16 (Vrindavan layout)
  const [selectedLulcCategory, setSelectedLulcCategory] = useState('')
  const [propertyStatusEnabled, setPropertyStatusEnabled] = useState(false)
  const [selectionLoading, setSelectionLoading] = useState(false)
  const [visibleLayers, setVisibleLayers] = useState(() => defaultVisibility(city))

  // ---- narrowing the plot layout by scheme (yojana) and sector -------------------------------------------------------------
  const hasLayoutScope = LAYOUT_SCOPE_CITIES.includes(city)
  const [layoutCatalog, setLayoutCatalog] = useState({ status: 'idle', catalog: null, error: '' })
  const [selectedSchemes, setSelectedSchemes] = useState(null) // null = every scheme is checked
  const [selectedSector, setSelectedSector] = useState(null) // null = all sectors
  const [focusRequest, setFocusRequest] = useState(null)
  const catalog = layoutCatalog.catalog
  const allSchemeKeys = useMemo(() => catalog?.schemes.map(({ key }) => key) ?? [], [catalog])
  const activeSchemeKeys = selectedSchemes ?? allSchemeKeys

  useEffect(() => {
    rememberCity(city)
  }, [city])

  useEffect(() => {
    if (!hasLayoutScope) return undefined
    const controller = new AbortController()
    setLayoutCatalog({ status: 'loading', catalog: null, error: '' })
    loadLayoutCatalog(LAYOUT_LAYER, controller.signal)
      .then((loaded) => setLayoutCatalog({ status: 'ready', catalog: loaded, error: '' }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLayoutCatalog({ status: 'error', catalog: null, error: error instanceof Error ? error.message : 'Unable to load the schemes.' })
        }
      })
    return () => controller.abort()
  }, [hasLayoutScope])

  // CQL filters per map layer: the plots of the checked schemes / the chosen sector, and ONLY their boundaries.
  const layerFilters = useMemo(() => {
    if (!hasLayoutScope || !catalog) return {}
    const filters = {
      'vrindavan-layout': layoutFilter(activeSchemeKeys, selectedSector, catalog),
      'vrindavan-scheme-boundary': schemeBoundaryFilter(activeSchemeKeys, catalog),
      'vrindavan-sector-boundary': sectorBoundaryFilter(selectedSector),
    }
    return Object.fromEntries(Object.entries(filters).filter(([, cql]) => cql))
  }, [hasLayoutScope, catalog, activeSchemeKeys, selectedSector])

  // Zoom to what was just selected: the sector's boundary, else the checked schemes' boundaries, else (nothing has a boundary) the
  // plots themselves. Everything checked again = back to the city view.
  function focusOnScope(keys, sector) {
    if (!catalog) return
    const targets = []
    if (sector !== null) {
      targets.push(
        { layer: SECTOR_BOUNDARY_LAYER, cql: sectorBoundaryFilter(sector) },
        { layer: LAYOUT_LAYER, cql: layoutFilter(keys, sector, catalog) },
      )
    } else if (keys.length > 0 && keys.length < allSchemeKeys.length) {
      targets.push(
        { layer: SCHEME_BOUNDARY_LAYER, cql: schemeBoundaryFilter(keys, catalog) },
        { layer: LAYOUT_LAYER, cql: layoutFilter(keys, null, catalog) },
      )
    }
    const backToCity = sector === null && keys.length === allSchemeKeys.length
    if (targets.length || backToCity) setFocusRequest({ id: Date.now(), targets, reset: backToCity })
  }

  function setSchemeSelection(keys) {
    setSelectedSchemes(keys.length === allSchemeKeys.length ? null : keys)
    setSelectedLulcCategory(null)
    focusOnScope(keys, selectedSector)
  }

  function handleSchemeToggle(key) {
    const next = new Set(activeSchemeKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSchemeSelection([...next])
  }

  function handleSectorSelect(value) {
    const sector = value === '' ? null : Number(value)
    setSelectedSector(sector)
    setSelectedLulcCategory(null)
    focusOnScope(activeSchemeKeys, sector)
  }

  const layoutScope = hasLayoutScope
    ? {
        status: layoutCatalog.status,
        error: layoutCatalog.error,
        catalog,
        selectedKeys: activeSchemeKeys,
        sector: selectedSector,
        onToggleScheme: handleSchemeToggle,
        onAllSchemes: () => setSchemeSelection(allSchemeKeys),
        onNoSchemes: () => setSchemeSelection([]),
        onSelectSector: handleSectorSelect,
      }
    : null
  const [layerTransparency, setLayerTransparency] = useState({})
  const layers = cityLayers[city]
  const activePlanningLayers = useMemo(() => (city === 'lucknow' ? planningLayers : []), [city])
  // Must keep the same identity between renders: the map re-syncs its WMS layers whenever this array changes,
  // and the zoom state below changes many times a second while the user zooms.
  const mapLayers = useMemo(() => [...layers, ...activePlanningLayers], [layers, activePlanningLayers])
  // the panel lists layers in the same order they are drawn on the map, topmost first
  const panelLayers = useMemo(() => topFirst(layers), [layers])
  const panelPlanningLayers = useMemo(() => topFirst(activePlanningLayers), [activePlanningLayers])
  const activeLayoutLayer = activePlanningLayers.find(
    ({ id }) => id === 'vrindavan-layout' && visibleLayers[id],
  )
  const selectedPlanningLayer = activeLayoutLayer
  const chartLayer = selectedPlanningLayer?.layer ??
    cityLayers[city].find(({ id }) => id.includes('lulc'))?.layer
  const isLayoutChart = Boolean(selectedPlanningLayer)
  zoomDependentChartRef.current = isLayoutChart
  const chartCategoryProperty = isLayoutChart
    ? propertyStatusEnabled
      ? LAYOUT_FIELDS.propertyStatus
      : zoomLevel >= 16
        ? LAYOUT_FIELDS.propertyType
        : 'scheme'
    : 'class'

  const handleMapZoomChange = useCallback((nextZoom) => {
    const crossedThreshold = (previousZoomLevelRef.current >= 16) !== (nextZoom >= 16)
    // Only the Vrindavan layout chart changes its categories at zoom 16 (scheme <-> property type), so only there does a
    // selection stop making sense. For the LULC charts this used to clear the selection right after it was made, because
    // zooming to the highlighted area crosses level 16.
    if (crossedThreshold && zoomDependentChartRef.current) {
      setSelectedLulcCategory(null)
    }
    previousZoomLevelRef.current = nextZoom
    // The zoom value only matters on which side of 16 it is. Re-rendering the whole page for every animation
    // frame of a zoom made the map and the chart redo their work for nothing.
    if (crossedThreshold) setZoomLevel(nextZoom)
  }, [])

  function handleCityChange(nextCity) {
    setCity(nextCity)
    setSelectedLulcCategory('')
    setPropertyStatusEnabled(false)
    setSelectedSchemes(null)
    setSelectedSector(null)
    setFocusRequest(null)
    setVisibleLayers(defaultVisibility(nextCity))
  }

  function handleLayerToggle(layerId) {
    setVisibleLayers((current) => ({ ...current, [layerId]: !current[layerId] }))
    if (planningLayers.some(({ id }) => id === layerId)) {
      setSelectedLulcCategory(null)
      if (layerId === 'vrindavan-layout') {
        setPropertyStatusEnabled(false)
      }
    }
  }

  function handleLayerTransparencyChange(layerId, transparency) {
    setLayerTransparency((current) => ({ ...current, [layerId]: transparency }))
  }

  function handleCategorySelect(category) {
    setSelectedLulcCategory((current) =>
      current?.className === category.className &&
      current?.subClassName === category.subClassName &&
      current?.categoryProperty === category.categoryProperty &&
      current?.layer === category.layer
        ? null
        : category,
    )
  }

  return (
    <div className="app-shell">
      <Header />
      <main className="main-content">
        <div className="map-toolbar">
          <MapActionsToolbar
            map={mapInstance}
            city={city}
            lulcLayer={cityLayers[city].find(({ id }) => id.includes('lulc'))?.layer}
            cadastralLayer={cityLayers[city].find(({ id }) => id.includes('cadastral'))?.layer}
            layoutLayer={activeLayoutLayer?.layer}
          />
          <BasemapSwitcher selectedBasemap={basemap} onBasemapChange={setBasemap} />
        </div>
        <div className="map-workspace">
          <CityLayerPanel
            city={city}
            layers={panelLayers}
            planningLayers={panelPlanningLayers}
            visibleLayers={visibleLayers}
            propertyStatusEnabled={propertyStatusEnabled}
            onPropertyStatusToggle={() => {
              setPropertyStatusEnabled((enabled) => !enabled)
              setSelectedLulcCategory(null)
            }}
            onCityChange={handleCityChange}
            onLayerToggle={handleLayerToggle}
            layerTransparency={layerTransparency}
            onLayerTransparencyChange={handleLayerTransparencyChange}
            layoutScope={layoutScope}
          />
          <MapContainer
            basemap={basemap}
            city={city}
            layers={mapLayers}
            visibleLayers={visibleLayers}
            layerTransparency={layerTransparency}
            selectedLulcCategory={selectedLulcCategory}
            propertyStatusEnabled={propertyStatusEnabled}
            onMapReady={setMapInstance}
            onZoomChange={handleMapZoomChange}
            onSelectionLoadingChange={setSelectionLoading}
            layerFilters={layerFilters}
            focusRequest={focusRequest}
          />
          <LulcChart
            city={city}
            layer={chartLayer}
            categoryProperty={chartCategoryProperty}
            chartTitle={
              isLayoutChart
                ? propertyStatusEnabled
                  ? 'Layout by Property Status'
                  : zoomLevel >= 16
                    ? 'Area by Property Type'
                    : 'Area by Scheme Name'
                : 'LULC by class'
            }
            selectedCategory={selectedLulcCategory}
            onCategorySelect={handleCategorySelect}
            highlightLoading={selectionLoading}
            cqlFilter={isLayoutChart ? layerFilters['vrindavan-layout'] ?? '' : ''}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default App
