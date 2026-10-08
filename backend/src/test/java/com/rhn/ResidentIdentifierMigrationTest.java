package com.rhn;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class ResidentIdentifierMigrationTest {
    @Test
    void migration_preserves_tenant_choices_and_existing_patient_identifiers() throws Exception {
        String migration = "V1_100_0__resident_identifier_systems.sql";
        try (var standard = new ClassPathResource("db/migration/" + migration).getInputStream();
             var oracle = new ClassPathResource("db/oracle/" + migration).getInputStream()) {
            String oracleSql = new String(oracle.readAllBytes(), StandardCharsets.UTF_8)
                    .replace("modify (MATCH_SCORE null)", "alter column MATCH_SCORE drop not null");
            assertThat(oracleSql).isEqualTo(new String(standard.readAllBytes(), StandardCharsets.UTF_8));
        }
        var dataSource = new DriverManagerDataSource("jdbc:h2:mem:resident-identifier-migration-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(dataSource);
        String[] locations = {"classpath:db/migration", "classpath:db/local", "classpath:db/h2"};
        try {
            Flyway.configure().dataSource(dataSource).locations(locations).target("1.99.0").load().migrate();
            jdbc.update("""
                    INSERT INTO RHN_BD_DICT_DEF
                    SELECT 900001, 0, 'TENANT', 'TENANT:362387869790209', 362387869790209,
                        CD_DICT_DEF, NA_DICT_DEF, DES_DICT_DEF, SD_STATUS, DT_CREATED, ID_USER_CREATED,
                        DT_UPDATED, ID_USER_UPDATED, FG_SYS_MANAGED, ID_DICT_CAT
                    FROM RHN_BD_DICT_DEF WHERE CD_DICT_DEF = 'PI_IDENTIFIER_TYPE' AND CD_SCOPE = 'PLATFORM'
                    """);
            jdbc.update("""
                    INSERT INTO RHN_BD_DICT_ITEM VALUES (900002, 900001, '9', '本机构其他证件', '保持停用', 90, 'INACTIVE', null)
                    """);
            var before = jdbc.queryForList("SELECT * FROM RHN_PI_PAT_IDENT ORDER BY ID_PAT_IDENT");
            Flyway.configure().dataSource(dataSource).locations(locations).load().migrate();
            assertThat(jdbc.queryForList("SELECT * FROM RHN_PI_PAT_IDENT ORDER BY ID_PAT_IDENT")).isEqualTo(before);
            assertThat(jdbc.queryForObject("""
                    SELECT COUNT(*) FROM RHN_BD_DICT_ITEM i JOIN RHN_BD_DICT_DEF d ON d.ID_DICT_DEF = i.ID_DICT_DEF_DICT
                    WHERE d.CD_DICT_DEF = 'PI_RESIDENT_IDENTIFIER_SYSTEM' AND d.ID_TNT = 362387869790209
                        AND i.CD_DICT_ITEM = '9' AND i.NA_DICT_ITEM = '本机构其他证件' AND i.SD_STATUS = 'INACTIVE'
                    """, Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("""
                    SELECT COUNT(*) FROM RHN_BD_DICT_ITEM i JOIN RHN_BD_DICT_DEF d ON d.ID_DICT_DEF = i.ID_DICT_DEF_DICT
                    WHERE d.CD_DICT_DEF = 'PI_RESIDENT_IDENTIFIER_SYSTEM' AND d.CD_SCOPE = 'PLATFORM'
                    """, Integer.class)).isEqualTo(11);
        } finally {
            jdbc.execute("SHUTDOWN");
        }
    }
}
