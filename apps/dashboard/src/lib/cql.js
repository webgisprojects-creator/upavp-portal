// CQL (GeoServer's filter language) builders used by the Summary Chart and the Landuse Filter.
// Pure functions - no React, no OpenLayers - so they can be unit-tested (see cql.test.js).

/** Quote a value as a CQL string literal ('O''Brien'). */
export const sqlQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;

/**
 * Filter for plots with the chosen allotment status(es), optionally limited to one scheme.
 *
 * @param {{allotted: string[], notAllotted: string[], notSet: string[], other: string[]}} lists
 *        exact database values per status (allotment is a free-text column: "Alloted", "Allotted" ...)
 * @param {{statuses: string[], scope: string}} selection scope is "All", "Unassigned" (no scheme) or a scheme name
 */
export function allotmentCql(lists, { statuses, scope }) {
  const inList = (status) =>
    lists[status].length > 0
      ? `allotment IN (${lists[status].map(sqlQuote).join(",")})`
      : "1 = 0";

  const part = (status) => {
    if (status !== "notSet") return inList(status);
    // "not set" also covers real NULLs, which an IN list can never match
    return lists.notSet.length > 0
      ? `(allotment IS NULL OR ${inList("notSet")})`
      : "allotment IS NULL";
  };

  let cql = statuses.length > 1 ? `(${statuses.map(part).join(" OR ")})` : part(statuses[0]);
  if (scope === "Unassigned") {
    cql += " AND (scheme IS NULL OR strTrim(scheme) = '')";
  } else if (scope !== "All") {
    cql += ` AND strTrim(scheme) = ${sqlQuote(scope)}`;
  }
  return cql;
}

/**
 * Filter for the landuse classes / sub-classes ticked in the Filter tool.
 *
 * @param {Array<{name: string, subs: Array<{id: number, sub: string}>}>} classes landuse-classes.json "classes"
 * @param {Set<number>} ids selected leaf ids
 * @returns {string|undefined} undefined when nothing is selected
 */
export function landuseCql(classes, ids) {
  const parts = [];
  classes.forEach((cls) => {
    const chosen = cls.subs.filter((sub) => ids.has(sub.id));
    if (chosen.length === 0) return;

    const classCondition =
      cls.name === "Not specified" ? "(class IS NULL OR class = '')" : `class = ${sqlQuote(cls.name)}`;
    if (chosen.length === cls.subs.length) {
      parts.push(classCondition); // whole class ticked: no sub-class condition needed
      return;
    }

    const named = chosen.filter((sub) => sub.sub !== "").map((sub) => sqlQuote(sub.sub));
    const subConditions = [];
    if (named.length > 0) subConditions.push(`sub_class IN (${named.join(",")})`);
    if (chosen.some((sub) => sub.sub === "")) subConditions.push("(sub_class IS NULL OR sub_class = '')");
    parts.push(`${classCondition} AND (${subConditions.join(" OR ")})`);
  });
  return parts.length > 1 ? parts.map((part) => `(${part})`).join(" OR ") : parts[0];
}
