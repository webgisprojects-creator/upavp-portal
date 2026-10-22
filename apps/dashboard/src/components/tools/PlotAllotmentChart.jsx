import { useMemo, useState } from "react";
import stats from "../../data/allotment-stats.json";
import "../../style/PlotAllotmentChart.css";

// Colours: green = allotted, red = not allotted. Plots whose allotment is blank ("not set") are treated
// as not allotted and drawn in a lighter red so they stay visible as a part of it. Numbers and
// percentages are always printed next to the colours (never colour alone).
const STATUS = {
  allotted: { label: "Allotted", color: "#15803d" },
  notAllotted: { label: "Not allotted", color: "#dc2626" },
  notSet: { label: "Not set (blank)", color: "#f87171" },
  other: { label: "Other values (Park, Building ...)", color: "#d97706" },
};

const SIZE = 200;
const CENTRE = SIZE / 2;
const R_OUT = 88;
const R_IN = 54;

function polar(radius, angle) {
  return [CENTRE + radius * Math.sin(angle), CENTRE - radius * Math.cos(angle)];
}

function slicePath(start, end) {
  const [x0, y0] = polar(R_OUT, start);
  const [x1, y1] = polar(R_OUT, end);
  const [x2, y2] = polar(R_IN, end);
  const [x3, y3] = polar(R_IN, start);
  const large = end - start > Math.PI ? 1 : 0;
  return `M${x0} ${y0} A${R_OUT} ${R_OUT} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${R_IN} ${R_IN} 0 ${large} 0 ${x3} ${y3}Z`;
}

const percent = (count, total) => (total === 0 ? 0 : (count / total) * 100);
const formatPercent = (value) => (value > 0 && value < 0.1 ? "<0.1%" : `${value.toFixed(1)}%`);

export default function PlotAllotmentChart({ onShowOnMap, activeFilter, onClearFilter }) {
  const [scope, setScope] = useState("All");
  const [notSetIsNotAllotted, setNotSetIsNotAllotted] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);

  const counts = stats.byScheme[scope];
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  // the slices shown: with "not set counts as not allotted" on, the blank plots are merged into red
  const slices = useMemo(() => {
    const items = notSetIsNotAllotted
      ? [
          { key: "allotted", count: counts.allotted, statuses: ["allotted"] },
          {
            key: "notAllotted",
            count: counts.notAllotted + counts.notSet,
            statuses: ["notAllotted", "notSet"],
            note: `includes ${counts.notSet.toLocaleString()} with no allotment recorded`,
          },
          { key: "other", count: counts.other, statuses: ["other"] },
        ]
      : [
          { key: "allotted", count: counts.allotted, statuses: ["allotted"] },
          { key: "notAllotted", count: counts.notAllotted, statuses: ["notAllotted"] },
          { key: "notSet", count: counts.notSet, statuses: ["notSet"] },
          { key: "other", count: counts.other, statuses: ["other"] },
        ];
    let angle = 0;
    return items
      .filter((item) => item.count > 0)
      .map((item) => {
        const sweep = total === 0 ? 0 : (item.count / total) * Math.PI * 2;
        const slice = { ...item, ...STATUS[item.key], start: angle, end: angle + sweep, share: percent(item.count, total) };
        angle += sweep;
        return slice;
      });
  }, [counts, total, notSetIsNotAllotted]);

  const focus = slices.find((s) => s.key === hovered) ?? slices.find((s) => s.key === selected);
  const selectedSlice = slices.find((s) => s.key === selected);
  const dimmed = (key) => (hovered ?? selected) && (hovered ?? selected) !== key;

  const toggle = (key) => setSelected((current) => (current === key ? null : key));
  const onKey = (event, key) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(key);
    }
  };

  const scopeLabel = scope === "All" ? "all plots" : scope === "Unassigned" ? "plots with no scheme" : scope;

  return (
    <section className="plot-allotment-chart" aria-label="Plot allotment chart">
      <label className="allot-scope">
        <span>Show</span>
        <select
          value={scope}
          onChange={(event) => {
            setScope(event.target.value);
            setSelected(null);
          }}
        >
          {Object.keys(stats.byScheme).map((key) => (
            <option key={key} value={key}>
              {key === "All" ? "All plots" : key === "Unassigned" ? "Plots with no scheme" : key} (
              {Object.values(stats.byScheme[key]).reduce((a, b) => a + b, 0).toLocaleString()})
            </option>
          ))}
        </select>
      </label>

      <svg className="allot-donut" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={`Allotment status of ${scopeLabel}`}>
        {total === 0 && <circle cx={CENTRE} cy={CENTRE} r={(R_OUT + R_IN) / 2} fill="none" stroke="#e2e8f0" strokeWidth={R_OUT - R_IN} />}
        {slices.map((slice) =>
          slice.share > 99.99 ? (
            <circle
              key={slice.key}
              cx={CENTRE}
              cy={CENTRE}
              r={(R_OUT + R_IN) / 2}
              fill="none"
              stroke={slice.color}
              strokeWidth={R_OUT - R_IN}
              opacity={dimmed(slice.key) ? 0.4 : 1}
              tabIndex={0}
              role="button"
              aria-pressed={selected === slice.key}
              aria-label={`${slice.label}: ${slice.count.toLocaleString()} plots, ${formatPercent(slice.share)}`}
              onMouseEnter={() => setHovered(slice.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(slice.key)}
              onBlur={() => setHovered(null)}
              onClick={() => toggle(slice.key)}
              onKeyDown={(event) => onKey(event, slice.key)}
              className="allot-slice"
            />
          ) : (
            <path
              key={slice.key}
              d={slicePath(slice.start, slice.end)}
              fill={slice.color}
              opacity={dimmed(slice.key) ? 0.4 : 1}
              stroke="#ffffff"
              strokeWidth="1.5"
              tabIndex={0}
              role="button"
              aria-pressed={selected === slice.key}
              aria-label={`${slice.label}: ${slice.count.toLocaleString()} plots, ${formatPercent(slice.share)}`}
              onMouseEnter={() => setHovered(slice.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(slice.key)}
              onBlur={() => setHovered(null)}
              onClick={() => toggle(slice.key)}
              onKeyDown={(event) => onKey(event, slice.key)}
              className={`allot-slice${selected === slice.key ? " selected" : ""}`}
              transform={
                selected === slice.key
                  ? `translate(${Math.sin((slice.start + slice.end) / 2) * 4} ${-Math.cos((slice.start + slice.end) / 2) * 4})`
                  : undefined
              }
            />
          )
        )}
        <g className="allot-centre" pointerEvents="none">
          <text x={CENTRE} y={CENTRE - 10} className="allot-centre-label">
            {focus ? focus.label : "Plots"}
          </text>
          <text x={CENTRE} y={CENTRE + 11} className="allot-centre-count">
            {(focus ? focus.count : total).toLocaleString()}
          </text>
          <text x={CENTRE} y={CENTRE + 27} className="allot-centre-share">
            {focus ? formatPercent(focus.share) : scopeLabel}
          </text>
        </g>
      </svg>

      <div className="allot-legend" role="group" aria-label="Allotment status">
        {slices.map((slice) => (
          <button
            key={slice.key}
            type="button"
            className={`allot-legend-row${selected === slice.key ? " selected" : ""}${dimmed(slice.key) ? " dim" : ""}`}
            aria-pressed={selected === slice.key}
            onMouseEnter={() => setHovered(slice.key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(slice.key)}
            onBlur={() => setHovered(null)}
            onClick={() => toggle(slice.key)}
          >
            <span className="allot-legend-name">
              <i style={{ backgroundColor: slice.color }} />
              {slice.label}
            </span>
            <strong>
              {slice.count.toLocaleString()} ({formatPercent(slice.share)})
            </strong>
            <span className="allot-bar" aria-hidden="true">
              <span style={{ width: `${slice.share}%`, backgroundColor: slice.color }} />
            </span>
            {slice.note && <small>{slice.note}</small>}
          </button>
        ))}
      </div>

      <label className="allot-switch">
        <input type="checkbox" checked={notSetIsNotAllotted} onChange={(event) => { setNotSetIsNotAllotted(event.target.checked); setSelected(null); }} />
        Count plots with no allotment recorded as <em>not allotted</em>
      </label>

      <div className="allot-actions">
        <button
          type="button"
          className="allot-primary"
          disabled={!selectedSlice}
          onClick={() =>
            onShowOnMap?.({
              statuses: selectedSlice.statuses,
              scope,
              label: `${selectedSlice.label} - ${scopeLabel}`,
            })
          }
        >
          {selectedSlice ? `Show ${selectedSlice.count.toLocaleString()} ${selectedSlice.label.toLowerCase()} plots on the map` : "Click a slice to show those plots on the map"}
        </button>
        {activeFilter && (
          <button type="button" className="allot-secondary" onClick={onClearFilter}>
            Clear map filter ({activeFilter})
          </button>
        )}
      </div>

      <p className="plot-chart-footnote">
        Exact counts for all {stats.total.toLocaleString()} plots (database snapshot of {stats.generated}).
        Most blank plots are outside any scheme, so choose a scheme above for a like-for-like picture.
      </p>
    </section>
  );
}
