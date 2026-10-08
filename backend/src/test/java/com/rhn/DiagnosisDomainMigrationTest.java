package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import java.sql.DriverManager;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class DiagnosisDomainMigrationTest {
    @Test void migrationRemovesDefaultsWithoutGuessingHistoricalDomains() throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:h2:mem:diagnosis-domain-" + UUID.randomUUID());
             var sql = connection.createStatement()) {
            for (String table : new String[]{"RHN_VIS_ENC_DIAG", "RHN_VIS_ENC_DIAG_REV"}) {
                sql.execute("create table " + table + " (ID bigint primary key, SD_DIAG_DOMAIN varchar(32) default 'WESTERN_MEDICINE' not null)");
                sql.execute("insert into " + table + " values (1, 'TCM_DISEASE'), (2, 'WESTERN_MEDICINE')");
            }
            String migration = new ClassPathResource("db/migration/V1_101_0__diagnosis_unknown_domain.sql")
                    .getContentAsString(StandardCharsets.UTF_8);
            for (String statement : migration.split(";")) if (!statement.isBlank()) sql.execute(statement);
            for (String table : new String[]{"RHN_VIS_ENC_DIAG", "RHN_VIS_ENC_DIAG_REV"}) {
                sql.execute("insert into " + table + " (ID) values (3)");
                sql.execute("insert into " + table + " values (4, null)");
                try (var rows = sql.executeQuery("select SD_DIAG_DOMAIN from " + table + " order by ID")) {
                    assertTrue(rows.next()); assertEquals("TCM_DISEASE", rows.getString(1));
                    assertTrue(rows.next()); assertEquals("WESTERN_MEDICINE", rows.getString(1));
                    assertTrue(rows.next()); assertNull(rows.getString(1));
                    assertTrue(rows.next()); assertNull(rows.getString(1));
                }
            }
        }
    }
}
