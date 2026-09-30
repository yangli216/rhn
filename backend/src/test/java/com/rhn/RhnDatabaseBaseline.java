package com.rhn;

import org.h2.tools.RunScript;

import javax.sql.DataSource;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/** One compressed seed-data snapshot per cached Spring application context. */
final class RhnDatabaseBaseline {
    private final DataSource dataSource;
    private byte[] compressedScript;

    RhnDatabaseBaseline(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    synchronized void restoreOrCapture() throws Exception {
        if (compressedScript == null) {
            compressedScript = capture();
            return;
        }
        try (Connection connection = connection(); var statement = connection.createStatement()) {
            statement.execute("DROP ALL OBJECTS");
            try (var input = new GZIPInputStream(new ByteArrayInputStream(compressedScript));
                 var reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
                RunScript.execute(connection, reader);
            }
        }
    }

    private byte[] capture() throws Exception {
        var bytes = new ByteArrayOutputStream();
        try (Connection connection = connection();
             var statement = connection.createStatement();
             var rows = statement.executeQuery("SCRIPT");
             var gzip = new GZIPOutputStream(bytes);
             var writer = new OutputStreamWriter(gzip, StandardCharsets.UTF_8)) {
            while (rows.next()) {
                writer.write(rows.getString(1));
                writer.write('\n');
            }
        }
        return bytes.toByteArray();
    }

    private Connection connection() throws Exception {
        Connection connection = dataSource.getConnection();
        if (!connection.getMetaData().getURL().startsWith("jdbc:h2:mem:rhn-")) {
            connection.close();
            throw new IllegalStateException("Database reset requires an isolated in-memory RHN test database");
        }
        return connection;
    }
}
