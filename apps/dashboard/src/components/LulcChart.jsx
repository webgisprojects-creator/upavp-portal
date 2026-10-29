import { useEffect, useState } from 'react'
import GeoJSON from 'ol/format/GeoJSON.js'
import { getArea } from 'ol/sphere.js'
import { LAYOUT_FIELDS, findSchemeField, normalizeFieldName } from '../config/layoutFields.js'

const geoserverWmsUrl =
  import.meta.env.VITE_GEOSERVER_WMS_URL?.trim() || '/geoserver/wms'
const geoserverWfsUrl = geoserverWmsUrl.replace(/\/wms(?=\?|$)/i, '/wfs')

// Finished chart data, kept for the session: going back to a city (or re-opening a layer) is instant instead of a new download.
const CHART_CACHE_TTL_MS = 10 * 60 * 1000
const chartCache = new Map()

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

// Donut geometry (viewBox 180 x 180). Every slice is its OWN wedge-shaped path, so a click or hover only ever reaches the slice
// under the pointer. (Before, each slice was a full-circle outline with a dash pattern: browsers hit-test the whole ring, so a click
// on almost any slice selected the first one.)
const DONUT_CENTER = 90
const DONUT_OUTER = 80
const DONUT_INNER = 56

function polar(radius, fraction) {
  const angle = fraction * 2 * Math.PI - Math.PI / 2 // 0 = 12 o clock, clockwise
  return [DONUT_CENTER + radius * Math.cos(angle), DONUT_CENTER + radius * Math.sin(angle)]
}

function slicePath(start, rawEnd) {
  const end = Math.min(rawEnd, start + 0.9999) // a full circle cannot be drawn as one arc
  const large = end - start > 0.5 ? 1 : 0
  const [x0, y0] = polar(DONUT_OUTER, start)
  const [x1, y1] = polar(DONUT_OUTER, end)
  const [x2, y2] = polar(DONUT_INNER, end)
  const [x3, y3] = polar(DONUT_INNER, start)
  return `M${x0} ${y0} A${DONUT_OUTER} ${DONUT_OUTER} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${DONUT_INNER} ${DONUT_INNER} 0 ${large} 0 ${x3} ${y3} Z`
}

function LulcChart({
  city,
  layer,
  categoryProperty = 'class',
  chartTitle = 'LULC by Class and Subclass',
  selectedCategory,
  onCategorySelect,
  highlightLoading = false,
  cqlFilter = '',
}) {
  const [hovered, setHovered] = useState(null)
  const dataLabel = categoryProperty === 'class' ? 'LULC' : 'layout'
  const [chartState, setChartState] = useState({
    key: '',
    classes: [],
    categoryProperty: '',
    subclassProperty: '',
    error: '',
  })
  const requestKey = `${city}:${layer ?? ''}:${categoryProperty}:${cqlFilter}`

  useEffect(() => {
    if (!layer) return undefined

    const controller = new AbortController()
    async function loadClasses() {
      const cached = chartCache.get(requestKey)
      if (cached && Date.now() - cached.at < CHART_CACHE_TTL_MS) {
        setChartState(cached.state)
        return
      }
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
        // Areas come from an attribute column when the layer has one (LULC: area_in_ha) - then the geometry is not downloaded at
        // all (the Katra chart went from ~110 KB to a few KB). If that column is missing, empty or all zero (the Vrindavan
        // layout's area_sq_m is 0 for every plot) the geometry is fetched and measured instead.
        async function fetchChartData(withGeometry) {
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
              withGeometry ? geometryProperty : '',
            ]
              .filter(Boolean)
              .join(','),
            srsName: 'EPSG:4326',
            maxFeatures: '100000',
            ...(cqlFilter ? { CQL_FILTER: cqlFilter } : {}), // only the checked schemes / the chosen sector
          })
          const response = await fetch(`${geoserverWfsUrl}?${params}`, {
            signal: controller.signal,
          })
          const responseText = await response.text()
          if (!response.ok) {
            throw new Error(`GeoServer returned HTTP ${response.status}.`)
          }
          const parsed = JSON.parse(responseText)
          if (!Array.isArray(parsed.features)) {
            throw new Error('GeoServer did not return LULC features.')
          }
          return parsed
        }
        const areasUsable = (collection) =>
          collection.features.length > 0 &&
          collection.features.every(({ properties }) => {
            const value = properties?.[areaProperty]
            return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
          }) &&
          collection.features.some(({ properties }) => Number(properties[areaProperty]) > 0)
        let data = await fetchChartData(!areaProperty)
        if (areaProperty && !areasUsable(data)) data = await fetchChartData(true)

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

        const nextState = {
          key: requestKey,
          classes: chartData,
          categoryProperty: resolvedCategoryProperty,
          subclassProperty,
          error: '',
        }
        chartCache.set(requestKey, { at: Date.now(), state: nextState })
        setChartState(nextState)
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
  }, [categoryProperty, cqlFilter, layer, requestKey])

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
  let cursor = 0
  const slices = classes.map(({ name, area }, index) => {
    const fraction = totalArea > 0 ? area / totalArea : 0
    const slice = {
      name,
      area,
      fraction,
      color: getClassColor(name, index, categoryProperty),
      start: cursor,
      end: cursor + fraction,
    }
    cursor += fraction
    return slice
  })
  const isSelected = (name) =>
    selectedCategory?.className === name &&
    selectedCategory?.categoryProperty === resolvedCategoryProperty &&
    selectedCategory?.layer === layer
  const selectClass = (name) =>
    onCategorySelect({ className: name, categoryProperty: resolvedCategoryProperty, layer })
  const activeName =
    hovered ?? (selectedCategory && isSelected(selectedCategory.className) ? selectedCategory.className : null)
  const focused = slices.find(({ name }) => name === activeName)
  const hasSelection = classes.some(({ name }) => isSelected(name))

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
          {highlightLoading && (
            <p className="lulc-chart__busy" role="status">
              <span className="lulc-chart__spinner" aria-hidden="true" />
              Highlighting on the map…
            </p>
          )}
          <div
            className="lulc-chart__donut"
            role="group"
            aria-label={`LULC areas by class, total ${totalArea.toFixed(1)} hectares`}
          >
            <svg viewBox="0 0 180 180">
              <circle
                className="lulc-chart__donut-track"
                cx={DONUT_CENTER}
                cy={DONUT_CENTER}
                r={(DONUT_OUTER + DONUT_INNER) / 2}
              />
              {slices.map(({ name, area, fraction, color, start, end }) => (
                <path
                  className={`lulc-chart__slice${isSelected(name) ? ' is-selected' : ''}${
                    hasSelection && !isSelected(name) ? ' is-dimmed' : ''
                  }${activeName === name ? ' is-active' : ''}`}
                  key={name}
                  d={slicePath(start, end)}
                  fill={color}
                  role="button"
                  tabIndex={0}
                  aria-label={`Highlight map by ${name}`}
                  aria-pressed={isSelected(name)}
                  onClick={() => selectClass(name)}
                  onMouseEnter={() => setHovered(name)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(name)}
                  onBlur={() => setHovered(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectClass(name)
                    }
                  }}
                >
                  <title>{`${name}: ${area.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha (${(fraction * 100).toFixed(1)}%)`}</title>
                </path>
              ))}
            </svg>
            <div className="lulc-chart__donut-label" aria-live="polite">
              {focused ? (
                <>
                  <span className="lulc-chart__donut-name" title={focused.name}>{focused.name}</span>
                  <strong>{focused.area.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>
                  <span>ha · {(focused.fraction * 100).toFixed(1)}%</span>
                </>
              ) : (
                <>
                  <strong>{totalArea.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong>
                  <span>hectares</span>
                </>
              )}
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
                  onClick={() => selectClass(name)}
                  onMouseEnter={() => setHovered(name)}
                  onMouseLeave={() => setHovered(null)}
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
