-- 004: project standard SRID 4326 even when a developer forgets to declare it.
-- Applied by db/migrate.sh (as postgres, connected to upavp_geo). Idempotent.
--
-- PostGIS has no database-wide "default SRID". A geometry column declared without one (geometry, geometry(Point)) gets SRID 0 = unknown.
-- This event trigger fixes that at the moment the table/column is created or altered:
--   * geometry column with SRID 0 on an EMPTY table  -> re-typed to geometry(<same type>, 4326)
--   * afterwards PostGIS stamps 4326 on any inserted geometry that arrives without an SRID (typmod rule)
-- A table that already holds rows with SRID 0 is NOT relabelled (we cannot know the real CRS): it stays visible as a problem in
-- public.v_layer_health and prepare_layer() prints the fix command.
-- Layers with another explicit SRID (e.g. 32644) are left alone; v_layer_health reports them as a note.

SET ROLE upavp_geo_owner;

CREATE OR REPLACE FUNCTION public.on_ddl_default_srid() RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE
  r      record;
  g      record;
  is_empty boolean;
  typ    text;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    CONTINUE WHEN r.in_extension OR r.object_type <> 'table' OR r.schema_name IS NULL
               OR r.schema_name IN ('information_schema', 'topology', 'tiger', 'tiger_data') OR r.schema_name LIKE 'pg\_%';
    FOR g IN
      SELECT f_geometry_column AS col, type, coord_dimension AS dim
      FROM geometry_columns
      WHERE f_table_schema = r.schema_name AND f_table_name = split_part(r.object_identity, '.', 2) AND srid = 0
    LOOP
      BEGIN
        EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM %s)', r.objid::regclass) INTO is_empty;
        IF NOT is_empty THEN
          RAISE WARNING '% column "%" has SRID 0 and contains rows - NOT relabelled automatically. Find the real CRS, then SELECT UpdateGeometrySRID(...)', r.object_identity, g.col;
          CONTINUE;
        END IF;
        typ := initcap(g.type) || CASE g.dim WHEN 3 THEN 'Z' WHEN 4 THEN 'ZM' ELSE '' END;
        EXECUTE format('ALTER TABLE %s ALTER COLUMN %I TYPE geometry(%s, 4326) USING ST_SetSRID(%I, 4326)', r.objid::regclass, g.col, typ, g.col);
        RAISE NOTICE '% column "%" had no SRID: set to 4326 (project standard)', r.object_identity, g.col;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'could not default SRID to 4326 on % (%): %', r.object_identity, g.col, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END
$$;

RESET ROLE;

DROP EVENT TRIGGER IF EXISTS default_srid_4326;
CREATE EVENT TRIGGER default_srid_4326 ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE')
  EXECUTE FUNCTION public.on_ddl_default_srid();
