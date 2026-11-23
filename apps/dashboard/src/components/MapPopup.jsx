import { useState } from 'react'
import { filterLayoutPopupProperties } from '../lib/layoutPopup.js'
import '../style/MapPopup.css'

const propertyLabels = {
  shape_area: 'Area',
  village_na: 'Village Name',
  scheme_na: 'Scheme Name',
  area_in_ac: 'Area (acre)',
  area_in_ha: 'Area (hectare)',
  area_in_hec: 'Area (hectare)',
  vill_name: 'Village Name',
  yojana_num: 'Yojana Number',
  district_n: 'District Name',
  area_sq_m: 'Area (sq. m)',
  categoryna: 'Category Name',
  category_1: 'Category Name',
  schemename: 'Scheme Name',
  propertyty: 'Property Type',
  property_t: 'Property Type',
  propertyst: 'Property Status',
  layout_n: 'Layout Number',
  propertyno: 'Property Number',
  emoname: 'EMO Name',
  paidamount: 'Paid Amount',
}

function getPropertyLabel(key) {
  return (
    propertyLabels[key.toLowerCase()] ??
    key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )
}

function MapPopup({ popup, onClose }) {
  const [informationType, setInformationType] = useState('PEMS')

  return (
    <div
      className="map-popup"
      role="dialog"
      aria-label="Map feature information"
      style={{ display: popup ? 'block' : 'none' }}
    >
      {popup && (
        <>
          <div className="map-popup__header">
            <strong>Feature information</strong>
            <button
              className="map-popup__close"
              type="button"
              aria-label="Close popup"
              onClick={() => {
                setInformationType('PEMS')
                onClose()
              }}
            >
              ×
            </button>
          </div>
          <div className="map-popup__body" aria-live="polite">
            {popup.loading && <p className="map-popup__message">Loading feature details…</p>}
            {!popup.loading && popup.error && (
              <p className="map-popup__message map-popup__message--error">{popup.error}</p>
            )}
            {!popup.loading && !popup.error && popup.features.length === 0 && (
              <p className="map-popup__message">No features found at this location.</p>
            )}
            {!popup.loading &&
              !popup.error &&
              popup.features.map((feature, index) => {
                const isLayoutFeature = feature.layerName === 'Vrindavan Plot Layout'
                const properties = isLayoutFeature
                  ? filterLayoutPopupProperties(feature.properties, informationType)
                  : Object.entries(feature.properties).filter(
                      ([key]) => !['geometry', 'id', 'remarks'].includes(key.toLowerCase()),
                    )

                return (
                  <section className="map-popup__feature" key={`${feature.layerName}-${index}`}>
                    <div className="map-popup__feature-heading">
                      <h3>{feature.layerName}</h3>
                      {isLayoutFeature && (
                        <button
                          className="map-popup__mode-toggle"
                          type="button"
                          role="switch"
                          aria-checked={informationType === 'PEMS'}
                          aria-label={`Show ${informationType === 'PEMS' ? 'PEPO' : 'PEMS'} layout information`}
                          data-mode={informationType}
                          onClick={() =>
                            setInformationType((current) => (current === 'PEMS' ? 'PEPO' : 'PEMS'))
                          }
                        >
                          <span className="map-popup__mode-option">PEMS</span>
                          <span className="map-popup__mode-option">PEPO</span>
                        </button>
                      )}
                    </div>
                    {properties.length ? (
                      <dl>
                        {properties.map(([key, value]) => (
                          <div className="map-popup__property" key={key}>
                            <dt>{getPropertyLabel(key)}</dt>
                            <dd>{value == null || value === '' ? '—' : String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="map-popup__message">No attributes are available.</p>
                    )}
                  </section>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}

export default MapPopup
