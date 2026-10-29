import { useCallback, useMemo, useRef, useState } from 'react'
import { LAYOUT_FIELDS } from './config/layoutFields.js'
import { topFirst } from './config/layerOrder.js'
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
  lucknow: [],
}

const planningLayers = [
  {
    id: 'vrindavan-layout',
    name: 'Vrindavan Layout',
    layer: 'Planning:vrindavan_layout',
    zoomStyle: {
      threshold: 16,
      style: 'vrindavan_PropertyType_label_plot_cat',
      statusStyle: 'vrindavan_Alloted_label_plot_cat',
    },
  },
   { id: 'vrindavan-scheme-boundary', name: 'Vrindavan Scheme Boundary', layer: 'Planning:vrindavan scheme boundary' },
]

function App() {
  const [basemap, setBasemap] = useState('hybrid')
  const [city, setCity] = useState('katra')
  const [mapInstance, setMapInstance] = useState(null)
  const [zoomLevel, setZoomLevel] = useState(14.5)
  const previousZoomLevelRef = useRef(14.5)
  const [selectedLulcCategory, setSelectedLulcCategory] = useState('')
  const [propertyStatusEnabled, setPropertyStatusEnabled] = useState(false)
  const [visibleLayers, setVisibleLayers] = useState(() =>
    Object.fromEntries([
      ...cityLayers.katra.map(({ id }) => [id, true]),
      ...planningLayers.map(({ id }) => [id, true]),
    ]),
  )
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
  const chartCategoryProperty = isLayoutChart
    ? propertyStatusEnabled
      ? LAYOUT_FIELDS.propertyStatus
      : zoomLevel >= 16
        ? LAYOUT_FIELDS.propertyType
        : 'scheme'
    : 'class'

  const handleMapZoomChange = useCallback((nextZoom) => {
    const crossedThreshold = (previousZoomLevelRef.current >= 16) !== (nextZoom >= 16)
    if (crossedThreshold) {
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
    setVisibleLayers(
      Object.fromEntries([
        ...cityLayers[nextCity].map(({ id }) => [id, true]),
        ...planningLayers.map(({ id }) => [id, true]),
      ]),
    )
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
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default App
