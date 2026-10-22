-- UPAVP geo login portal: isolated database. Run as postgres on db-primary.
-- Passwords are supplied as psql variables (-v app_pw=... ), never stored in this file.
\set ON_ERROR_STOP on
CREATE ROLE upavp_geo_owner NOLOGIN;
CREATE ROLE upavp_geo_app        LOGIN PASSWORD :'app_pw' CONNECTION LIMIT 40 NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE upavp_geo_dev        LOGIN PASSWORD :'dev_pw' CONNECTION LIMIT 10 NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE upavp_geo_geoserver  LOGIN PASSWORD :'gs_pw'  CONNECTION LIMIT 15 NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT upavp_geo_owner TO upavp_geo_dev;  -- devs run migrations as owner via SET ROLE
CREATE DATABASE upavp_geo OWNER upavp_geo_owner ENCODING UTF8 TEMPLATE template0 LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8';
REVOKE ALL ON DATABASE upavp_geo FROM PUBLIC;
GRANT CONNECT ON DATABASE upavp_geo TO upavp_geo_app, upavp_geo_dev, upavp_geo_geoserver;
ALTER ROLE upavp_geo_app SET statement_timeout = '30s';
ALTER ROLE upavp_geo_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE upavp_geo_geoserver SET default_transaction_read_only = on;
ALTER ROLE upavp_geo_geoserver SET statement_timeout = '60s';
\connect upavp_geo
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA auth AUTHORIZATION upavp_geo_owner;
CREATE SCHEMA app  AUTHORIZATION upavp_geo_owner;
ALTER ROLE upavp_geo_app       IN DATABASE upavp_geo SET search_path = app, auth;
ALTER ROLE upavp_geo_dev       IN DATABASE upavp_geo SET search_path = app, auth;
ALTER ROLE upavp_geo_geoserver IN DATABASE upavp_geo SET search_path = app;
GRANT USAGE ON SCHEMA auth, app TO upavp_geo_app, upavp_geo_dev;
GRANT USAGE ON SCHEMA app TO upavp_geo_geoserver;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA auth, app GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO upavp_geo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA auth, app GRANT USAGE,SELECT ON SEQUENCES TO upavp_geo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA auth, app GRANT SELECT ON TABLES TO upavp_geo_dev;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA app GRANT SELECT ON TABLES TO upavp_geo_geoserver;
ALTER ROLE upavp_geo_dev IN DATABASE upavp_geo SET role = upavp_geo_owner;
ALTER ROLE upavp_geo_app       IN DATABASE upavp_geo SET search_path = app, auth, public;
ALTER ROLE upavp_geo_dev       IN DATABASE upavp_geo SET search_path = app, auth, public;
ALTER ROLE upavp_geo_geoserver IN DATABASE upavp_geo SET search_path = app, public;
GRANT USAGE ON SCHEMA public TO upavp_geo_app, upavp_geo_dev, upavp_geo_geoserver;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO upavp_geo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO upavp_geo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA public GRANT SELECT ON TABLES TO upavp_geo_dev, upavp_geo_geoserver;
-- shared sequences/functions in app for dev-created objects used by the app role
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA auth, app, public GRANT EXECUTE ON FUNCTIONS TO upavp_geo_app, upavp_geo_dev;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA app, public GRANT EXECUTE ON FUNCTIONS TO upavp_geo_geoserver;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA auth, app, public GRANT USAGE ON TYPES TO upavp_geo_app, upavp_geo_dev;
ALTER DEFAULT PRIVILEGES FOR ROLE upavp_geo_owner IN SCHEMA app, public GRANT USAGE ON TYPES TO upavp_geo_geoserver;
