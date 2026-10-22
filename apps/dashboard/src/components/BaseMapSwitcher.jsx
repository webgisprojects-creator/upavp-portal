import { useState, useCallback, memo } from "react";
import streetThumb from "../assets/images/basemap-street.jpg";
import satelliteThumb from "../assets/images/basemap-satellite.jpg";
import hybridThumb from "../assets/images/basemap-hybrid.jpg";
import "../style/BaseMapSwitcher.css";

// Thumbnails are bundled (3 KB each) so the switcher never waits on a third-party server.
const THUMBS = {
  street: streetThumb,
  satellite: satelliteThumb,
  hybrid: hybridThumb,
};

// Floating base map switcher (bottom-right of the map). The same state is also exposed as the
// "Base Map" section of the Layers panel.
const BaseMapSwitcher = memo(function BaseMapSwitcher({
  basemaps = [],
  activeBasemap,
  onBasemapChange,
}) {
  const [expanded, setExpanded] = useState(false);

  const select = useCallback(
    (id) => {
      onBasemapChange?.(id);
      setExpanded(false);
    },
    [onBasemapChange]
  );

  const active = basemaps.find((b) => b.id === activeBasemap);

  return (
    <div className="basemap-switcher">
      {expanded && (
        <div className="basemap-options" role="radiogroup" aria-label="Base map">
          {basemaps.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={activeBasemap === id}
              className={`basemap-card ${activeBasemap === id ? "active" : ""}`}
              onClick={() => select(id)}
            >
              <img src={THUMBS[id]} alt="" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="basemap-main"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-label={`Base map: ${active?.label ?? ""}. Change base map`}
        title="Change base map"
      >
        <img src={THUMBS[activeBasemap]} alt="" />
        <span>{active?.label}</span>
      </button>
    </div>
  );
});

export default BaseMapSwitcher;
