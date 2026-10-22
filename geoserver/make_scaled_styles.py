"""Generate scale-dependent SLDs for the AwasVikas workspace from the originals in styles/original/.

Colours, filters and rule order are preserved; only visibility by scale, stroke weight and label
policy change.  Scale denominators are OGC (0.28 mm pixel) for web-mercator tiles:

    zoom 12 = 1:136,495   zoom 13 = 1:68,247   zoom 14 = 1:34,124   zoom 15 = 1:17,061
    zoom 16 = 1:8,531     zoom 17 = 1:4,265    zoom 18 = 1:2,133

Run:  python -I make_scaled_styles.py     (writes styles/scaled/*.sld)
"""
import copy
import pathlib
import xml.etree.ElementTree as ET

HERE = pathlib.Path(__file__).parent
SRC, OUT = HERE / "styles" / "original", HERE / "styles" / "scaled"
OUT.mkdir(parents=True, exist_ok=True)

NS = {"": "http://www.opengis.net/sld", "se": "http://www.opengis.net/se", "ogc": "http://www.opengis.net/ogc",
      "xlink": "http://www.w3.org/1999/xlink", "xsi": "http://www.w3.org/2001/XMLSchema-instance"}
for p, u in NS.items():
    ET.register_namespace(p, u)


def ln(e):
    return e.tag.split("}")[1]


def ns_of(e):
    return e.tag.split("}")[0] + "}"


def rules_of(fts):
    return [c for c in fts if ln(c) == "Rule"]


def set_scale(rule, lo=None, hi=None):
    """Insert Min/MaxScaleDenominator in the schema position (just before the first symbolizer)."""
    for c in list(rule):
        if ln(c) in ("MinScaleDenominator", "MaxScaleDenominator"):
            rule.remove(c)
    idx = next(i for i, c in enumerate(rule) if ln(c).endswith("Symbolizer"))
    ns = ns_of(rule)
    for tag, val in (("MaxScaleDenominator", hi), ("MinScaleDenominator", lo)):   # inserted in reverse
        if val is not None:
            e = ET.Element(ns + tag)
            e.text = str(val)
            rule.insert(idx, e)


def strokes(rule):
    return [s for s in rule.iter() if ln(s) == "Stroke"]


def drop_polygon_stroke(rule):
    for sym in rule:
        if ln(sym) == "PolygonSymbolizer":
            for c in list(sym):
                if ln(c) == "Stroke":
                    sym.remove(c)


def set_width(rule, width, color=None, line_only=False):
    for st in strokes(rule):
        found = False
        for p in st:
            if p.get("name") == "stroke-width":
                p.text, found = str(width), True
            if color and p.get("name") == "stroke":
                p.text = color
        if not found:
            tag = [c for c in st if ln(c) in ("SvgParameter", "CssParameter")]
            e = ET.SubElement(st, tag[0].tag if tag else ns_of(rule) + "CssParameter", name="stroke-width")
            e.text = str(width)


def fts_clone(fts, rules):
    new = ET.Element(fts.tag)
    for c in fts:
        if ln(c) != "Rule":
            new.append(copy.deepcopy(c))
    for r in rules:
        new.append(r)
    return new


def load(name):
    tree = ET.parse(SRC / name)
    root = tree.getroot()
    fts = next(e for e in root.iter() if ln(e) == "FeatureTypeStyle")
    return tree, root, fts, fts_parent(root, fts)


def fts_parent(root, fts):
    return next(p for p in root.iter() if fts in list(p))


def save(tree, root, name, layer):
    for nl in root.iter():
        if ln(nl) == "NamedLayer":
            for c in nl:
                if ln(c) == "Name":
                    c.text = layer          # layer-qualified so the SLD can also be tried via SLD_BODY
    ET.indent(tree, space="  ")
    tree.write(OUT / name, encoding="UTF-8", xml_declaration=True)
    print("wrote", OUT / name)


def split_rules(fts):
    poly, label = [], []
    for r in rules_of(fts):
        (label if any(ln(c) == "TextSymbolizer" for c in r) else poly).append(r)
    return poly, label


# ---------------------------------------------------------------- plot layout (172k polygons)
def plot_layout():
    tree, root, fts, parent = load("layout.sld")
    poly, label = split_rules(fts)
    a = [copy.deepcopy(r) for r in poly]           # zoom 15: fill only, no outline
    for r in a:
        drop_polygon_stroke(r)
        set_scale(r, lo=10000, hi=20000)
    b = [copy.deepcopy(r) for r in poly]           # zoom 16+: hairline outline
    for r in b:
        set_width(r, 0.6)
        set_scale(r, hi=10000)
    for r in label:                                # plot numbers: zoom 17+ only, smaller, collision-safe
        set_scale(r, hi=5000)
        for p in r.iter():
            if p.get("name") == "font-size":
                p.text = "11"
        sym = next(c for c in r if ln(c) == "TextSymbolizer")
        for k, v in (("conflictResolution", "true"), ("goodnessOfFit", "0.7"), ("partials", "false"), ("spaceAround", "2")):
            e = ET.SubElement(sym, ns_of(sym) + "VendorOption", name=k)
            e.text = v
    i = list(parent).index(fts)
    parent.remove(fts)
    parent.insert(i, fts_clone(fts, a))
    parent.insert(i + 1, fts_clone(fts, b + label))
    save(tree, root, "layout.sld", "AwasVikas:gda_plot_layout")


# ---------------------------------------------------------------- landuse (7.8k polygons, 76 rules)
def landuse():
    tree, root, fts, parent = load("LULC.sld")
    for r in rules_of(fts):
        set_scale(r, hi=40000)                      # zoom 14+ (matches the dashboard's minZoom 14)
    save(tree, root, "LULC.sld", "AwasVikas:gda_landuse_landcover")


# ---------------------------------------------------------------- building footprint (150k polygons)
def buildings():
    tree, root, fts, parent = load("Building_Footprint.sld")
    r0 = rules_of(fts)[0]
    a, b = copy.deepcopy(r0), copy.deepcopy(r0)
    drop_polygon_stroke(a)
    set_scale(a, lo=5000, hi=10000)                 # zoom 16: fill only
    set_width(b, 0.5)
    set_scale(b, hi=5000)                           # zoom 17+: hairline outline
    fts.remove(r0)
    fts.append(a)
    fts.append(b)
    save(tree, root, "Building_Footprint.sld", "AwasVikas:gda_building_footprint")


# ---------------------------------------------------------------- line layers: weight by zoom band
def lines(name, layer, widths=(0.8, 1.3, 2.2)):
    tree, root, fts, parent = load(name)
    r0 = rules_of(fts)[0]
    bands = [(34000, None), (8500, 34000), (None, 8500)]    # (min, max) scale
    fts.remove(r0)
    for w, (lo, hi) in zip(widths, bands):
        r = copy.deepcopy(r0)
        set_width(r, w)
        set_scale(r, lo=lo, hi=hi)
        fts.append(r)
    save(tree, root, name, layer)


# ---------------------------------------------------------------- railway: ties only when zoomed in
def railway():
    tree, root, fts, parent = load("Railway.sld")
    r0 = rules_of(fts)[0]
    far, near = copy.deepcopy(r0), copy.deepcopy(r0)
    syms = [c for c in far if ln(c).endswith("Symbolizer")]
    for s in syms[1:]:
        far.remove(s)                               # plain line, no GraphicStroke hatch
    set_width(far, 1.6)
    set_scale(far, lo=20000)
    set_scale(near, hi=20000)
    fts.remove(r0)
    fts.append(far)
    fts.append(near)
    save(tree, root, "Railway.sld", "AwasVikas:gda_railway_line")


# ---------------------------------------------------------------- water bodies: outline only when zoomed in
def water():
    tree, root, fts, parent = load("Waterbodies.sld")
    r0 = rules_of(fts)[0]
    far, near = copy.deepcopy(r0), copy.deepcopy(r0)
    drop_polygon_stroke(far)
    set_scale(far, lo=40000)
    set_scale(near, hi=40000)
    fts.remove(r0)
    fts.append(far)
    fts.append(near)
    save(tree, root, "Waterbodies.sld", "AwasVikas:gda_water_bodies")


if __name__ == "__main__":
    plot_layout()
    landuse()
    buildings()
    lines("Road_Line.sld", "AwasVikas:gda_road_centre_line")
    lines("Drainage.sld", "AwasVikas:gda_drainage_system", widths=(0.7, 1.1, 1.8))
    lines("Sewage.sld", "AwasVikas:gda_sewage_line_existing", widths=(0.7, 1.1, 1.8))
    railway()
    water()
