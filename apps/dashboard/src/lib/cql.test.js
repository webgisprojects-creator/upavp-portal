import { describe, expect, it } from "vitest";
import { allotmentCql, landuseCql, sqlQuote } from "./cql";

const lists = {
  allotted: ["Alloted", "Allotted"],
  notAllotted: ["Not Allotted", "Vacant"],
  notSet: ["Select"],
  other: [],
};

describe("sqlQuote", () => {
  it("wraps a value in single quotes", () => {
    expect(sqlQuote("Brij Vihar")).toBe("'Brij Vihar'");
  });

  it("doubles embedded quotes so a value can never break out of the literal", () => {
    expect(sqlQuote("O'Brien")).toBe("'O''Brien'");
    expect(sqlQuote("'; DROP TABLE x; --")).toBe("'''; DROP TABLE x; --'");
  });
});

describe("allotmentCql", () => {
  it("filters one status with an IN list of the exact database spellings", () => {
    expect(allotmentCql(lists, { statuses: ["allotted"], scope: "All" })).toBe(
      "allotment IN ('Alloted','Allotted')"
    );
  });

  it("treats NULL as 'not set' (an IN list alone would never match NULL)", () => {
    expect(allotmentCql(lists, { statuses: ["notSet"], scope: "All" })).toBe(
      "(allotment IS NULL OR allotment IN ('Select'))"
    );
    expect(allotmentCql({ ...lists, notSet: [] }, { statuses: ["notSet"], scope: "All" })).toBe(
      "allotment IS NULL"
    );
  });

  it("combines statuses with OR when blank plots are counted as not allotted", () => {
    expect(allotmentCql(lists, { statuses: ["notAllotted", "notSet"], scope: "All" })).toBe(
      "(allotment IN ('Not Allotted','Vacant') OR (allotment IS NULL OR allotment IN ('Select')))"
    );
  });

  it("matches nothing (rather than producing invalid CQL) when a status has no values", () => {
    expect(allotmentCql(lists, { statuses: ["other"], scope: "All" })).toBe("1 = 0");
  });

  it("limits to a scheme, escaping the name", () => {
    expect(allotmentCql(lists, { statuses: ["allotted"], scope: "Brij Vihar" })).toBe(
      "allotment IN ('Alloted','Allotted') AND strTrim(scheme) = 'Brij Vihar'"
    );
    expect(allotmentCql(lists, { statuses: ["allotted"], scope: "King's" })).toContain("'King''s'");
  });

  it("limits to plots without a scheme", () => {
    expect(allotmentCql(lists, { statuses: ["allotted"], scope: "Unassigned" })).toBe(
      "allotment IN ('Alloted','Allotted') AND (scheme IS NULL OR strTrim(scheme) = '')"
    );
  });
});

describe("landuseCql", () => {
  const classes = [
    { name: "Residential", subs: [{ id: 0, sub: "Colony" }] },
    {
      name: "Vacant Land",
      subs: [
        { id: 1, sub: "Layout" },
        { id: 2, sub: "Private" },
        { id: 3, sub: "" },
      ],
    },
    { name: "Not specified", subs: [{ id: 4, sub: "" }] },
  ];

  it("returns undefined when nothing is selected", () => {
    expect(landuseCql(classes, new Set())).toBeUndefined();
  });

  it("uses a plain class condition when the whole class is ticked", () => {
    expect(landuseCql(classes, new Set([0]))).toBe("class = 'Residential'");
    expect(landuseCql(classes, new Set([1, 2, 3]))).toBe("class = 'Vacant Land'");
  });

  it("adds a sub-class condition for a partly ticked class", () => {
    expect(landuseCql(classes, new Set([1, 2]))).toBe(
      "class = 'Vacant Land' AND (sub_class IN ('Layout','Private'))"
    );
  });

  it("handles a blank sub-class inside a partly ticked class", () => {
    expect(landuseCql(classes, new Set([1, 3]))).toBe(
      "class = 'Vacant Land' AND (sub_class IN ('Layout') OR (sub_class IS NULL OR sub_class = ''))"
    );
  });

  it("handles the 'Not specified' class (blank class column)", () => {
    expect(landuseCql(classes, new Set([4]))).toBe("(class IS NULL OR class = '')");
  });

  it("joins several classes with OR, each in parentheses", () => {
    expect(landuseCql(classes, new Set([0, 4]))).toBe(
      "(class = 'Residential') OR ((class IS NULL OR class = ''))"
    );
  });
});
