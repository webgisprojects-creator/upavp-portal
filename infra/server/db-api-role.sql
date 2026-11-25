-- Read-only database login for the search/chart API. Run once as postgres on db-primary:
--   psql -d upavp_geo -v pw="'<generated password>'" -f db-api-role.sql
-- It can only read the Vrindavan layout table (no UPDATE/DELETE, no other tables) and every query is cancelled after 10 s.
CREATE ROLE upavp_geo_api LOGIN PASSWORD :pw NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 20;
ALTER ROLE upavp_geo_api SET statement_timeout = '10s';
GRANT CONNECT ON DATABASE upavp_geo TO upavp_geo_api;
GRANT USAGE ON SCHEMA lucknow TO upavp_geo_api;
GRANT SELECT ON lucknow.vrindavan_layout TO upavp_geo_api;
GRANT USAGE ON SCHEMA public TO upavp_geo_api;   -- PostGIS types/functions live in public (no table rights given)
