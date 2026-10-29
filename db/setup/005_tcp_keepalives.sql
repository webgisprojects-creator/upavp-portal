-- 005: keep idle remote sessions alive through NAT / office firewalls / mobile hotspots.
-- Server default is tcp_keepalives_idle=0 (= OS default, 2 hours): a router that forgets an idle connection after a few minutes leaves
-- pgAdmin hanging until "timeout expired" / "connection reset". A probe every 60 s keeps the mapping alive and lets the server notice
-- dead clients within ~2 min (60 + 3 x 20 s) instead of hours. Per-role, so other projects on this server are not affected.
ALTER ROLE upavp_geo_dev       SET tcp_keepalives_idle = 60;
ALTER ROLE upavp_geo_dev       SET tcp_keepalives_interval = 20;
ALTER ROLE upavp_geo_dev       SET tcp_keepalives_count = 3;
ALTER ROLE upavp_geo_geoserver SET tcp_keepalives_idle = 60;
ALTER ROLE upavp_geo_geoserver SET tcp_keepalives_interval = 20;
ALTER ROLE upavp_geo_geoserver SET tcp_keepalives_count = 3;
