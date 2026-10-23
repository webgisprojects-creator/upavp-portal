#!/usr/bin/env python3
"""Add (or update) ONE JNDI DataSource <Resource> in Tomcat's context descriptor for the GeoServer web application.

Run ON THE GEOSERVER HOST as root; the database password is read from standard input (never from the command line):

    python3 add_jndi_resource.py --context /var/lib/tomcat9/conf/Catalina/localhost/geoserver.xml \
        --name jdbc/upavp_geo --url jdbc:postgresql://27.100.38.132:6432/upavp_geo_geoserver --user upavp_geo_geoserver < password-file

Idempotent: running it again replaces the same <Resource> instead of adding a second one. The result is parsed as XML BEFORE anything is
written, because a malformed descriptor would stop Tomcat from deploying GeoServer.

JNDI in one paragraph: JNDI (Java Naming and Directory Interface) is a registry inside the application server. Tomcat creates a
javax.sql.DataSource (a connection pool) ONCE, under the name  java:comp/env/jdbc/upavp_geo  (the "ENC", Environment Naming Context). Any
GeoServer store that says  jndiReferenceName = java:comp/env/jdbc/upavp_geo  borrows connections from that single shared pool - so ten
stores no longer mean ten pools, and the credentials live in the server configuration, not in each store.
"""
import argparse
import re
import sys
import xml.etree.ElementTree as ET
from xml.sax.saxutils import quoteattr

# Tomcat JDBC Connection Pool attributes (org.apache.tomcat.jdbc.pool.DataSourceFactory) - each one explained.
POOL = [
    ("initialSize", "2", "connections opened at start-up"),
    ("minIdle", "2", "never shrink below this: a NEW connection costs about 2 s over the 244 ms link, so keep a few warm"),
    ("maxIdle", "6", "idle connections above this are closed"),
    ("maxActive", "10", "HARD cap on connections in use (must stay at or below PgBouncer pool_size 10 and the role limit 15)"),
    ("maxWait", "30000", "ms a request WAITS for a free connection before failing (queueing instead of an instant error)"),
    ("testOnBorrow", "true", "validate a connection before handing it out"),
    ("validationQuery", "SELECT 1", "the cheap query used for validation"),
    ("validationInterval", "30000", "validate at most once per 30 s per connection (otherwise EVERY borrow costs an extra 244 ms round trip)"),
    ("testWhileIdle", "true", "the evictor also validates idle connections"),
    ("timeBetweenEvictionRunsMillis", "30000", "the evictor thread runs every 30 s"),
    ("minEvictableIdleTimeMillis", "120000", "an idle connection above minIdle is closed after 2 min: AUTOMATIC RELEASE"),
    ("removeAbandoned", "true", "reclaim connections that a request forgot to return (leak protection)"),
    ("removeAbandonedTimeout", "120", "seconds in use before a connection counts as abandoned"),
    ("logAbandoned", "true", "log the stack trace of the code that leaked it"),
    ("defaultReadOnly", "true", "every connection is read-only at JDBC level too (belt and braces next to the read-only role)"),
    ("jdbcInterceptors", "ConnectionState;StatementFinalizer", "reset connection state on return, close forgotten statements"),
    ("jmxEnabled", "true", "pool statistics visible over JMX"),
    ("connectionProperties", "ApplicationName=geoserver-upavp-jndi;tcpKeepAlive=true",
     "shows as application_name in pg_stat_activity; TCP keep-alive detects dead links over the WAN"),
]


def build_resource(name: str, url: str, user: str, password: str) -> str:
    # NB: XML does not allow comments INSIDE a tag, so all explanations sit in one comment block above the element.
    doc = [f'  <!-- JNDI DataSource "{name}" (java:comp/env/{name}): ONE shared, read-only pool for every upavp_geo store.',
           "       Pool settings (Tomcat JDBC pool):"]
    doc += [f"         {key} = {value}: {why}" for key, value, why in POOL]
    doc.append("  -->")
    fixed = [
        ("name", name), ("auth", "Container"), ("type", "javax.sql.DataSource"),
        ("factory", "org.apache.tomcat.jdbc.pool.DataSourceFactory"), ("driverClassName", "org.postgresql.Driver"),
        ("url", url), ("username", user), ("password", password),
    ]
    attrs = [f"      {key}={quoteattr(value)}" for key, value in fixed + [(k, v) for k, v, _ in POOL]]
    return "\n".join(doc + ["  <Resource"] + attrs + ["  />"])


def existing_pattern(name: str):
    """The comment block + <Resource> element this script wrote earlier."""
    return re.compile(
        r'[ \t]*<!-- JNDI DataSource "' + re.escape(name) + r'".*?-->\s*<Resource\b[^>]*?name="' + re.escape(name) + r'"[^>]*?/>[ \t]*\n?',
        re.S)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--context", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--user", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    password = sys.stdin.readline().strip()
    if not password:
        print("ERROR: no password on stdin", file=sys.stderr)
        return 2

    text = open(a.context, encoding="utf-8").read()
    block = build_resource(a.name, a.url, a.user, password)
    pattern = existing_pattern(a.name)
    if pattern.search(text):
        new_text = pattern.sub(lambda _m: block + "\n", text, count=1)      # lambda: the password may contain backslashes
        action = "replaced the existing resource"
    else:
        if "</Context>" not in text:
            print("ERROR: no </Context> in the descriptor", file=sys.stderr)
            return 2
        new_text = text.replace("</Context>", block + "\n</Context>", 1)
        action = "added a new resource"

    ET.fromstring(new_text.encode("utf-8"))                  # raises if the result is not well-formed XML -> nothing is written
    if a.dry_run:
        print("DRY RUN - would write (password masked):\n" + re.sub(r'password="[^"]*"', 'password="***"', block))
        return 0
    with open(a.context, "w", encoding="utf-8") as f:       # in place: keeps the file's owner and mode (root:tomcat 640)
        f.write(new_text)
    print(f"{action}: {a.name} -> {a.url} as {a.user}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
