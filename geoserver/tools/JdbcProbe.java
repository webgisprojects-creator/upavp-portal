import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Scanner;

/**
 * Proves a JDBC connection path BEFORE GeoServer is pointed at it - using the very PostgreSQL driver GeoServer ships.
 *
 *   java -cp /var/lib/tomcat9/webapps/geoserver/WEB-INF/lib/postgresql-42.7.7.jar JdbcProbe.java <jdbc-url> <user> [schema.table ...] < password-file
 *
 * The password is read from standard input (never from the command line, where `ps` could show it).
 * Checks: login + read-only default, a PreparedStatement executed 12 times (the pgjdbc driver switches to SERVER-side prepared statements after
 * 5 executions - the classic way a connection pooler in transaction mode breaks), a write being refused, and which schemas are readable.
 */
public class JdbcProbe {
  public static void main(String[] args) throws Exception {
    String url = args[0];
    String user = args[1];
    String password = new Scanner(System.in).nextLine().trim();
    String probeTable = args.length > 2 ? args[2] : "pg_catalog.pg_class";

    long t0 = System.nanoTime();
    try (Connection c = DriverManager.getConnection(url, user, password)) {
      System.out.printf("connected in %d ms (new connection, includes TLS/auth round trips)%n", (System.nanoTime() - t0) / 1_000_000);

      try (Statement s = c.createStatement();
           ResultSet r = s.executeQuery("select current_user, current_database(), current_setting('default_transaction_read_only')")) {
        r.next();
        System.out.println("login: user=" + r.getString(1) + " database=" + r.getString(2) + " default_transaction_read_only=" + r.getString(3));
      }

      long rows = -1;
      long t1 = System.nanoTime();
      try (PreparedStatement ps = c.prepareStatement("select count(*) from " + probeTable + " where ? > 0")) {
        for (int i = 0; i < 12; i++) {
          ps.setInt(1, i + 1);
          try (ResultSet r = ps.executeQuery()) { r.next(); rows = r.getLong(1); }
        }
      }
      System.out.printf("PreparedStatement x12 on %s OK (rows=%d, %d ms)%n", probeTable, rows, (System.nanoTime() - t1) / 1_000_000);

      try (Statement s = c.createStatement()) {
        s.executeUpdate("create table public.jdbc_probe_must_fail(x int)");
        System.out.println("UNEXPECTED: a write succeeded - this role is NOT read-only!");
      } catch (SQLException e) {
        System.out.println("write correctly refused: SQLSTATE " + e.getSQLState() + " - " + e.getMessage().split("\n")[0]);
      }

      for (String schema : List.of("public", "agra", "ayodhya", "barabanki", "hardoi", "moradabad", "pratapgarh", "unnao", "auth")) {
        try (PreparedStatement ps = c.prepareStatement(
                 "select count(*) from information_schema.tables where table_schema = ? and table_type in ('BASE TABLE','VIEW')")) {
          ps.setString(1, schema);
          try (ResultSet r = ps.executeQuery()) {
            r.next();
            System.out.printf("  schema %-11s readable tables/views: %d%n", schema, r.getLong(1));
          }
        }
      }
    }
  }
}
