import { FaLayerGroup, FaEye, FaEyeSlash } from "react-icons/fa";
import ToolButton from "./ToolButton";

export default function LayerTool({
  panel = false,
  active,
  onClick,
  layers = [],
  onLayerChange,
  basemaps = [],
  activeBasemap,
  onBasemapChange,
  onOpacityChange,
  onZoomToLayer,
  onGoToScheme,
}) {
  // Toolbar icon
  if (!panel) {
    return (
      <ToolButton label="Layers" active={active} onClick={onClick}>
        <FaLayerGroup />
      </ToolButton>
    );
  }

  // Sidebar content
  return (
    <div className="layer-list">
      {basemaps.length > 0 && (
        <section className="basemap-section" aria-label="Base map">
          <h3 className="layer-section-title">Base Map</h3>
          <div className="basemap-choice" role="radiogroup" aria-label="Base map">
            {basemaps.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={activeBasemap === id}
                className={`basemap-choice-button ${activeBasemap === id ? "active" : ""}`}
                onClick={() => onBasemapChange?.(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      <h3 className="layer-section-title">Overlay Layers</h3>
      {layers.map(
        ({
          id,
          label,
          minZoom,
          enabled,
          opacity = 1,
          loading,
          belowMinZoom,
          legend,
          schemes,
          note,
        }) => (
        <div className="layer-row" key={id}>
          <span>
            {label}
            {enabled && loading && !belowMinZoom && (
              <small className="layer-loading" role="status">
                <span className="layer-spinner" aria-hidden="true" /> Loading…
              </small>
            )}
          </span>

          <button
            type="button"
            className="layer-eye-button"
            onClick={() => onLayerChange(id, !enabled)}
            aria-label={`${enabled ? "Hide" : "Show"} ${label}`}
            aria-pressed={enabled}
            title={enabled ? "Hide layer" : "Show layer"}
          >
            {enabled ? <FaEye /> : <FaEyeSlash />}
          </button>
          {(minZoom || note) && (
            <small className="layer-note">
              {note ?? `Visible at zoom level ${minZoom} or higher.`}
              {enabled && belowMinZoom && (
                <button
                  type="button"
                  className="layer-zoom-link"
                  onClick={() => onZoomToLayer?.(id)}
                >
                  Zoom in to show
                </button>
              )}
            </small>
          )}
          {enabled && (
            <label className="layer-opacity">
              <span>Opacity</span>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={Math.round(opacity * 100)}
                onChange={(event) =>
                  onOpacityChange?.(id, Number(event.target.value) / 100)
                }
                aria-label={`${label} opacity`}
              />
              <output>{Math.round(opacity * 100)}%</output>
            </label>
          )}
          {enabled && schemes && (
            <label className="layer-goto">
              <span>Go to scheme</span>
              <select
                defaultValue=""
                aria-label="Go to plot scheme"
                onChange={(event) => {
                  if (event.target.value) onGoToScheme?.(event.target.value);
                  event.target.value = "";
                }}
              >
                <option value="">Choose…</option>
                {schemes.map(({ value, label: optionLabel }) => (
                  <option key={value} value={value}>
                    {optionLabel}
                  </option>
                ))}
              </select>
            </label>
          )}
          {enabled && legend && (
            <details className="layer-legend">
              <summary>Legend</summary>
              {legend.items && (
                <ul>
                  {legend.items.map(({ label: name, color }) => (
                    <li key={name}>
                      <i className="legend-swatch" style={{ background: color }} />
                      {name}
                    </li>
                  ))}
                </ul>
              )}
              {legend.groups?.map(({ group, items }) => (
                <div className="legend-group" key={group}>
                  <strong>{group}</strong>
                  <ul>
                    {items.map(({ label: name, color }) => (
                      <li key={name}>
                        <i className="legend-swatch" style={{ background: color }} />
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          )}
        </div>
        )
      )}
    </div>
  );
}