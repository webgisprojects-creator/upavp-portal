import { useEffect, useState } from 'react'
import GeoJSON from 'ol/format/GeoJSON.js'
import { getArea } from 'ol/sphere.js'
import { LAYOUT_FIELDS, findSchemeField, normalizeFieldName } from '../config/layoutFields.js'

const geoserverWmsUrl =
  import.meta.env.VITE_GEOSERVER_WMS_URL?.trim() || '/geoserver/wms'
const geoserverWfsUrl = geoserverWmsUrl.replace(/\/wms(?=\?|$)/i, '/wfs')

const cityNames = {
  katra: 'Katra, Pratapgarh',
  majhola: 'Majhola, Moradabad',
  hardoi: 'Hardoi',
  ayodhya: 'Ayodhya',
  barabanki: 'Obaree, Barabanki',
  sikandra: 'Sikandra, Agra',
  unnao: 'Unnao',
  lucknow: 'Vrindavan Yojana, Lucknow',
}

const classColors = {
  'vrindavan yojana no.-1': '#5bc9ee',
  'vrindavan yojana no.-2': '#df2648',
  'vrindavan yojana no.-2, part- ii': '#4a38ec',
  'vrindavan yojana no.-2, part-i': '#7be61e',
  'vrindavan yojna no.- 3': '#e6c378',
  'vrindavan yojna no.-4': '#23c865',
  unspecified: '#eac7ec',
  agriculture: '#20db28',
  'agriculture land': '#20db28',
  'agricultural land': '#20db28',
  'atl campus': '#1e8ccb',
  'built-up': '#7b6cef',
  'built up': '#7b6cef',
  commercial: '#74dadd',
  educational: '#d0685a',
  industrial: '#c85e26',
  'industrial area': '#c85e26',
  mandi: '#abe570',
  others: '#9f3ecc',
  pond: '#40c7de',
  'power house': '#cc72ea',
  'primary school, khadra': '#d5565a',
  'public and semi public': '#7af2bb',
  'public utilities': '#e980aa',
  religious: '#ea963d',
  residential: '#dddb7a',
  road: '#dcd1d1',
  'solid waste management': '#0ecb8f',
  'state gov. property': '#c93f6b',
  'state government. property': '#ca69c8',
  street: '#d879a9',
  'vacant land': '#efd08b',
  vegetation: '#11a713',
  wastelands: '#358cd5',
  'water bodies': '#1db3d8',
  waterlogged: '#376de4',
  wetland: '#5eb1e2',
  canal: '#128ebf',
  'layout/plotted': '#78eadd',
  'over head tank': '#128ebf',
}

const propertyTypeColors = {
  'non residential': '#1376d2',
  residential: '#d363d5',
  vacant: '#915609',
  null: '#d7f5ab',
}

const propertyStatusColors = {
  alloted: '#18ced5',
  vacant: '#e18a13',
  'other or unspecified': '#e1c58f',
}

const fallbackColors = [
  '#3e5d9c',
  '#2f8a72',
  '#b38134',
  '#c14491',
  '#5966c2',
  '#7b8794',
]

function getClassColor(name, index, categoryProperty) {
  const normalizedName = name.trim().toLowerCase()
  if (categoryProperty === LAYOUT_FIELDS.propertyStatus && propertyStatusColors[normalizedName]) {
    return propertyStatusColors[normalizedName]
  }
  if (categoryProperty === LAYOUT_FIELDS.propertyType && propertyTypeColors[normalizedName]) {
    return propertyTypeColors[normalizedName]
  }
  if (classColors[normalizedName]) return classColors[normalizedName]
  if (normalizedName.includes('canal')) return classColors.canal
  if (normalizedName.includes('water') || normalizedName.includes('drain')) return '#376de4'
  return fallbackColors[index % fallbackColors.length]
}

function LulcChart({
  city,
  layer,
  categoryProperty = 'class',
  chartTitle = 'LULC by Class and Subclass',
  selectedCategory,
  onCategorySelect,
}) {
  const dataLabel = categoryProperty === 'class' ? 'LULC' : 'layout'
  const [chartState, setChartState] = useState({
    key: '',
    classes: [],
    categoryProperty: '',
    subclassProperty: '',
    error: '',
  })
  const requestKey = `${city}:${layer ?? ''}:${categoryProperty}`

  useEffect(() => {
    if (!layer) return undefined

    const controller = new AbortController()
    async function loadClasses() {
      try {
        const schemaParams = new URLSearchParams({
          service: 'WFS',
          version: '1.1.0',
          request: 'DescribeFeatureType',
          typeName: layer,
        })
        const schemaResponse = await fetch(`${geoserverWfsUrl}?${schemaParams}`, {
          signal: controller.signal,
        })
        const schemaText = await schemaResponse.text()
        if (!schemaResponse.ok) {
          throw new Error(`GeoServer returned HTTP ${schemaResponse.status}.`)
        }

        const schemaDocument = new DOMParser().parseFromString(schemaText, 'text/xml')
        const schemaError = schemaDocument.querySelector('parsererror, ServiceException')
        if (schemaError) {
          throw new Error(
            schemaError.textContent?.trim() || 'GeoServer returned an invalid feature schema.',
          )
        }
        const schemaProperties = Array.from(schemaDocument.getElementsByTagName('*'))
          .filter((element) => element.localName === 'element')
          .map((element) => element.getAttribute('name'))
          .filter(Boolean)
        const normalizedPropertyName = normalizeFieldName
        const resolvedCategoryProperty =
          categoryProperty === 'scheme'
            ? findSchemeField(schemaProperties)
            : categoryProperty
        if (!resolvedCategoryProperty) {
          throw new Error('The selected layer has no scheme name field in its published schema.')
        }
        const areaProperty = schemaProperties.find((name) => {
          const normalizedName = normalizedPropertyName(name)
          return (
            normalizedName === 'areainha' ||
            normalizedName === 'areainhec' ||
            normalizedName === 'areahec' ||
            normalizedName === 'areahectare' ||
            normalizedName === 'areahectares' ||
            normalizedName === 'area_ha'
          )
        })
        const geometryProperty =
          Array.from(schemaDocument.getElementsByTagName('*')).find((element) => {
            if (element.localName !== 'element') return false
            const type = element.getAttribute('type') ?? ''
            return /GeometryPropertyType|Multi.*PropertyType|PolygonPropertyType/i.test(type)
          })?.getAttribute('name') ?? ''
        const subclassProperty =
          schemaProperties.find((name) => {
            const normalizedName = normalizedPropertyName(name)
            return (
              normalizedName.startsWith('subclass') ||
              normalizedName.startsWith('subcategory')
            )
          }) ?? ''
        const params = new URLSearchParams({
          service: 'WFS',
          version: '1.1.0',
          request: 'GetFeature',
          typeName: layer,
          outputFormat: 'application/json',
          propertyName: [
            resolvedCategoryProperty,
            areaProperty,
            subclassProperty,
            geometryProperty,
          ]
            .filter(Boolean)
            .join(','),
          srsName: 'EPSG:4326',
          maxFeatures: '100000',
        })
        const response = await fetch(`${geoserverWfsUrl}?${params}`, {
          signal: controller.signal,
        })
        const responseText = await response.text()
        if (!response.ok) {
          throw new Error(`GeoServer returned HTTP ${response.status}.`)
        }

        const data = JSON.parse(responseText)
        if (!Array.isArray(data.features)) {
          throw new Error('GeoServer did not return LULC features.')
        }

        const features = new GeoJSON().readFeatures(data, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        })
        const totals = new Map()
        features.forEach((feature) => {
          const properties = feature.getProperties()
          const propertyValue = properties[resolvedCategoryProperty]
          let landUseClass =
            propertyValue == null || String(propertyValue).trim() === ''
              ? categoryProperty === LAYOUT_FIELDS.propertyType
                ? 'Null'
                : categoryProperty === LAYOUT_FIELDS.propertyStatus
                  ? 'Other or unspecified'
                  : 'Unspecified'
              : String(propertyValue).trim()
          if (categoryProperty === LAYOUT_FIELDS.propertyStatus) {
            const normalizedStatus = landUseClass.toLowerCase()
            landUseClass =
              normalizedStatus === 'alloted'
                ? 'Alloted'
                : normalizedStatus === 'vacant'
                  ? 'Vacant'
                  : 'Other or unspecified'
          }
          const subclass = subclassProperty
            ? String(properties[subclassProperty] ?? '').trim() || 'Unspecified'
            : ''
          const areaValue = areaProperty ? properties[areaProperty] : null
          const area = Number(areaValue)
          const areaInHectares =
            areaValue != null && areaValue !== '' && Number.isFinite(area)
              ? area
              : feature.getGeometry()
                ? getArea(feature.getGeometry(), { projection: 'EPSG:3857' }) / 10000
                : 0
          const classTotals = totals.get(landUseClass) ?? { area: 0, subclasses: new Map() }
          classTotals.area += areaInHectares
          if (subclassProperty) {
            classTotals.subclasses.set(
              subclass,
              (classTotals.subclasses.get(subclass) ?? 0) + areaInHectares,
            )
          }
          totals.set(landUseClass, classTotals)
        })

        const chartData = [...totals.entries()]
          .map(([name, { area, subclasses }]) => ({
            name,
            area,
            subclasses: [...subclasses.entries()]
              .map(([subclassName, subclassArea]) => ({
                name: subclassName,
                area: subclassArea,
              }))
              .sort((a, b) => b.area - a.area),
          }))
          .sort((a, b) => b.area - a.area)

        setChartState({
          key: requestKey,
          classes: chartData,
          categoryProperty: resolvedCategoryProperty,
          subclassProperty,
          error: '',
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setChartState({
          key: requestKey,
          classes: [],
          categoryProperty: '',
          subclassProperty: '',
          error: error instanceof Error ? error.message : 'Unable to load LULC statistics.',
        })
      }
    }

    loadClasses()
    return () => controller.abort()
  }, [categoryProperty, layer, requestKey])

  const isCurrentData = chartState.key === requestKey
  const classes = isCurrentData ? chartState.classes : []
  const resolvedCategoryProperty = isCurrentData
    ? chartState.categoryProperty
    : categoryProperty
  const subclassProperty = isCurrentData ? chartState.subclassProperty : ''
  const loading = Boolean(layer) && !isCurrentData
  const error = !layer
    ? `No ${dataLabel} layer is configured for this city.`
    : isCurrentData
      ? chartState.error
      : ''
  const totalArea = classes.reduce((total, item) => total + item.area, 0)
  const circumference = 2 * Math.PI * 68
  const chartSegments = classes.reduce((segments, { name, area }) => {
    const index = segments.length
    const offset = segments.at(-1)
    const segmentLength = totalArea > 0 ? (area / totalArea) * circumference : 0
    return [
      ...segments,
      {
        name,
        color: getClassColor(name, index, categoryProperty),
        offset: offset ? offset.offset + offset.segmentLength : 0,
        segmentLength,
      },
    ]
  }, [])

  return (
    <aside className="lulc-chart" aria-label={`${cityNames[city]} LULC chart`}>
      <div className="lulc-chart__header">
        <div>
          <h2>{chartTitle}</h2>
          <p>{cityNames[city]}</p><hr></hr>
           <p>Select a category to highlight its area on the map.</p>
        </div>
      </div>

      {loading && (
        <p className="lulc-chart__message">
          Loading {dataLabel === 'layout' ? 'layout' : 'city LULC'} data…
        </p>
      )}
      {!loading && error && (
        <p className="lulc-chart__message lulc-chart__message--error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && classes.length === 0 && (
        <p className="lulc-chart__message">
          No {dataLabel === 'layout' ? 'layout categories' : 'LULC classes'} found for this city.
        </p>
      )}
      {!loading && !error && classes.length > 0 && (
        <div className="lulc-chart__content">
          <div
            className="lulc-chart__donut"
            role="group"
            aria-label={`LULC areas by class, total ${totalArea.toFixed(1)} hectares`}
          >
            <svg viewBox="0 0 180 180" aria-hidden="true">
              <circle className="lulc-chart__donut-track" cx="90" cy="90" r="68" />
              {chartSegments.map(({ name, color, segmentLength, offset }) => (
                <circle
                  className="lulc-chart__donut-segment"
                  key={name}
                  cx="90"
                  cy="90"
                  r="68"
                  stroke={color}
                  strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                  strokeDashoffset={-offset}
                  role="button"
                  tabIndex={0}
                  aria-label={`Highlight map by ${name}`}
                  aria-pressed={
                    selectedCategory?.className === name &&
                    selectedCategory?.categoryProperty === resolvedCategoryProperty &&
                    selectedCategory?.layer === layer
                  }
                  style={{
                    cursor: 'pointer',
                    opacity:
                      selectedCategory &&
                      (selectedCategory.className !== name ||
                        selectedCategory.categoryProperty !== resolvedCategoryProperty ||
                        selectedCategory.layer !== layer)
                        ? 0.3
                        : 1,
                  }}
                  onClick={() =>
                    onCategorySelect({
                      className: name,
                      categoryProperty: resolvedCategoryProperty,
                      layer,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onCategorySelect({
                        className: name,
                        categoryProperty: resolvedCategoryProperty,
                        layer,
                      })
                    }
                  }}
                />
              ))}
            </svg>
            <div className="lulc-chart__donut-label">
              <strong>{totalArea.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>
              <span>hectares</span>
            </div>
          </div>

          <div className="lulc-chart__list">
            {classes.map(({ name, area, subclasses }, index) => (
              <div className="lulc-chart__group" key={name}>
                <button
                  className="lulc-chart__row"
                  type="button"
                  aria-label={`Highlight map by ${name}`}
                  aria-pressed={
                    selectedCategory?.className === name &&
                    !selectedCategory.subClassName &&
                    selectedCategory.categoryProperty === resolvedCategoryProperty &&
                    selectedCategory.layer === layer
                  }
                  onClick={() =>
                    onCategorySelect({
                      className: name,
                      categoryProperty: resolvedCategoryProperty,
                      layer,
                    })
                  }
                >
                  <span
                    className="lulc-chart__swatch"
                    style={{
                      backgroundColor: getClassColor(name, index, categoryProperty),
                    }}
                    aria-hidden="true"
                  />
                  <span className="lulc-chart__category" title={name}>{name}</span>
                  <span className="lulc-chart__area">
                    {area.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha
                  </span>
                </button>
                {subclassProperty && selectedCategory?.className === name &&
                  subclasses.map(({ name: subclassName, area: subclassArea }) => (
                    <button
                      className="lulc-chart__row lulc-chart__row--subclass"
                      key={`${name}:${subclassName}`}
                      type="button"
                      aria-label={`Highlight map by ${name}, subclass ${subclassName}`}
                      aria-pressed={
                        selectedCategory?.className === name &&
                        selectedCategory.subClassName === subclassName &&
                        selectedCategory.categoryProperty === resolvedCategoryProperty &&
                        selectedCategory.layer === layer
                      }
                      onClick={() =>
                        onCategorySelect({
                          className: name,
                          categoryProperty: resolvedCategoryProperty,
                          layer,
                          subClassName: subclassName,
                          subClassProperty: subclassProperty,
                        })
                      }
                    >
                      <span
                        className="lulc-chart__swatch"
                        style={{
                          backgroundColor: getClassColor(name, index, categoryProperty),
                        }}
                        aria-hidden="true"
                      />
                      <span className="lulc-chart__category" title={subclassName}>
                        {subclassName}
                      </span>
                      <span className="lulc-chart__area">
                        {subclassArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

export default LulcChart
