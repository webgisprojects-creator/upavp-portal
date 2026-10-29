const basemaps = [
  { id: 'osm', label: 'OSM' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'satellite', label: 'Satellite' },
]

function BasemapSwitcher({ selectedBasemap, onBasemapChange }) {
  return (
    <div className="basemap-switcher" role="group" aria-label="Choose map style">
      <span className="basemap-switcher__label">Basemap</span>
      <div className="basemap-switcher__options">
        {basemaps.map((basemap) => (
          <button
            className="basemap-switcher__button"
            type="button"
            key={basemap.id}
            aria-pressed={selectedBasemap === basemap.id}
            onClick={() => onBasemapChange(basemap.id)}
          >
            {basemap.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default BasemapSwitcher
