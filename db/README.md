# Database (PostgreSQL / PostGIS on db-primary)

| File | What |
|---|---|
| `setup/001_create_database.sql` | The script that created database `upavp_geo`, its roles, schemas, extensions and default privileges. Passwords are **not** in it - they are passed as psql variables (`-v app_pw=...`). |

Run (as `postgres`, on db-primary):

```bash
sudo -u postgres psql -d template1 -v app_pw="$APP_PW" -v dev_pw="$DEV_PW" -v gs_pw="$GS_PW" < 001_create_database.sql
```

## Rules for changing the database
* Every schema change is a **new numbered file** in this folder (`002_...sql`, `003_...sql`), reviewed in a pull request - never an
  ad-hoc change in pgAdmin on a shared server.
* Objects must be owned by `upavp_geo_owner`; `upavp_geo_dev` already acts as the owner, so tables you create are shared automatically.
* Never commit a password. Credentials live in `/root/upavp_geo_setup/credentials.txt` on db-primary (root only) or a password manager.

See `docs/architecture.md` for the roles and why the database is isolated from the other projects.
