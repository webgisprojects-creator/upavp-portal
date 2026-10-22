import { useEffect, useRef, useState } from "react";
import {
  escapeCqlString,
  fetchWfsFeatures,
  getPropertyValue,
  PLOT_LAYOUT_LAYER,
} from "../utils/geoserver";

export default function PlotSearch({ onSearch, onCancel }) {
  const schemeSuggestionRequestRef = useRef(0);
  const sectorRequestRef = useRef(0);
  const propertyRequestRef = useRef(0);
  const [schemeText, setSchemeText] = useState("");
  const [schemeSuggestions, setSchemeSuggestions] = useState([]);
  const [selectedScheme, setSelectedScheme] = useState("");
  const [sectors, setSectors] = useState([]);
  const [selectedSector, setSelectedSector] = useState("");
  const [plotProperties, setPlotProperties] = useState([]);
  const [selectedPlotId, setSelectedPlotId] = useState("");
  const [schemeSuggestionStatus, setSchemeSuggestionStatus] = useState("idle");
  const [sectorStatus, setSectorStatus] = useState("idle");
  const [plotPropertyStatus, setPlotPropertyStatus] = useState("idle");
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchMessage, setSearchMessage] = useState("");

  useEffect(() => {
    const prefix = schemeText.trim();
    if (prefix.length < 1) return undefined;

    const requestId = ++schemeSuggestionRequestRef.current;
    const timeoutId = window.setTimeout(async () => {
      try {
        const features = await fetchWfsFeatures({
          service: "WFS",
          version: "1.1.0",
          request: "GetFeature",
          typeName: PLOT_LAYOUT_LAYER,
          outputFormat: "application/json",
          maxFeatures: "500",
          propertyName: "scheme",
          CQL_FILTER: `scheme ILIKE '${escapeCqlString(prefix)}%' AND scheme IS NOT NULL`,
        });

        if (requestId !== schemeSuggestionRequestRef.current) return;

        const suggestions = Array.from(
          new Set(
            features
              .map(({ properties = {} }) =>
                getPropertyValue(properties, "scheme")
              )
              .filter((value) => value != null)
              .map((value) => String(value).trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));
        setSchemeSuggestions(suggestions);
        setSchemeSuggestionStatus("ready");
      } catch (error) {
        if (requestId !== schemeSuggestionRequestRef.current) return;
        setSchemeSuggestions([]);
        setSchemeSuggestionStatus("error");
        setSearchMessage(
          error instanceof Error
            ? `Scheme suggestions unavailable: ${error.message}`
            : "Scheme suggestions are unavailable."
        );
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      schemeSuggestionRequestRef.current += 1;
    };
  }, [schemeText]);

  useEffect(() => {
    const scheme = selectedScheme.trim();
    if (!scheme) return undefined;

    const requestId = ++sectorRequestRef.current;
    const timeoutId = window.setTimeout(async () => {
      setSectorStatus("loading");

      try {
        const features = await fetchWfsFeatures({
          service: "WFS",
          version: "1.1.0",
          request: "GetFeature",
          typeName: PLOT_LAYOUT_LAYER,
          outputFormat: "application/json",
          maxFeatures: "10000",
          propertyName: "scheme,sector",
          CQL_FILTER: `scheme ILIKE '${escapeCqlString(scheme)}' AND sector IS NOT NULL`,
        });

        if (requestId !== sectorRequestRef.current) return;

        const results = Array.from(
          new Set(
            features
              .map(({ properties = {} }) =>
                getPropertyValue(properties, "sector")
              )
              .filter((value) => value != null)
              .map((value) => String(value).trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        setSectors(results);
        setSectorStatus("ready");
        setSearchMessage(
          results.length === 0
            ? `No sectors found in "${scheme}".`
            : features.length >= 10000
              ? `Showing sectors from the first 10,000 records in "${scheme}".`
              : `${results.length} sector${results.length === 1 ? "" : "s"} found in "${scheme}".`
        );
      } catch (error) {
        if (requestId !== sectorRequestRef.current) return;
        setSectorStatus("error");
        setSearchMessage(
          error instanceof Error
            ? error.message
            : "Could not load sectors for this scheme."
        );
      }
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
      sectorRequestRef.current += 1;
    };
  }, [selectedScheme]);

  useEffect(() => {
    const scheme = selectedScheme.trim();
    const sector = selectedSector.trim();
    if (!scheme || !sector) return undefined;

    const requestId = ++propertyRequestRef.current;
    const timeoutId = window.setTimeout(async () => {
      setPlotPropertyStatus("loading");
      setPlotProperties([]);
      setSelectedPlotId("");

      try {
        const features = await fetchWfsFeatures({
          service: "WFS",
          version: "1.1.0",
          request: "GetFeature",
          typeName: PLOT_LAYOUT_LAYER,
          outputFormat: "application/json",
          maxFeatures: "10000",
          propertyName: "scheme,sector,prop_numb",
          CQL_FILTER: `scheme ILIKE '${escapeCqlString(scheme)}' AND sector ILIKE '${escapeCqlString(sector)}' AND prop_numb IS NOT NULL`,
        });

        if (requestId !== propertyRequestRef.current) return;

        const propertiesByNumber = new Map();
        features.forEach(({ id, properties = {} }) => {
          const propertyNumber = getPropertyValue(properties, "prop_numb");
          if (id == null || propertyNumber == null) return;

          const normalizedNumber = String(propertyNumber).trim();
          if (!normalizedNumber) return;

          const result = propertiesByNumber.get(normalizedNumber) ?? {
            value: normalizedNumber,
            propertyNumber: normalizedNumber,
            featureIds: [],
          };
          result.featureIds.push(String(id));
          propertiesByNumber.set(normalizedNumber, result);
        });

        const results = Array.from(propertiesByNumber.values()).sort((a, b) =>
          a.propertyNumber.localeCompare(b.propertyNumber, undefined, {
            numeric: true,
          })
        );
        setPlotProperties(results);
        setSelectedPlotId(results[0]?.value ?? "");
        setPlotPropertyStatus("ready");
        setSearchMessage(
          results.length === 0
            ? `No property numbers found in "${sector}" (${scheme}).`
            : features.length >= 10000
              ? `Showing the first 10,000 properties for "${sector}".`
              : `${results.length} property number${results.length === 1 ? "" : "s"} found in "${sector}".`
        );
      } catch (error) {
        if (requestId !== propertyRequestRef.current) return;
        setPlotPropertyStatus("error");
        setSearchMessage(
          error instanceof Error
            ? error.message
            : "Could not load property numbers for this sector."
        );
      }
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
      propertyRequestRef.current += 1;
    };
  }, [selectedScheme, selectedSector]);

  const handleSchemeChange = (event) => {
    const value = event.target.value;
    const match = schemeSuggestions.find(
      (scheme) => scheme.toLowerCase() === value.trim().toLowerCase()
    );
    propertyRequestRef.current += 1;
    sectorRequestRef.current += 1;
    setSchemeText(value);
    setSelectedScheme(match ?? "");
    if (value.trim().length === 0) setSchemeSuggestions([]);
    setSchemeSuggestionStatus(value.trim().length > 0 ? "loading" : "idle");
    setSectors([]);
    setSelectedSector("");
    setSectorStatus("idle");
    setPlotProperties([]);
    setSelectedPlotId("");
    setPlotPropertyStatus("idle");
    setSearchStatus("idle");
    setSearchMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const selectedPlot = plotProperties.find(
      ({ value }) => value === selectedPlotId
    );
    if (!selectedScheme || !selectedPlot) return;

    setSearchStatus("loading");
    setSearchMessage(`Loading ${selectedPlot.propertyNumber} from ${selectedScheme}...`);
    try {
      const message = await onSearch(selectedScheme, selectedPlot);
      setSearchMessage(message);
    } catch (error) {
      setSearchMessage(
        error instanceof Error ? error.message : "Could not search for the property."
      );
    } finally {
      setSearchStatus("idle");
    }
  };

  return (
    <>
      <p className="plot-search-subtitle">
        Search by Scheme, Sector and Property Number
      </p>
      <form className="plot-search-form" onSubmit={handleSubmit}>
        <label htmlFor="plot-scheme">Enter Scheme</label>
        <input
          id="plot-scheme"
          type="text"
          value={schemeText}
          onChange={handleSchemeChange}
          placeholder="Scheme name"
          autoComplete="off"
          list="plot-scheme-suggestions"
        />
        <datalist id="plot-scheme-suggestions">
          {schemeSuggestions.map((scheme) => (
            <option value={scheme} key={scheme} />
          ))}
        </datalist>

        {schemeSuggestionStatus === "loading" && (
          <p className="plot-search-help">Loading scheme suggestions...</p>
        )}
        <label htmlFor="plot-sector">Enter Sector</label>
        <select
          id="plot-sector"
          value={selectedSector}
          onChange={(event) => {
            propertyRequestRef.current += 1;
            setSelectedSector(event.target.value);
            setPlotProperties([]);
            setSelectedPlotId("");
            setPlotPropertyStatus("idle");
            setSearchMessage("");
          }}
          disabled={!selectedScheme || sectorStatus === "loading"}
        >
          <option value="">
            {!selectedScheme
              ? "Select a scheme first"
              : sectorStatus === "loading"
                ? "Loading sectors..."
                : "Select sector"}
          </option>
          {sectors.map((sector) => (
            <option value={sector} key={sector}>
              {sector}
            </option>
          ))}
        </select>
        {sectorStatus === "loading" && (
          <p className="plot-search-help">Loading sectors...</p>
        )}
        <label htmlFor="plot-property">Enter Property Number</label>
        <select
          id="plot-property"
          value={selectedPlotId}
          onChange={(event) => {
            setSelectedPlotId(event.target.value);
            setSearchMessage("");
          }}
          disabled={!selectedSector || plotPropertyStatus === "loading"}
        >
          <option value="">
            {!selectedSector
              ? "Select a sector first"
              : plotPropertyStatus === "loading"
                ? "Loading property numbers..."
                : "Select property number"}
          </option>
          {plotProperties.map(({ value, propertyNumber }) => (
            <option value={value} key={value}>
              {propertyNumber}
            </option>
          ))}
        </select>
        {searchMessage && (
          <p className="plot-search-message" role="status">
            {searchMessage}
          </p>
        )}
        <div className="plot-search-actions">
          <button
            type="submit"
            disabled={
              !selectedScheme ||
              !selectedSector ||
              !selectedPlotId ||
              searchStatus === "loading"
            }
          >
            {searchStatus === "loading" ? "Loading..." : "Search"}
          </button>
          <button
            className="plot-search-cancel"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
