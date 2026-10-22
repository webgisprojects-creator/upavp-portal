import { useEffect, useMemo, useRef, useState } from "react";
import landuse from "../../data/landuse-classes.json";
import "../../style/LanduseFilter.css";

const CLASSES = landuse.classes;
const ALL_IDS = CLASSES.flatMap((cls) => cls.subs.map((sub) => sub.id));
const COUNT_BY_ID = Object.fromEntries(
  CLASSES.flatMap((cls) => cls.subs.map((sub) => [sub.id, sub.count]))
);

// A class with a single entry (e.g. "Residential", or one whose sub-class is blank) is shown as one row.
const isSingle = (cls) => cls.subs.length === 1;

function TriCheckbox({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
      aria-label={label}
    />
  );
}

export default function LanduseFilter({ selectedIds, onApply, onClear }) {
  // the draft is edited freely; nothing changes on the map until "Show on map" is pressed
  const [draft, setDraft] = useState(() => new Set(selectedIds ?? ALL_IDS));
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      CLASSES.filter(
        (cls) =>
          !term ||
          cls.name.toLowerCase().includes(term) ||
          cls.subs.some((sub) => sub.label.toLowerCase().includes(term))
      ),
    [term]
  );

  const setMany = (ids, on) =>
    setDraft((current) => {
      const next = new Set(current);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const chosenPolygons = [...draft].reduce((sum, id) => sum + (COUNT_BY_ID[id] ?? 0), 0);
  const chosenClasses = CLASSES.filter((cls) => cls.subs.some((sub) => draft.has(sub.id))).length;
  const allChosen = draft.size === ALL_IDS.length;

  return (
    <section className="landuse-filter" aria-label="Landuse filter">
      <p className="lf-intro">
        Choose which landuse types to show. Untick the ones you do not need, then press <strong>Show on map</strong>.
      </p>

      <input
        type="search"
        className="lf-search"
        placeholder="Search a landuse type (e.g. school, park, industrial)"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search landuse types"
      />

      <div className="lf-quick">
        <button type="button" onClick={() => setMany(ALL_IDS, true)}>Select all</button>
        <button type="button" onClick={() => setMany(ALL_IDS, false)}>Clear all</button>
        <span>
          {chosenClasses} of {CLASSES.length} types
        </span>
      </div>

      <div className="lf-list">
        {visible.length === 0 && <p className="lf-empty">No landuse type matches "{search}".</p>}
        {visible.map((cls) => {
          const ids = cls.subs.map((sub) => sub.id);
          const on = ids.filter((id) => draft.has(id)).length;
          const header = (
            <>
              <TriCheckbox
                checked={on === ids.length}
                indeterminate={on > 0 && on < ids.length}
                onChange={(event) => setMany(ids, event.target.checked)}
                label={`Show ${cls.name}`}
              />
              <i className="lf-swatch" style={{ background: cls.color }} />
              <span className="lf-name">{cls.name}</span>
              <span className="lf-count">{cls.count.toLocaleString()}</span>
            </>
          );

          return isSingle(cls) ? (
            <label className="lf-class lf-single" key={cls.name}>
              {header}
            </label>
          ) : (
            <details className="lf-group" key={cls.name} open={Boolean(term)}>
              <summary className="lf-class">{header}</summary>
              <ul>
                {cls.subs.map((sub) => (
                  <li key={sub.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.has(sub.id)}
                        onChange={(event) => setMany([sub.id], event.target.checked)}
                      />
                      <i className="lf-swatch" style={{ background: sub.color }} />
                      <span className="lf-name">{sub.label}</span>
                      <span className="lf-count">{sub.count.toLocaleString()}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>

      <div className="lf-actions">
        <button
          type="button"
          className="lf-primary"
          disabled={draft.size === 0}
          onClick={() => onApply(allChosen ? null : new Set(draft))}
        >
          {draft.size === 0
            ? "Choose at least one landuse type"
            : allChosen
              ? "Show all landuse on the map"
              : `Show on map (${chosenPolygons.toLocaleString()} areas, ${chosenClasses} types)`}
        </button>
        {selectedIds && (
          <button type="button" className="lf-secondary" onClick={onClear}>
            Clear filter - show everything
          </button>
        )}
      </div>

      <p className="lf-note">
        Areas whose sub-class was never filled in are drawn in the style's fall-back colour (teal) and are
        labelled with their class name.
      </p>
    </section>
  );
}
