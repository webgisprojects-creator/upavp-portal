# Add a new layer to GeoServer (the 5-minute path)

Audience: any developer. Prerequisite: a login on database `upavp_geo` (role `upavp_geo_dev`) and a GeoServer admin login.

**Why it is easy now:** GeoServer reads the database through ONE shared connection pool (a JNDI DataSource,
`java:comp/env/jdbc/upavp_geo`) with a read-only role. A database event trigger automatically lets that role read every new
table, so there is no "permission denied" step and no password to type into GeoServer.

## 1. Import the data into the right schema
One schema per area/city (`ayodhya`, `hardoi`, ...). Standards: **SRID 4326**, geometry column named `geom`, a primary key.

```bash
# Shapefile -> PostGIS (CLI)
ogr2ogr -f PostgreSQL "PG:host=<db-host> port=6432 dbname=upavp_geo_dev user=upavp_geo_dev" roads.shp \
  -nln ayodhya.road_centre_line -nlt PROMOTE_TO_MULTI -t_srs EPSG:4326 -lco GEOMETRY_NAME=geom -lco FID=gid
```
GUI alternative: pgAdmin -> right-click the schema -> *PostGIS Shapefile and DBF Loader* (or QGIS: *Database -> DB Manager -> Import layer*).
Ask the DBA for the host/port/alias; use the **dev** alias (session pooling), not the app one.

## 2. Run the checklist function
```sql
SELECT * FROM public.prepare_layer('ayodhya', 'road_centre_line');
```
It creates the missing GiST spatial index, runs ANALYZE, checks SRID / primary key / invalid geometries, confirms GeoServer can read
the table, and prints the exact next GeoServer step. Anything starting with `WARNING` is to be fixed before publishing.

Overview of every layer at any time:
```sql
SELECT * FROM public.v_layer_health WHERE NOT ok;   -- empty = all healthy
```

## 3. Create the store in GeoServer (once per schema, not per layer)
GUI: *Stores -> Add new Store -> **PostGIS (JNDI)*** ->
* Workspace: pick the project workspace
* Data Source Name: e.g. `ayodhya_db`
* **jndiReferenceName: `java:comp/env/jdbc/upavp_geo`**
* schema: `ayodhya`
* Expose primary keys: ticked

Do NOT choose plain "PostGIS" - that makes a private pool with its own password and is what exhausted the connection limit.

REST/CLI equivalent:
```bash
curl -u admin:*** -XPOST -H 'Content-Type: application/json' \
  http://<geoserver>/geoserver/rest/workspaces/AwasVikas/datastores -d '{
 "dataStore":{"name":"ayodhya_db","connectionParameters":{"entry":[
   {"@key":"dbtype","$":"postgis"},{"@key":"jndiReferenceName","$":"java:comp/env/jdbc/upavp_geo"},
   {"@key":"schema","$":"ayodhya"},{"@key":"Expose primary keys","$":"true"},{"@key":"fetch size","$":"10000"}]}}}'
```

## 4. Publish
Store -> *Publish* next to the table -> Declared SRS `EPSG:4326` -> *Compute from data* / *Compute from native bounds* -> Save.
Style it (SLD/CSS) and test in *Layer Preview*.

## 5. Verify
```bash
curl "http://<geoserver>/geoserver/<ws>/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=<ws>:<layer>&maxFeatures=1&outputFormat=application/json"
```

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| Store save says "JNDI lookup failed" | Wrong name. It must be exactly `java:comp/env/jdbc/upavp_geo` |
| Table not listed when publishing | Wrong `schema` in the store, or the table has no geometry column |
| `permission denied for table` | Trigger did not run (table created by a different role). `SELECT public.grant_geoserver_read('<schema>');` |
| Slow first tile | Missing spatial index: re-run `prepare_layer` |
| `SRID 0` warning | Real CRS unknown: find it, then `SELECT UpdateGeometrySRID('s','t','geom',4326)` (or `ST_Transform`) |
| Requests wait ~30 s then fail | Pool exhausted (max 10): look for a slow layer; `SELECT * FROM public.connection_usage();` |
