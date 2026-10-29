-- 006: two GeoServers read this database through the same read-only role (the shared one at 162.245.218.6 and the dedicated one
-- next to the database on db-primary), each with a pool of at most 10 connections. 15 was not enough for both.
ALTER ROLE upavp_geo_geoserver CONNECTION LIMIT 25;
