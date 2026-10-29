import { useEffect, useRef } from 'react'
import { unByKey } from 'ol/Observable.js'
import ScaleLine from 'ol/control/ScaleLine.js'
import { toLonLat } from 'ol/proj.js'

function MapInfoControl({ map }) {
  const controlRef = useRef(null)
  const coordinatesRef = useRef(null)
  const zoomLevelRef = useRef(null)
  const scaleLineRef = useRef(null)

  useEffect(() => {
    if (!map || !controlRef.current || !scaleLineRef.current) return undefined

    const mapTarget = map.getTargetElement()
    const view = map.getView()
    const scaleLine = new ScaleLine({
      target: scaleLineRef.current,
      units: 'metric',
      minWidth: 100,
    })
    map.addControl(scaleLine)

    const updateZoomLevel = () => {
      const zoom = view.getZoom()
      if (zoomLevelRef.current && zoom !== undefined) {
        zoomLevelRef.current.textContent = Number.isInteger(zoom) ? String(zoom) : zoom.toFixed(2)
      }
    }
    updateZoomLevel()

    const zoomKey = view.on('change:resolution', updateZoomLevel)
    const pointerKey = map.on('pointermove', (event) => {
      if (!coordinatesRef.current) return
      const [longitude, latitude] = toLonLat(event.coordinate, view.getProjection())
      coordinatesRef.current.textContent = `${latitude.toFixed(6)}°, ${longitude.toFixed(6)}°`
    })
    const pointerLeave = () => {
      if (coordinatesRef.current) {
        coordinatesRef.current.textContent = 'Move pointer over map for coordinates'
      }
    }
    mapTarget?.addEventListener('pointerleave', pointerLeave)

    return () => {
      unByKey([zoomKey, pointerKey])
      mapTarget?.removeEventListener('pointerleave', pointerLeave)
      map.removeControl(scaleLine)
    }
  }, [map])

  return (
    <div className="map-container__map-info" ref={controlRef} aria-label="Map information">
      <span className="map-container__coordinates" ref={coordinatesRef}>
        Move cursor over map for coordinates
      </span>
      <span className="map-container__zoom">
        Zoom <span ref={zoomLevelRef}>12.5</span>
      </span>
      <div className="map-container__scale" ref={scaleLineRef} aria-label="Map scale" />
    </div>
  )
}

export default MapInfoControl
