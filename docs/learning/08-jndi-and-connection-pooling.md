# 08 - JNDI and connection pooling (interview notes from a real fix)

**Problem we had:** pgAdmin said "too many clients". Each GeoServer PostGIS store kept its *own* pool (min 1 / max 10 connections each),
and a NEW connection over our 244 ms link costs ~2 s, so pools were kept open. Many stores x many connections = the server limit.

## Vocabulary
| Term | Meaning here |
|---|---|
| **JNDI** (Java Naming and Directory Interface) | A registry inside Tomcat. A name maps to an object (here a DataSource). |
| **ENC** (Environment Naming Context) | The `java:comp/env/` namespace a web app sees. Our name: `java:comp/env/jdbc/upavp_geo`. |
| **DataSource** (`javax.sql.DataSource`) | The standard Java factory for pooled connections. |
| **Connection pool** | Reused open connections. Tomcat's: `org.apache.tomcat.jdbc.pool.DataSourceFactory`. |
| `maxActive` / `minIdle` / `maxWait` | Hard cap / warm connections never closed / how long a request queues instead of failing. |
| `testOnBorrow` + `validationInterval` | Check a connection before use, but at most every 30 s (each check is a 244 ms round trip). |
| `minEvictableIdleTimeMillis` | Idle connections above `minIdle` are closed after 2 min = automatic release. |
| `removeAbandoned` | Reclaims leaked connections. |
| **PgBouncer** | External pooler. *Session* mode: a client keeps a server connection for its whole session. *Transaction* mode: only during a transaction (needs care with prepared statements). |
| `CONNECTION LIMIT` (role) | Per-role cap -> "too many connections for role"; vs `max_connections` -> "too many clients". |
| `idle_session_timeout` | PostgreSQL closes idle sessions (used for developer logins). |
| **Event trigger** | Fires on DDL (`ddl_command_end`); ours grants GeoServer read access to each new table. |
| **Least privilege** | GeoServer's role is read-only and cannot see schema `auth`. |

## Before / after
Before: 8 stores, each with its own pool and its own copy of the credentials.
After: 1 pool (max 10) shared by all; the password lives only in Tomcat's context file; stores just say `jndiReferenceName`.

## Likely interview questions
1. **Why JNDI instead of per-store connections?** One pool is governed centrally (limit, validation, eviction); credentials leave the app config; stores become cheap.
2. **Why `validationInterval`?** Validating on every borrow adds a round trip to every request on a high-latency link.
3. **Why a bigger `fetch size`?** Each fetch is a round trip; fewer, larger fetches mean fewer ~250 ms waits.
4. **Why not only PgBouncer?** PgBouncer bounds the database side, JNDI bounds the application side. Both layers together.
5. **"too many clients" vs "too many connections for role"?** Global `max_connections` vs per-role limit; per-role limits stop one project starving others.
6. **How do connections get released automatically?** Evictor in the app (`timeBetweenEvictionRunsMillis`, `minEvictableIdleTimeMillis`), `idle_session_timeout` in the DB, `server_idle_timeout` in PgBouncer.

## Lab
```sql
SELECT * FROM public.connection_usage();
SELECT usename, application_name, state, count(*) FROM pg_stat_activity WHERE usename LIKE 'upavp_geo_%' GROUP BY 1,2,3;
```
Browse the map, run it again: GeoServer shows as `geoserver-upavp-jndi`, never more than 10. Wait 2+ minutes idle and it falls back to `minIdle`.
