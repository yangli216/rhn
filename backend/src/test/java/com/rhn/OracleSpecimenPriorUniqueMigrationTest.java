package com.rhn;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Oracle 把 unique (ID_TNT, ID_SPEC_PRIOR) 中 (租户, 空) 视为重复键，同租户第二个首次采集标本会触发 ORA-00001；
 * H2/PostgreSQL 把空值视为互不相同，集成测试无法暴露，因此静态守护 Oracle 修复迁移。
 */
class OracleSpecimenPriorUniqueMigrationTest {
    private static final Path MIGRATION = Path.of("src/main/resources/db/oracle/B1_130_0__rhn_schema_and_metadata.sql");

    @Test
    void replaces_the_plain_unique_constraint_with_an_index_that_ignores_rows_without_a_prior_specimen() throws IOException {
        String sql = Files.readString(MIGRATION).replaceAll("(?m)^--.*$", "").replaceAll("\\s+", " ").toUpperCase();
        assertThat(sql).contains("ALTER TABLE RHN_EX_DIAG_SPEC DROP CONSTRAINT UK_EX_SPEC_PRIOR");
        assertThat(sql).contains("CREATE UNIQUE INDEX IDX_EX_DIAG_SPEC_UK_PRIOR ON RHN_EX_DIAG_SPEC");
        assertThat(sql).contains("CASE WHEN ID_SPEC_PRIOR IS NOT NULL THEN ID_TNT END");
        assertThat(sql).contains("CASE WHEN ID_SPEC_PRIOR IS NOT NULL THEN ID_SPEC_PRIOR END");
    }
}
