# Database (PostgreSQL / PostGIS on db-primary)

Database `upavp_geo`, isolated from every other project on the server. Numbered SQL files in `setup/` are the only way the structure changes.

| File | What |
|---|---|
| `setup/001_create_database.sql` | Created the database, roles, schemas, extensions. Passwords are **not** in it (psql variables). |
| `setup/002_geoserver_access_and_limits.sql` | `grant_geoserver_read(schema)`, default privileges for new tables, connection limit + idle timeout for developers. |
| `setup/003_layer_automation.sql` | Event trigger (new table => GeoServer can read it), `prepare_layer()`, view `v_layer_health`, `connection_usage()`. |
| `migrate.sh` | Applies the files once each and records them in `public.schema_migrations` (with checksum). |

```bash
db/migrate.sh status            # applied / pending / changed-after-apply
db/migrate.sh apply             # apply pending files, each in ONE transaction
db/migrate.sh baseline 001      # mark a hand-applied file as done
```
A file that was edited after being applied is reported, never re-run: write the next number instead.

## Roles (least privilege)
| Role | Used by | Can | Limit |
|---|---|---|---|
| `upavp_geo_owner` | owns all objects | DDL | no login |
| `upavp_geo_app` | backend (via PgBouncer, transaction pooling) | read/write `auth` + app schemas | 40 |
| `upavp_geo_dev` | developers (pgAdmin/QGIS), acts as owner | create layers | 30, idle sessions closed after 20 min |
| `upavp_geo_geoserver` | GeoServer JNDI pool | **read only**, never schema `auth` | 15 |

## Conventions for layers
One schema per area; SRID 4326; geometry column `geom`; primary key `gid`; GiST index.
`SELECT * FROM public.v_layer_health WHERE NOT ok;` lists violations.
How to publish a layer: [docs/guides/add-a-layer-to-geoserver.md](../docs/guides/add-a-layer-to-geoserver.md).

## Monitoring
```sql
SELECT * FROM public.connection_usage();   -- in use vs limit per role
```

Never commit a password. Credentials live in `/root/upavp_geo_setup/credentials.txt` on db-primary (root only) or a password manager.
See `docs/architecture.md` for why the database is isolated.
