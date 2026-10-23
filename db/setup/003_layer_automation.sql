-- 003: "import a layer, it just works" - automatic GeoServer access, a per-layer checklist, a health view and a connection monitor.
-- Applied by db/migrate.sh (as postgres, connected to upavp_geo). Idempotent.
--
-- Developer workflow this enables (details: docs/guides/add-a-layer-to-geoserver.md):
--   1. import the data into a schema (shp2pgsql / ogr2ogr / pgAdmin loader)        -> GeoServer can already read it (event trigger)
--   2. SELECT * FROM public.prepare_layer('city', 'table');                           -> index, ANALYZE, checks, next step
--   3. SELECT * FROM public.v_layer_health WHERE NOT ok;                              -> anything still wrong, in one place
--   4. GeoServer: new store "PostGIS (JNDI)" -> publish the layer                    -> done

SET ROLE upavp_geo_owner;

-- ---------------------------------------------------------------------------------------------------------------------------
-- A. Event trigger function: every new table / view / materialized view / schema becomes readable by GeoServer's read-only role.
--    Never touches schema "auth" (private to the backend) and never blocks the developer's DDL (errors become warnings).
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_ddl_grant_geoserver() RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  s text;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    CONTINUE WHEN r.in_extension;                                         -- objects created by extension scripts (PostGIS ...)
    BEGIN
      IF r.object_type = 'schema' THEN
        SELECT nspname INTO s FROM pg_namespace WHERE oid = r.objid;
        CONTINUE WHEN s IS NULL OR s = 'auth' OR s LIKE 'pg\_%' OR s = 'information_schema';
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO upavp_geo_geoserver', s);
      ELSIF r.object_type IN ('table', 'view', 'materialized view', 'foreign table') THEN
        CONTINUE WHEN r.schema_name IS NULL OR r.schema_name = 'auth' OR r.schema_name LIKE 'pg\_%' OR r.schema_name = 'information_schema';
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO upavp_geo_geoserver', r.schema_name);
        EXECUTE format('GRANT SELECT ON %s TO upavp_geo_geoserver', r.objid::regclass);   -- regclass text is correctly quoted
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'could not grant GeoServer read access on %: % (run: SELECT public.grant_geoserver_read(''<schema>''))', r.object_identity, SQLERRM;
    END;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- B. prepare_layer(schema, table): make one imported layer GeoServer-ready and report what it found / did.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_layer(p_schema text, p_table text)
RETURNS TABLE(step text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  rel     regclass;
  gcol    text;
  gtype   text;
  gsrid   int;
  n       bigint;
  bad     bigint;
BEGIN
  rel := format('%I.%I', p_schema, p_table)::regclass;                    -- raises a clear error if the table does not exist

  SELECT f_geometry_column, type, srid INTO gcol, gtype, gsrid
  FROM geometry_columns WHERE f_table_schema = p_schema AND f_table_name = p_table LIMIT 1;
  IF gcol IS NULL THEN
    step := 'geometry column'; result := 'NOT FOUND - import it as a spatial layer (shp2pgsql / ogr2ogr) or add one with AddGeometryColumn'; RETURN NEXT; RETURN;
  END IF;

  step := 'geometry'; result := format('%s column "%s", %s, SRID %s', p_schema || '.' || p_table, gcol, gtype, gsrid); RETURN NEXT;

  step := 'SRID';
  IF gsrid = 0 THEN
    result := 'WARNING: SRID is 0 (undefined). Find the real coordinate system, then: SELECT UpdateGeometrySRID(''' || p_schema || ''',''' || p_table || ''',''' || gcol || ''', 4326);  (or ST_Transform if it is not 4326)';
  ELSIF gsrid <> 4326 THEN
    result := format('NOTE: SRID %s - the project standard is 4326 (reproject with ST_Transform if this layer should match the others)', gsrid);
  ELSE
    result := 'ok (4326)';
  END IF;
  RETURN NEXT;

  step := 'spatial index';
  IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_am am ON am.oid = ic.relam
             WHERE i.indrelid = rel AND am.amname = 'gist') THEN
    result := 'ok (GiST index exists)';
  ELSE
    EXECUTE format('CREATE INDEX %I ON %s USING gist (%I)', left(p_table || '_' || gcol || '_gix', 63), rel, gcol);
    result := 'created (GiST) - bounding-box queries are now index-driven';
  END IF;
  RETURN NEXT;

  step := 'primary key';
  result := CASE WHEN EXISTS (SELECT 1 FROM pg_index WHERE indrelid = rel AND indisprimary) THEN 'ok'
                 ELSE 'WARNING: none. GeoServer needs a stable feature id. Fix: ALTER TABLE ' || rel || ' ADD COLUMN gid serial PRIMARY KEY;' END;
  RETURN NEXT;

  EXECUTE format('ANALYZE %s', rel);
  step := 'planner statistics'; result := 'ANALYZE done'; RETURN NEXT;

  step := 'GeoServer read access';
  IF p_schema = 'auth' THEN
    result := 'BLOCKED on purpose: schema auth is private to the backend';
  ELSE
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO upavp_geo_geoserver', p_schema);
    EXECUTE format('GRANT SELECT ON %s TO upavp_geo_geoserver', rel);
    result := CASE WHEN has_table_privilege('upavp_geo_geoserver', rel, 'SELECT') THEN 'ok' ELSE 'MISSING' END;
  END IF;
  RETURN NEXT;

  EXECUTE format('SELECT count(*) FROM %s', rel) INTO n;
  step := 'rows'; result := n::text; RETURN NEXT;

  IF n <= 500000 THEN
    EXECUTE format('SELECT count(*) FROM %s WHERE NOT ST_IsValid(%I)', rel, gcol) INTO bad;
    step := 'geometry validity';
    result := CASE WHEN bad = 0 THEN 'ok'
                   ELSE format('WARNING: %s invalid geometries. Fix: UPDATE %s SET %I = ST_MakeValid(%I) WHERE NOT ST_IsValid(%I);', bad, rel, gcol, gcol, gcol) END;
    RETURN NEXT;
  END IF;

  step := 'next step (GeoServer)';
  result := format('Stores -> Add new store -> "PostGIS (JNDI)": jndiReferenceName=java:comp/env/jdbc/upavp_geo, schema=%s. Then publish layer "%s" (set SRS EPSG:4326, compute bounding boxes).', p_schema, p_table);
  RETURN NEXT;
END
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- C. v_layer_health: every spatial layer, what it is, and what is wrong with it.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_layer_health AS
WITH l AS (
  SELECT g.f_table_schema AS sch, g.f_table_name AS tbl, g.f_geometry_column AS gcol, g.type AS gtype, g.srid, c.oid AS reloid, c.reltuples::bigint AS rows_est,
         EXISTS (SELECT 1 FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_am am ON am.oid = ic.relam
                 WHERE i.indrelid = c.oid AND am.amname = 'gist')                              AS has_gist,
         EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary)         AS has_pk,
         c.relkind
  FROM geometry_columns g
  JOIN pg_namespace n ON n.nspname = g.f_table_schema
  JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = g.f_table_name
  WHERE g.f_table_schema <> 'topology'
)
SELECT sch || '.' || tbl                                  AS layer,
       gcol                                               AS geom_column,
       gtype                                              AS geom_type,
       srid,
       rows_est                                           AS rows_estimate,
       pg_size_pretty(pg_total_relation_size(reloid))     AS size,
       has_gist                                           AS has_spatial_index,
       has_pk                                             AS has_primary_key,
       has_table_privilege('upavp_geo_geoserver', reloid, 'SELECT') AS geoserver_can_read,
       (SELECT s.last_analyze::date FROM pg_stat_user_tables s WHERE s.relid = reloid) AS last_analyzed,
       (srid = 4326 AND has_gist AND (has_pk OR relkind <> 'r')
        AND has_table_privilege('upavp_geo_geoserver', reloid, 'SELECT'))               AS ok,
       concat_ws('; ',
         CASE WHEN srid = 0 THEN 'SRID 0 (undefined)' WHEN srid <> 4326 THEN 'SRID ' || srid || ' (standard is 4326)' END,
         CASE WHEN NOT has_gist THEN 'no spatial index' END,
         CASE WHEN NOT has_pk AND relkind = 'r' THEN 'no primary key' END,
         CASE WHEN NOT has_table_privilege('upavp_geo_geoserver', reloid, 'SELECT') THEN 'GeoServer cannot read it' END) AS problems
FROM l
ORDER BY ok, layer;

RESET ROLE;

-- ---------------------------------------------------------------------------------------------------------------------------
-- D. The event trigger itself (needs superuser to create; this migration runs as postgres).
-- ---------------------------------------------------------------------------------------------------------------------------
DROP EVENT TRIGGER IF EXISTS grant_geoserver_on_ddl;
CREATE EVENT TRIGGER grant_geoserver_on_ddl ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'CREATE VIEW', 'CREATE MATERIALIZED VIEW', 'CREATE FOREIGN TABLE', 'CREATE SCHEMA')
  EXECUTE FUNCTION public.on_ddl_grant_geoserver();

-- ---------------------------------------------------------------------------------------------------------------------------
-- E. connection_usage(): how close each of THIS project's roles is to its connection limit.
--    SECURITY DEFINER (owned by postgres) so developers can see counts without being able to see other projects' sessions or queries.
-- ---------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.connection_usage()
RETURNS TABLE(role_name name, connection_limit int, in_use bigint, idle bigint, percent_used numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT r.rolname, r.rolconnlimit,
         count(a.pid), count(a.pid) FILTER (WHERE a.state = 'idle'),
         CASE WHEN r.rolconnlimit > 0 THEN round(100.0 * count(a.pid) / r.rolconnlimit, 0) END
  FROM pg_roles r LEFT JOIN pg_stat_activity a ON a.usename = r.rolname AND a.backend_type = 'client backend'
  WHERE r.rolname LIKE 'upavp\_geo\_%' AND r.rolcanlogin
  GROUP BY r.rolname, r.rolconnlimit
  ORDER BY r.rolname
$$;
REVOKE ALL ON FUNCTION public.connection_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.connection_usage() TO upavp_geo_dev, upavp_geo_owner;
