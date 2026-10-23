-- 002: GeoServer read access to every data schema, a reusable grant helper, and connection-limit tuning.
-- Run as postgres on db-primary, connected to database upavp_geo:
--     sudo -u postgres psql -d upavp_geo -v ON_ERROR_STOP=1 < 002_geoserver_access_and_limits.sql
-- Idempotent: safe to run again (e.g. after a teammate adds a new city schema).
--
-- Why: GeoServer is moving to ONE shared JNDI connection pool that logs in as the READ-ONLY role upavp_geo_geoserver
-- (least privilege). That role had no permission on the city schemas created later (agra, ayodhya, ...), so it must be granted
-- SELECT there - and automatically on future tables - otherwise those layers fail with "permission denied for schema ...".

SET ROLE upavp_geo_owner;

-- Helper: give GeoServer read access to one schema (USAGE on the schema, SELECT on its tables now, SELECT on tables created later).
-- Run it (as owner / dev, who acts as owner) whenever a new data schema is added:   SELECT public.grant_geoserver_read('newcity');
CREATE OR REPLACE FUNCTION public.grant_geoserver_read(p_schema text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_schema = 'auth' THEN
    RAISE EXCEPTION 'schema "auth" is private to the backend and must never be readable by GeoServer';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO upavp_geo_geoserver', p_schema);
  EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO upavp_geo_geoserver', p_schema);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA %I GRANT SELECT ON TABLES TO upavp_geo_geoserver', p_schema);
END
$$;

RESET ROLE;

-- Apply to every schema the owner role owns (all city schemas + app), never 'auth'.
SELECT nspname AS granted_schema, public.grant_geoserver_read(nspname)
FROM pg_namespace
WHERE nspowner = (SELECT oid FROM pg_roles WHERE rolname = 'upavp_geo_owner')
  AND nspname <> 'auth'
ORDER BY 1;

-- A schema created in the future is at least *visible* to GeoServer (USAGE exposes no data by itself).
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner GRANT USAGE ON SCHEMAS TO upavp_geo_geoserver;

-- Connection limits: GeoServer no longer logs in as the developer role, so developers get a bigger, protected quota,
-- and abandoned sessions (a forgotten pgAdmin tab) are closed by the SERVER after 20 minutes (idle_session_timeout, PostgreSQL 14+).
ALTER ROLE upavp_geo_dev CONNECTION LIMIT 30;
ALTER ROLE upavp_geo_dev SET idle_session_timeout = '20min';
