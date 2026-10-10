package com.rhn;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class MedicationSafetyCategoryGovernanceMigrationTest {
    @Test
    void upgrading_existing_categories_preserves_flags_members_and_foreign_keys() throws Exception {
        String migration = "V1_105_0__medication_safety_category_governance.sql";
        Path resources = Path.of("src/main/resources/db");
        assertEquals(Files.readString(resources.resolve("migration").resolve(migration)),
                Files.readString(resources.resolve("oracle").resolve(migration)));
        String url = "jdbc:h2:mem:safety-governance-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        Flyway.configure().dataSource(url, "sa", "")
                .locations("classpath:db/migration", "classpath:db/h2", "classpath:db/local")
                .target("1.104.2").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var sql = connection.createStatement()) {
            sql.executeUpdate("""
                    insert into RHN_AUD_MED_SAFETY_CAT
                    (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, FG_SYSTEMIC_ONLY, DES_RATIONALE)
                    values (99101, 362387869790209, 'MIGRATION_CUSTOM', '自建分类', 'DRUG_INTERACTION', true, '原有分类依据')
                    """);
            sql.executeUpdate("""
                    insert into RHN_AUD_MED_SAFETY_CAT_MBR
                    (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, NA_MED_SNAP)
                    values (99102, 362387869790209, 99101, '原有药品成员')
                    """);
            Flyway.configure().dataSource(url, "sa", "")
                    .locations("classpath:db/migration", "classpath:db/h2", "classpath:db/local")
                    .load().migrate();
            try (var rows = sql.executeQuery("""
                    select c.FG_SYSIC_ONLY, m.NA_MED_SNAP, c.DES_RATNL from RHN_AUD_MED_SAFETY_CAT c
                    join RHN_AUD_MED_SAFETY_CAT_MBR m on m.ID_SAFETY_CAT = c.ID_SAFETY_CAT
                    where c.ID_SAFETY_CAT = 99101
                    """)) {
                assertTrue(rows.next());
                assertTrue(rows.getBoolean(1));
                assertEquals("原有药品成员", rows.getString(2));
                assertEquals("原有分类依据", rows.getString(3));
                assertFalse(rows.next());
            }
            assertThrows(java.sql.SQLException.class, () -> sql.executeUpdate("""
                    insert into RHN_AUD_MED_SAFETY_CAT_MBR
                    (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, NA_MED_SNAP)
                    values (99103, 362387869790209, 99104, '无效关联')
                    """));
        }
    }
}
