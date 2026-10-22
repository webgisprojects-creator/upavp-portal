import { FaTimes } from "react-icons/fa";

const TITLES = {
  layers: "Map Layers",
  export: "Export",
  measurement: "Measurement",
  chart: "Summary Chart",
  filter: "Filter Landuse",
  search: "Search Location",
};

export default function MapToolPanel({
  activeTool,
  onClose,
  children,
}) {
  if (!activeTool) return null;

  return (
    <section
      className={`map-tool-panel ${
        activeTool === "layers"
          ? "layer-sidebar"
          : activeTool === "measurement"
            ? "measurement-panel"
            : ""
      }`}
      aria-label={TITLES[activeTool]}
    >
      <div className="map-tool-panel-header">
        <h2>{TITLES[activeTool]}</h2>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
        >
          <FaTimes />
        </button>
      </div>

      <div className="map-tool-panel-body">
        {children ?? (
          <p>Select the settings for this tool here.</p>
        )}
      </div>
    </section>
  );
}