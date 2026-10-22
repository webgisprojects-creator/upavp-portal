// Integrity checks for the generated data snapshots. If the database or the SLD colours change and
// someone regenerates the files (scripts/build-map-data.py), these tests catch a broken snapshot
// before it is deployed.
import { describe, expect, it } from "vitest";
import allotment from "./allotment-stats.json";
import classes from "./landuse-classes.json";
import labels from "./landuse-labels.json";
import legends from "./legends.json";
import plotAreas from "./plot-areas.json";

const HEX = /^#[0-9a-f]{6}$/i;
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

describe("allotment-stats.json", () => {
  it("counts every plot exactly once", () => {
    expect(sum(allotment.byScheme.All)).toBe(allotment.total);
    expect(sum(Object.fromEntries(allotment.values.map((v) => [v.value ?? "NULL", v.count])))).toBe(
      allotment.total
    );
  });

  it("per-scheme counts add up to the overall counts", () => {
    const schemes = Object.entries(allotment.byScheme).filter(([name]) => name !== "All");
    for (const status of ["allotted", "notAllotted", "notSet", "other"]) {
      const fromSchemes = schemes.reduce((acc, [, counts]) => acc + counts[status], 0);
      expect(fromSchemes).toBe(allotment.byScheme.All[status]);
    }
  });

  it("never lists the same database value under two statuses", () => {
    const seen = new Map();
    for (const [status, values] of Object.entries(allotment.lists)) {
      for (const value of values) {
        expect(seen.has(value), `"${value}" is in ${seen.get(value)} and ${status}`).toBe(false);
        seen.set(value, status);
      }
    }
  });
});

describe("landuse-classes.json", () => {
  const leaves = classes.classes.flatMap((c) => c.subs);

  it("has unique, contiguous leaf ids (the filter and the labels rely on them)", () => {
    expect(leaves.map((l) => l.id).sort((a, b) => a - b)).toEqual(leaves.map((_, i) => i));
  });

  it("class counts equal the sum of their sub-classes", () => {
    for (const c of classes.classes) {
      expect(c.count).toBe(c.subs.reduce((a, s) => a + s.count, 0));
    }
  });

  it("uses valid colours", () => {
    expect(HEX.test(classes.elseColor)).toBe(true);
    for (const l of leaves) expect(HEX.test(l.color), l.label).toBe(true);
  });
});

describe("landuse-labels.json", () => {
  it("points every label at an existing filter entry and a plausible location", () => {
    const ids = new Set(classes.classes.flatMap((c) => c.subs.map((s) => s.id)));
    for (const label of labels) {
      expect(ids.has(label.k), label.t).toBe(true);
      expect(label.x).toBeGreaterThan(77);
      expect(label.x).toBeLessThan(78);
      expect(label.y).toBeGreaterThan(28);
      expect(label.y).toBeLessThan(29);
    }
  });
});

describe("plot-areas.json", () => {
  it("has well-formed areas inside the Ghaziabad data extent", () => {
    expect(plotAreas.length).toBeGreaterThan(0);
    for (const area of plotAreas) {
      const [minX, minY, maxX, maxY] = area.bbox;
      expect(minX).toBeLessThanOrEqual(maxX);
      expect(minY).toBeLessThanOrEqual(maxY);
      expect(minX).toBeGreaterThan(77.3);
      expect(maxX).toBeLessThan(77.7);
      expect(area.plots).toBeGreaterThanOrEqual(10);
      expect(area.hull.type).toBeTruthy();
    }
  });
});

describe("legends.json", () => {
  it("has a valid colour for every plot-scheme and landuse entry", () => {
    for (const item of legends.plot) expect(HEX.test(item.color), item.label).toBe(true);
    for (const group of legends.landuse) {
      for (const item of group.items) expect(HEX.test(item.color), item.label).toBe(true);
    }
  });
});
