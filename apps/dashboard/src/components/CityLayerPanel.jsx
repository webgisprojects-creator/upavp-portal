import { useEffect, useRef, useState } from 'react'

const cities = [
  { id: 'ayodhya', label: 'Bazar Purak Scheme-1, Ayodhya' },
  { id: 'barabanki', label: 'Obaree Awas Vikas Scheme, Barabanki' },
  { id: 'hardoi', label: 'Circular Road Awas Vikas Scheme, Hardoi' },
  { id: 'katra', label: 'Katra Road Awas Vikas Scheme, Pratapgarh' },
  { id: 'lucknow', label: ' Vrindavan Yojana, Lucknow' },
  { id: 'majhola', label: 'Majhola Awas Vikas Scheme-4, Moradabad' },

  { id: 'sikandra', label: 'Sikandra Awas Vikas Scheme, Agra' },
  { id: 'unnao', label: 'Unnao Awas Vikas Scheme-3, Unnao' },
]

function CitySelect({ city, onCityChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const selectedIndex = cities.findIndex((item) => item.id === city)

  useEffect(() => {
    if (isOpen) {
      containerRef.current
        ?.querySelectorAll('[role="option"]')
        [selectedIndex]?.focus()
    }
  }, [isOpen, selectedIndex])

  function focusOption(index) {
    const options = containerRef.current?.querySelectorAll('[role="option"]')
    options?.[Math.max(0, Math.min(index, cities.length - 1))]?.focus()
  }

  function handleKeyDown(event) {
    const options = Array.from(containerRef.current?.querySelectorAll('[role="option"]') ?? [])
    const activeIndex = options.indexOf(document.activeElement)

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
      } else {
        focusOption(activeIndex < 0 ? selectedIndex : activeIndex + 1)
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
      } else {
        focusOption(activeIndex < 0 ? selectedIndex : activeIndex - 1)
      }
    } else if (event.key === 'Home' && isOpen) {
      event.preventDefault()
      focusOption(0)
    } else if (event.key === 'End' && isOpen) {
      event.preventDefault()
      focusOption(cities.length - 1)
    }
  }

  return (
    <div
      className="layer-panel__city-select"
      ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false)
      }}
      onKeyDown={handleKeyDown}
    >
      <button
        aria-controls="city-select-options"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby="city-select-label"
        className="layer-panel__city-select-trigger"
        onClick={() => setIsOpen((open) => !open)}
        ref={triggerRef}
        type="button"
      >
        <span>{cities.find((item) => item.id === city)?.label.trim()}</span>
        <span aria-hidden="true" className="layer-panel__city-select-arrow" />
      </button>
      {isOpen && (
        <div
          className="layer-panel__city-options"
          id="city-select-options"
          role="listbox"
          aria-labelledby="city-select-label"
        >
          {cities.map((item) => (
            <button
              aria-selected={item.id === city}
              className="layer-panel__city-option"
              key={item.id}
              onClick={() => {
                onCityChange(item.id)
                setIsOpen(false)
                triggerRef.current?.focus()
              }}
              role="option"
              title={item.label.trim()}
              type="button"
            >
              {item.label.trim()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CityLayerPanel({
  city,
  layers,
  planningLayers,
  visibleLayers,
  propertyStatusEnabled,
  onPropertyStatusToggle,
  onCityChange,
  onLayerToggle,
  layerTransparency,
  onLayerTransparencyChange,
}) {
  return (
    <aside className="layer-panel" aria-label="Map locations and layers">
      <label className="layer-panel__city-label" id="city-select-label">
        Select city / scheme
      </label>
      <CitySelect city={city} onCityChange={onCityChange} />

      <div className="layer-panel__heading">
        <h2>Land Acquisition layers</h2>
        <span>{layers.length}</span>
      </div>
      <div className="layer-panel__layer-list">
        {layers.map((item) => {
          const supportsTransparency = item.id.includes('lulc')
          const transparency = layerTransparency[item.id] ?? 0

          return (
            <div className="layer-panel__layer-item" key={item.id}>
              <label className="layer-panel__layer">
                <input
                  type="checkbox"
                  checked={Boolean(visibleLayers[item.id])}
                  onChange={() => onLayerToggle(item.id)}
                />
                <span>{item.name}</span>
              </label>
              {supportsTransparency && (
                <label className="layer-panel__transparency">
                  <span>Transparency</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={transparency}
                    aria-label={`${item.name} transparency`}
                    onChange={(event) =>
                      onLayerTransparencyChange(item.id, Number(event.target.value))
                    }
                  />
                  <output>{transparency}%</output>
                </label>
              )}
            </div>
          )
        })}
      </div>
      <div className="layer-panel__heading">
        <h2>Planning & Development layers</h2>
        <span>{planningLayers.length}</span>
      </div>
      <div className="layer-panel__layer-list">
        {planningLayers.map((item) => {
          const supportsTransparency = item.id === 'vrindavan-layout'
          const transparency = layerTransparency[item.id] ?? 0

          return (
            <div className="layer-panel__layer-item" key={item.id}>
              <label className="layer-panel__layer">
                <input
                  type="checkbox"
                  checked={Boolean(visibleLayers[item.id])}
                  onChange={() => onLayerToggle(item.id)}
                />
                <span>{item.name}</span>
              </label>
              {supportsTransparency && (
                <label className="layer-panel__transparency">
                  <span>Transparency</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={transparency}
                    aria-label={`${item.name} transparency`}
                    onChange={(event) =>
                      onLayerTransparencyChange(item.id, Number(event.target.value))
                    }
                  />
                  <output>{transparency}%</output>
                </label>
              )}
              {supportsTransparency && visibleLayers[item.id] && (
                <label className="layer-panel__layer">
                  <input
                    type="checkbox"
                    checked={propertyStatusEnabled}
                    onChange={onPropertyStatusToggle}
                  />
                  <span>Property Status</span>
                </label>
              )}
            </div>
          )
        })}
      </div>
      <p className="layer-panel__hint">Select a city to load its published layers.</p>
    </aside>
  )
}

export default CityLayerPanel
