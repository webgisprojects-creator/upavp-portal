#!/usr/bin/env python3
"""Convert GeoServer "PostGIS" stores (own connection pool, credentials inside the store) into "PostGIS (JNDI)" stores that borrow
connections from ONE shared Tomcat JNDI DataSource.

Run ON THE GEOSERVER HOST as root. Always look at --dry-run first:

    python3 migrate_stores_to_jndi.py --data-dir /opt/geoserver/data_dir --db-host 27.100.38.132 --database upavp_geo \
            --jndi java:comp/env/jdbc/upavp_geo --dry-run
    python3 migrate_stores_to_jndi.py ... --backup-dir /opt/geoserver/backups/jndi-<timestamp>          # really do it

What changes in each datastore.xml  (only <type> and <connectionParameters>; ids, workspace and published layers are untouched):
    <type>PostGIS</type>                       ->  <type>PostGIS (JNDI)</type>
    removed : host, port, database, user, passwd, min/max connections, validate connections, Test while idle, evictor settings,
              Connection timeout, Max connection idle time      (the shared pool owns all of this now)
    added   : jndiReferenceName = java:comp/env/jdbc/upavp_geo
    kept    : schema, namespace, dbtype, Expose primary keys, geometry simplification, Loose bbox, ...
    changed : fetch size 1000 -> --fetch-size  (rows per database round trip; each trip costs ~250 ms over the WAN link)

GeoServer reads these files at start-up, so restart it afterwards. Idempotent: stores that are already JNDI are skipped.
"""
import argparse
import difflib
import pathlib
import re
import shutil
import sys

REMOVE = {
    "host", "port", "database", "user", "passwd", "min connections", "max connections", "validate connections", "Test while idle",
    "Evictor run periodicity", "Evictor tests per run", "Connection timeout", "Max connection idle time",
}
ENTRY = re.compile(r'^(\s*)<entry key="([^"]*)">(.*?)</entry>\s*$')


def convert(text: str, jndi: str, fetch_size: str):
    """Return (new_text, removed_keys) or None if this store does not need converting."""
    m = re.search(r"(<connectionParameters>\n)(.*?)(\s*</connectionParameters>)", text, re.S)
    if not m:
        return None
    params = {}
    order = []
    for line in m.group(2).splitlines():
        e = ENTRY.match(line)
        if e:
            params[e.group(2)] = e.group(3)
            order.append((e.group(1), e.group(2)))
    return m, params, order


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--db-host", required=True, help="only stores that point at this host ...")
    ap.add_argument("--database", required=True, help="... and this database are converted")
    ap.add_argument("--jndi", required=True)
    ap.add_argument("--fetch-size", default="10000")
    ap.add_argument("--backup-dir")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    files = sorted(pathlib.Path(a.data_dir, "workspaces").glob("*/*/datastore.xml"))
    todo = []
    for f in files:
        text = f.read_text(encoding="utf-8")
        parsed = convert(text, a.jndi, a.fetch_size)
        if not parsed:
            continue
        m, params, order = parsed
        if "<type>PostGIS (JNDI)</type>" in text or params.get("jndiReferenceName"):
            continue                                              # already JNDI
        if params.get("host") != a.db_host or params.get("database") != a.database:
            continue                                              # a store of another project: never touched
        todo.append((f, text, m, params, order))

    print(f"{len(todo)} store(s) to convert (of {len(files)} stores in the data directory)")
    if not todo:
        return 0
    if not a.dry_run:
        if not a.backup_dir:
            print("ERROR: --backup-dir is required unless --dry-run", file=sys.stderr)
            return 2
        backup = pathlib.Path(a.backup_dir)
        backup.mkdir(parents=True, exist_ok=True)

    for f, text, m, params, order in todo:
        new_lines = []
        for indent, key in order:
            if key in REMOVE:
                continue
            value = a.fetch_size if key == "fetch size" else params[key]
            new_lines.append(f'{indent}<entry key="{key}">{value}</entry>')
        indent = order[0][0] if order else "    "
        new_lines.append(f'{indent}<entry key="jndiReferenceName">{a.jndi}</entry>')
        new_block = m.group(1) + "\n".join(new_lines) + m.group(3)
        new_text = text[: m.start()] + new_block + text[m.end():]
        new_text = new_text.replace("<type>PostGIS</type>", "<type>PostGIS (JNDI)</type>", 1)

        ws, store = f.parts[-3], f.parts[-2]
        removed = [k for _, k in order if k in REMOVE]
        print(f"- {ws}/{store}: schema={params.get('schema')} user={params.get('user')} pool={params.get('min connections')}-{params.get('max connections')} "
              f"-> JNDI {a.jndi}; removed {len(removed)} entries; fetch size {params.get('fetch size')} -> {a.fetch_size}")
        if a.dry_run:
            if store == todo[0][0].parts[-2]:                     # show the full diff for the first store only
                diff = difflib.unified_diff(text.splitlines(), new_text.splitlines(), "before", "after", lineterm="", n=0)
                print("\n".join("    " + re.sub(r'(key="passwd">)[^<]*', r"\1***", d) for d in diff))
            continue
        dest = pathlib.Path(a.backup_dir) / ws / store
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dest / "datastore.xml")                   # backup first
        f.write_text(new_text, encoding="utf-8")                  # in place: keeps owner / mode
    print("dry run only - nothing written" if a.dry_run else f"done; originals saved under {a.backup_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
