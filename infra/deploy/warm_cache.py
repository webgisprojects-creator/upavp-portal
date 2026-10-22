"""Pre-warm the map-tile caches (nginx edge cache + GeoServer's GWC) for the area you will present.

GeoServer is ~244 ms away from the portal server, so the first view of any tile is slow; every
view after that is served locally.  Run this before a demo / after a style or data change:

    python -I infra/deploy/warm_cache.py                       # presentation area, zoom 12-16
    python -I infra/deploy/warm_cache.py --radius-km 12 --max-zoom 17
    python -I infra/deploy/warm_cache.py --base http://27.100.38.131:8070 --workers 6

Tiles are requested exactly as the dashboard asks for them (256 px, EPSG:3857, TILED=true), so the
cache keys match.  The nginx cache holds 300 MB / 2 days, so warm only what you need.
"""
import argparse
import concurrent.futures as cf
import math
import time
import urllib.request

# layer -> minimum zoom the dashboard allows (keep in sync with MapContainer.jsx)
LAYERS = {
    "gda_plot_layout": 15, "gda_landuse_landcover": 11, "gda_road_centre_line": 12, "gda_drainage_system": 12,
    "gda_sewage_line_existing": 12, "gda_railway_line": 12, "gda_water_bodies": 12,
}
R = 6378137.0
ORIG = math.pi * R
CENTER = (77.4538, 28.6692)          # dashboard start view (Ghaziabad)


def to_m(lon, lat):
    return lon * ORIG / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * R


def tiles(radius_km, min_zoom, max_zoom):
    cx, cy = to_m(*CENTER)
    r = radius_km * 1000 / math.cos(math.radians(CENTER[1]))     # mercator metres
    for layer, lmin in LAYERS.items():
        for z in range(max(min_zoom, lmin), max_zoom + 1):
            size = 2 * ORIG / 2 ** z
            for c in range(int((cx - r + ORIG) // size), int((cx + r + ORIG) // size) + 1):
                for row in range(int((cy - r + ORIG) // size), int((cy + r + ORIG) // size) + 1):
                    yield layer, z, (c * size - ORIG, row * size - ORIG, (c + 1) * size - ORIG, (row + 1) * size - ORIG)


def fetch(base, job):
    layer, z, b = job
    url = (f"{base}/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true"
           f"&LAYERS=AwasVikas:{layer}&STYLES=&TILED=true&WIDTH=256&HEIGHT=256&SRS=EPSG:3857&BBOX={b[0]},{b[1]},{b[2]},{b[3]}")
    try:
        with urllib.request.urlopen(url, timeout=130) as r:
            r.read()
            return r.status == 200 and r.headers.get("content-type", "").startswith("image/")
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://27.100.38.131:8070")
    ap.add_argument("--radius-km", type=float, default=6)
    ap.add_argument("--min-zoom", type=int, default=12)
    ap.add_argument("--max-zoom", type=int, default=16)
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    jobs = list(tiles(a.radius_km, a.min_zoom, a.max_zoom))
    print(f"warming {len(jobs)} tiles (radius {a.radius_km} km, zoom {a.min_zoom}-{a.max_zoom})", flush=True)
    t0, ok, done = time.time(), 0, 0
    with cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        for good in ex.map(lambda j: fetch(a.base, j), jobs):
            done += 1
            ok += good
            if done % 100 == 0:
                print(f"  {done}/{len(jobs)}  ({time.time() - t0:.0f}s)", flush=True)
    print(f"done: {ok}/{len(jobs)} ok in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
