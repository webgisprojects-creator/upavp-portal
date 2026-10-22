import LayerTool from "./tools/LayerTool";
import ExportTool from "./tools/ExportTool";
import MeasurementTool from "./tools/MeasurementTool";
import ChartTool from "./tools/ChartTool";
import FilterTool from "./tools/FilterTool";
import SearchTool from "./tools/SearchTool";
import RefreshTool from "./tools/RefreshTool";

import "../style/MapToolbar.css";

export default function MapToolbar({
  activeTool,
  onToolChange,
  onRefresh,
}) {
  const toggleTool = (tool) => {
    onToolChange(activeTool === tool ? null : tool);
  };

  return (
    <nav className="map-toolbar" aria-label="Map tools">
      <LayerTool
        active={activeTool === "layers"}
        onClick={() => toggleTool("layers")}
      />

      <ExportTool
        active={activeTool === "export"}
        onClick={() => toggleTool("export")}
      />

      <MeasurementTool
        active={activeTool === "measurement"}
        onClick={() => toggleTool("measurement")}
      />

      <ChartTool
        active={activeTool === "chart"}
        onClick={() => toggleTool("chart")}
      />

      <FilterTool
        active={activeTool === "filter"}
        onClick={() => toggleTool("filter")}
      />

      <SearchTool
        active={activeTool === "search"}
        onClick={() => toggleTool("search")}
      />

      <RefreshTool onClick={onRefresh} />
    </nav>
  );
}