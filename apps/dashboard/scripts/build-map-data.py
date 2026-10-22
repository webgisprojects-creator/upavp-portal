"""Regenerate the small data files the dashboard uses for orientation + labels.

    python apps/dashboard/scripts/build-map-data.py     (from the repository root; needs ssh access to db-primary)

Writes src/data/:
  plot-areas.json      plots grouped by scheme (and spatial cluster): outline, bbox, plot count
                       -> clickable "where are the plots" areas shown when zoomed out + the Go-to-scheme list
  landuse-labels.json  one label point per landuse polygon (real name when present, else sub-class)
                       -> map labels without any GeoServer round trip
  legends.json         plot-scheme and landuse legends (colour + name) read from the GeoServer SLDs
  landuse-classes.json landuse class -> sub-class tree with counts + colours (Filter tool); labels carry a leaf id
  allotment-stats.json exact allotment counts for ALL plots (overall + per scheme) for the Summary Chart,
                       plus the raw values per category so the chart can filter the map (CQL)

Re-run after the plot/landuse data or the SLD colours change.
"""
import datetime
import json
import pathlib
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from allotment import categorize  # noqa: E402  (tested in test_allotment.py)

HERE = pathlib.Path(__file__).resolve().parent.parent          # apps/dashboard
OUT = HERE / "src" / "data"
SLD = HERE.parent.parent / "geoserver" / "styles" / "original"
OUT.mkdir(parents=True, exist_ok=True)


def psql(sql):
    """Run SQL on db-primary as postgres (stdin, so no remote files are needed)."""
    cmd = ["ssh", "db-primary", "PGOPTIONS='-c client_min_messages=warning' sudo -u postgres psql -d upavp_geo -At -q"]
    r = subprocess.run(cmd, input=sql, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise SystemExit(r.stderr)
    return r.stdout.strip()


def dump(name, data):
    p = OUT / name
    p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{name}: {p.stat().st_size / 1024:.0f} KB")


# ------------------------------------------------------------------ plot areas (scheme + spatial cluster)
areas = json.loads(psql("""
with p as (
  select coalesce(nullif(trim(scheme), ''), 'Unassigned') s, st_envelope(geom) env, st_centroid(st_envelope(geom)) c
  from gda_plot_layout where geom is not null and not st_isempty(geom)
), k as (
  select *, st_clusterdbscan(c, eps := 0.004, minpoints := 1) over (partition by s) cid from p
), a as (
  select s, cid, count(*) n, st_extent(env) bb, st_convexhull(st_collect(env)) hull
  from k group by s, cid having count(*) >= 10
)
select json_agg(json_build_object(
  'scheme', s, 'plots', n,
  'bbox', array[round(st_xmin(bb)::numeric,5), round(st_ymin(bb)::numeric,5), round(st_xmax(bb)::numeric,5), round(st_ymax(bb)::numeric,5)],
  'hull', st_asgeojson(st_simplifypreservetopology(hull, 0.0004), 5)::json) order by n desc)
from a;
"""))
dump("plot-areas.json", areas)
print("  areas:", len(areas), "| schemes:", len({a["scheme"] for a in areas}), "| plots covered:", sum(a["plots"] for a in areas))

# ------------------------------------------------------------------ landuse classes (Filter tool) + labels
leaf_rows = psql("""
select coalesce(trim(class), ''), coalesce(trim(sub_class), ''), count(*)
from gda_landuse_landcover group by 1, 2;
""").splitlines()

label_rows = json.loads(psql("""
select json_agg(json_build_object('t', label, 'x', round(st_x(pt)::numeric,5), 'y', round(st_y(pt)::numeric,5), 'a', round(m2), 'n', named,
                                  'c', cls, 's', sub) order by m2 desc)
from (
  select coalesce(nullif(trim(name), ''), nullif(trim(sub_class), ''), nullif(trim(class), '')) label,
         (nullif(trim(name), '') is not null)::int named,
         coalesce(trim(class), '') cls, coalesce(trim(sub_class), '') sub,
         st_pointonsurface(geom) pt, st_area(geom::geography) m2
  from gda_landuse_landcover where geom is not null and not st_isempty(geom) and st_isvalid(geom)
) q where label is not null and m2 >= 150;
"""))
# ------------------------------------------------------------------ legends from the SLDs
sub_to_class = {}
for line in psql("select distinct coalesce(class,''), coalesce(sub_class,'') from gda_landuse_landcover;").splitlines():
    cls, _, sub = line.partition("|")
    sub_to_class[sub.strip()] = cls.strip()


def read_sld(name):
    rules = []
    for rule in (e for e in ET.parse(SLD / name).getroot().iter() if e.tag.endswith("}Rule")):
        if any(c.tag.endswith("}TextSymbolizer") for c in rule):
            continue
        lit = next((e.text for e in rule.iter() if e.tag.endswith("}Literal")), None)
        fill = next((e.text for e in rule.iter() if e.tag.endswith("Parameter") and e.get("name") == "fill"), None)
        if fill:
            rules.append((lit, fill, any(c.tag.endswith("}ElseFilter") for c in rule)))
    return rules


plot = [{"label": lit or "Other / unassigned", "color": fill} for lit, fill, _ in read_sld("layout.sld")]
groups = {}
for lit, fill, _ in read_sld("LULC.sld"):
    if lit:
        groups.setdefault(sub_to_class.get(lit, "Other"), []).append({"label": lit, "color": fill})
landuse = [{"group": g, "items": sorted(i, key=lambda x: x["label"])} for g, i in sorted(groups.items())]
dump("legends.json", {"plot": plot, "landuse": landuse})
print("  plot schemes:", len(plot), "| landuse classes:", len(landuse), "| landuse items:", sum(len(g["items"]) for g in landuse))


# ------------------------------------------------------------------ landuse classes + labels (needs SLD colours)
sub_color = {lit: fill for lit, fill, is_else in read_sld("LULC.sld") if lit}
else_color = next((fill for lit, fill, is_else in read_sld("LULC.sld") if is_else), "#75dcc4")
tree = {}
for line in leaf_rows:
    cls, sub, n = line.rsplit("|", 2)
    tree.setdefault(cls or "Not specified", []).append({"sub": sub, "count": int(n)})
classes, leaf_id = [], {}
for cls, subs in sorted(tree.items(), key=lambda kv: -sum(x["count"] for x in kv[1])):
    subs.sort(key=lambda x: -x["count"])
    for x in subs:
        x["id"] = len(leaf_id)
        x["label"] = x["sub"] or "Not specified"
        x["color"] = sub_color.get(x["sub"], else_color)       # blank sub-class = the style's fall-back colour
        leaf_id[(cls if cls != "Not specified" else "", x["sub"])] = x["id"]
    classes.append({"name": cls, "count": sum(x["count"] for x in subs), "color": subs[0]["color"], "subs": subs})
dump("landuse-classes.json", {"elseColor": else_color, "classes": classes})
print("  classes:", len(classes), "| leaves:", len(leaf_id))

labels = [{"t": r["t"], "x": r["x"], "y": r["y"], "a": r["a"], "n": r["n"], "k": leaf_id.get((r["c"], r["s"]), -1)} for r in label_rows]
dump("landuse-labels.json", labels)
print("  labels:", len(labels), "| named:", sum(1 for x in labels if x["n"]))

# ------------------------------------------------------------------ allotment statistics (Summary Chart)
NULL = "<<NULL>>"
rows = psql(f"""
select coalesce(allotment, '{NULL}'), coalesce(nullif(trim(scheme), ''), 'Unassigned'), count(*)
from gda_plot_layout group by 1, 2;
""").splitlines()
values, by_scheme = {}, {}
for line in rows:
    value, scheme, n = line.rsplit("|", 2)
    n = int(n)
    value = None if value == NULL else value
    cat = categorize(value)
    values.setdefault(value, {"value": value, "category": cat, "count": 0})["count"] += n
    for key in ("All", scheme):
        by_scheme.setdefault(key, {"allotted": 0, "notAllotted": 0, "notSet": 0, "other": 0})[cat] += n
by_scheme = dict(sorted(by_scheme.items(), key=lambda kv: (kv[0] != "All", -sum(kv[1].values()))))
lists = {c: sorted(v["value"] for v in values.values() if v["category"] == c and v["value"] is not None)
         for c in ("allotted", "notAllotted", "notSet", "other")}
dump("allotment-stats.json", {
    "generated": datetime.date.today().isoformat(),
    "total": sum(by_scheme["All"].values()),
    "byScheme": by_scheme,
    "lists": lists,                                        # exact DB values per status (used to build the map filter)
    "values": sorted(values.values(), key=lambda v: -v["count"]),
})
print("  overall:", by_scheme["All"])
